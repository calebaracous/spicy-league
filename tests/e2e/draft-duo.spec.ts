import { expect, test, type Page } from "@playwright/test";

import * as schema from "../../src/db/schema";
import {
  countMatches,
  db,
  getCaptainTeams,
  getDraft,
  getMatches,
  getPicks,
  getSeason,
  getSignupKind,
  getSubRequests,
  getTeams,
  userIdsByUsername,
} from "./support/db";
import {
  adminDraft,
  anonymousPage,
  board,
  closeContexts,
  signedInPage,
  SSE_TIMEOUT,
} from "./support/pages";
import { admin, player, run, seasonSlug, seedRiotLink, seedSignups } from "./support/seed";

/**
 * Duo captains, end to end, through the real UI. One season with a mix of
 * team shapes — two duo teams and one solo team:
 *
 *   team 1: P1 & P2 (duo, 3 picks)   team 2: P3 (solo, 4 picks)
 *   team 3: P4 & P5 (duo, 3 picks)
 *
 * P6–P15 are the draft pool (10 picks). P16 signs up through the form as
 * "Sub only": never in the pool, listed as an available sub afterwards.
 *
 * Covers: pair / split / move / remove on the admin captains panel, the
 * captain lock once the draft starts, either duo captain picking (credited
 * to the team's primary), a full team sitting out the last round, teams of
 * five with both duo captains as captains, standings names, and a sub
 * request from the non-primary duo captain approved by the admin.
 */

// Snake for teams with [3, 4, 3] picks, by team (1-based). Written out by
// hand: an independent oracle for snakeOrder. Team 2 (solo) takes the last
// pick alone once both duos are full.
const ORDER = [1, 2, 3, 3, 2, 1, 1, 2, 3, 2];

test.afterEach(closeContexts);

test("duo captains: setup, draft, teams and subs", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const slug = seasonSlug("duo");
  const seasonName = `E2E Duo ${run().id}`;
  const P = player;

  // Season straight into signups_open (no close date, so regular signups —
  // and the sub-only choice — are open). P1–P15 are seeded signups.
  const [season] = await db
    .insert(schema.seasons)
    .values({ name: seasonName, slug, game: "lol", state: "signups_open" })
    .returning({ id: schema.seasons.id });
  await seedSignups(
    season.id,
    Array.from({ length: 15 }, (_, i) => i + 1),
  );

  const adminPage = await signedInPage(browser, admin().username);
  const signups = `/admin/seasons/${slug}/signups`;

  const transition = async (label: string, state: string) => {
    await adminPage.goto(`/admin/seasons/${slug}`);
    adminPage.once("dialog", (d) => d.accept());
    await adminPage.getByRole("button", { name: `→ ${label}` }).click();
    await expect.poll(async () => (await getSeason(slug)).state).toBe(state);
  };

  // Captain-panel helpers. Captain rows are <li>s in the Captains card; the
  // roster below is a table, so <li> scoping keeps them apart.
  //
  // Each action redirects to ?saved=…, which FlashToast turns into a toast and
  // then strips. Wait for the strip before the next click: otherwise the next
  // waitForURL matches the *previous* flag at once, and the previous toast
  // (still mounted) swallows the next one.
  const settle = () => expect(adminPage).not.toHaveURL(/[?&]saved=/);
  const captainItem = (n: number) => adminPage.locator("li").filter({ hasText: P(n).name });
  const makeCaptain = async (n: number) => {
    await settle();
    await adminPage
      .getByRole("row")
      .filter({ hasText: P(n).name })
      .getByRole("button", { name: "Make captain" })
      .click();
    await adminPage.waitForURL(/[?&](saved|error)=/);
  };
  const pair = async (n: number, partner: number) => {
    await settle();
    const select = adminPage.getByLabel(`Duo partner for ${P(n).name}`);
    await select.selectOption({ label: P(partner).name });
    await adminPage
      .locator("form")
      .filter({ has: select })
      .getByRole("button", { name: "Pair", exact: true })
      .click();
    await adminPage.waitForURL(/[?&](saved|error)=/);
  };
  const clickIn = async (n: number, label: "Split" | "Remove") => {
    await settle();
    await captainItem(n).getByRole("button", { name: label, exact: true }).click();
    await adminPage.waitForURL(/[?&](saved|error)=/);
  };
  const teamsAre = (expected: number[][]) =>
    expect
      .poll(() => getCaptainTeams(slug))
      .toEqual(expected.map((t) => t.map((n) => P(n).username)));

  // ── Signups ──────────────────────────────────────────────────────────────
  await test.step("P16 signs up as sub only through the form", async () => {
    await seedRiotLink(16);
    const page = await signedInPage(browser, P(16).username);
    await page.goto(`/seasons/${slug}/signup`);
    await expect(page.getByRole("radio", { name: /Play in the draft/ })).toBeChecked();
    await page.getByRole("radio", { name: /Sub only/ }).check();
    await page.getByLabel("Primary role").selectOption("support");
    await page.getByLabel("Moral quandary").fill("No, never.");
    await page.getByRole("button", { name: "Submit signup" }).click();
    await page.waitForURL(`**/seasons/${slug}?signed-up=sub`);
    await expect(page.getByText(`You're on the sub list for ${seasonName}.`)).toBeVisible();
    await expect(page.getByText(/You signed up as a sub, so you won't be drafted/)).toBeVisible();
    expect(await getSignupKind(slug, P(16).username)).toBe("sub");
    await page.context().close();
  });

  await test.step("admin closes signups", () => transition("Signups closed", "signups_closed"));

  // ── Captains ─────────────────────────────────────────────────────────────
  await test.step("admin promotes 5 captains; a sub-only signup can't be one", async () => {
    await adminPage.goto(signups);
    for (const n of [1, 2, 3, 4, 5]) await makeCaptain(n);
    await teamsAre([[1], [2], [3], [4], [5]]);
    await expect(
      adminPage
        .getByRole("row")
        .filter({ hasText: P(16).name })
        .getByRole("button", { name: "Make captain" }),
    ).toHaveCount(0);
  });

  await test.step("pairing, splitting, moving and removing keep duos together", async () => {
    await pair(1, 2);
    // FlashToast auto-dismisses after a few seconds: check it before polling.
    await expect(adminPage.getByText("Duo captains paired.")).toBeVisible();
    await teamsAre([[1, 2], [3], [4], [5]]);

    await pair(4, 5);
    await teamsAre([[1, 2], [3], [4, 5]]);

    // Duo captains have no "Pair with…", and the last solo captain has nobody
    // left to pair with, so no menu at all.
    for (const n of [1, 3, 5]) {
      await expect(adminPage.getByLabel(`Duo partner for ${P(n).name}`)).toHaveCount(0);
    }

    // Split P2 off: P2 becomes a solo team at the end; re-pair.
    await clickIn(2, "Split");
    await teamsAre([[1], [3], [4, 5], [2]]);
    await pair(1, 2);
    await teamsAre([[1, 2], [3], [4, 5]]);

    // Moving a duo moves both captains: team 3 up, then back down.
    await settle();
    await adminPage.getByRole("button", { name: "↑" }).nth(2).click();
    await adminPage.waitForURL(/[?&]saved=/);
    await teamsAre([[1, 2], [4, 5], [3]]);
    await settle();
    await adminPage.getByRole("button", { name: "↓" }).nth(1).click();
    await adminPage.waitForURL(/[?&]saved=/);
    await teamsAre([[1, 2], [3], [4, 5]]);

    // Removing one of a duo leaves the partner as a solo captain.
    await clickIn(5, "Remove");
    await teamsAre([[1, 2], [3], [4]]);
    await makeCaptain(5);
    await pair(4, 5);
    await teamsAre([[1, 2], [3], [4, 5]]);
  });

  await test.step("captains page and admin draft page show the duos", async () => {
    await transition("Captains selected", "captains_selected");
    const spectator = await anonymousPage(browser);
    await spectator.goto(`/seasons/${slug}/captains`);
    const duoRow = spectator.locator("li").filter({ hasText: P(1).name });
    await expect(duoRow).toContainText(P(2).name);
    await expect(duoRow.getByText("Duo", { exact: true })).toBeVisible();
    await expect(
      spectator
        .locator("li")
        .filter({ hasText: P(3).name })
        .getByText("Duo", { exact: true }),
    ).toHaveCount(0);

    await adminDraft.open(adminPage, slug);
    await expect(adminPage.getByText(/3 teams · 0 \/ 10\s+picks/)).toBeVisible();
    await expect(adminPage.getByText("3 picks", { exact: true })).toHaveCount(2);
    await expect(adminPage.getByText("4 picks", { exact: true })).toHaveCount(1);
  });

  await test.step("admin starts the draft; captains are locked", async () => {
    await adminDraft.click(adminPage, slug, "Start draft");
    expect((await getDraft(slug))?.state).toBe("in_progress");

    await adminPage.goto(signups);
    await clickIn(2, "Split");
    await expect(adminPage).toHaveURL(/error=captains-locked/);
    await expect(adminPage.locator('[data-slot="alert"]')).toContainText(
      "Captains can't change once the draft has started",
    );
    await teamsAre([[1, 2], [3], [4, 5]]);
  });

  // ── Draft ────────────────────────────────────────────────────────────────
  const TEAMS = [{ captains: [P(1), P(2)] }, { captains: [P(3)] }, { captains: [P(4), P(5)] }].map(
    (t) => ({ ...t, name: t.captains.map((c) => c.name).join(" & ") }),
  );

  const pages = new Map<string, Page>();
  for (const n of [1, 2, 3, 4, 5]) {
    const page = await signedInPage(browser, P(n).username);
    await board.open(page, slug);
    pages.set(P(n).username, page);
  }
  const spectator = await anonymousPage(browser);
  await board.open(spectator, slug);

  await test.step("the board shows one column per team with duo badges", async () => {
    for (const t of TEAMS) await expect(spectator.getByText(t.name).first()).toBeVisible();
    await expect(spectator.getByText("Duo", { exact: true })).toHaveCount(2);
  });

  const queue = Array.from({ length: 10 }, (_, i) => P(i + 6)); // P6..P15
  const picksMade = new Map<number, number>(); // team index → picks so far

  for (let n = 1; n <= ORDER.length; n++) {
    const teamIdx = ORDER[n - 1] - 1;
    const team = TEAMS[teamIdx];
    // Alternate which duo captain clicks, so both halves of each duo pick.
    const made = picksMade.get(teamIdx) ?? 0;
    const picker = team.captains[made % team.captains.length];
    const picked = queue.shift()!;

    await test.step(`pick ${n}: ${picker.name} for ${team.name} takes ${picked.name}`, async () => {
      await expect(board.onClock(spectator)).toHaveText(team.name, { timeout: SSE_TIMEOUT });
      for (const t of TEAMS) {
        for (const c of t.captains) {
          const page = pages.get(c.username)!;
          const mine = t === team;
          // Wait until this board has the previous pick. At a snake turn the
          // same team stays on the clock, so the on-clock text alone can't tell
          // a stale board apart — and a click from one is rejected as
          // stale-pick (by design: it's the double-click guard). This matters
          // for duos: the partner's board must catch up before they pick.
          await expect(page.getByText(`Pick ${n} / ${ORDER.length}`, { exact: true })).toBeVisible({
            timeout: SSE_TIMEOUT,
          });
          await expect(board.onClock(page)).toHaveText(team.name, { timeout: SSE_TIMEOUT });
          // Both duo captains get Pick buttons and the "Your pick" alert.
          if (mine) {
            await expect(board.pickButtons(page).first()).toBeVisible();
            await expect(page.getByText("Your pick", { exact: true })).toBeVisible();
          } else {
            await expect(board.pickButtons(page)).toHaveCount(0);
          }
        }
      }

      await board.pick(pages.get(picker.username)!, picked.name);
      await expect(board.logEntry(spectator, n)).toContainText(`picks ${picked.name}`, {
        timeout: SSE_TIMEOUT,
      });
      const last = (await getPicks(slug)).at(-1)!;
      expect(last.pickNumber).toBe(n);
      expect(last.picked).toBe(picked.username);
      // Credited to the team's primary captain, whichever duo captain clicked.
      expect(last.captain).toBe(team.captains[0].username);
      picksMade.set(teamIdx, made + 1);
    });
  }

  await test.step("draft completes into teams of five", async () => {
    await expect.poll(async () => (await getDraft(slug))?.state).toBe("completed");
    expect((await getSeason(slug)).state).toBe("group_stage");

    const picks = await getPicks(slug);
    expect(picks.map((p) => p.captain)).toEqual(
      ORDER.map((o) => TEAMS[o - 1].captains[0].username),
    );

    const teams = await getTeams(slug);
    expect(teams.size).toBe(3);
    for (const t of TEAMS) {
      const row = teams.get(t.captains[0].username)!;
      expect(row, `team for ${t.name}`).toBeDefined();
      expect(row.name).toBe(`Team ${t.name}`);
      expect(row.members).toHaveLength(5);
      expect(row.captains.sort()).toEqual(t.captains.map((c) => c.username).sort());
    }
    const everyone = [...teams.values()].flatMap((t) => t.members.map((m) => m.username));
    expect(new Set(everyone).size).toBe(15);
    expect(everyone).not.toContain(P(16).username);
  });

  await test.step("teams page marks both duo captains and lists the sub", async () => {
    await spectator.goto(`/seasons/${slug}/teams`);
    const duo = spectator.getByRole("region", { name: `Team ${TEAMS[0].name}` });
    for (const c of TEAMS[0].captains) {
      await expect(duo.locator("li").filter({ hasText: c.name })).toContainText("C");
    }
    const subs = spectator.locator("li").filter({ hasText: P(16).name });
    await expect(subs.getByText("Sub list", { exact: true })).toBeVisible();
  });

  await test.step("schedule and standings name both duo captains", async () => {
    await adminPage.goto(`/admin/seasons/${slug}/matches`);
    await adminPage.getByRole("button", { name: /Generate schedule/ }).click();
    await expect.poll(() => countMatches(slug)).toBe(3);
    await spectator.goto(`/seasons/${slug}/matches`);
    await expect(spectator.getByText(`(${TEAMS[0].name})`).first()).toBeVisible();
    await expect(spectator.getByText(`(${TEAMS[2].name})`).first()).toBeVisible();
  });

  await test.step("the non-primary duo captain requests a sub; admin approves", async () => {
    const teams = await getTeams(slug);
    const duo = teams.get(P(1).username)!;
    const match = (await getMatches(slug)).find(
      (m) => m.homeTeamId === duo.id || m.awayTeamId === duo.id,
    )!;
    const matchUrl = `/seasons/${slug}/matches/${match.id}`;

    // A drafted (non-captain) member of the duo team can't request subs.
    const memberUsername = duo.members.find((m) => m.pickNumber !== null)!.username;
    const member = Array.from({ length: 15 }, (_, i) => P(i + 1)).find(
      (p) => p.username === memberUsername,
    )!;
    const memberPage = await signedInPage(browser, member.username);
    await memberPage.goto(matchUrl);
    await expect(memberPage.getByText("Request a sub", { exact: true })).toHaveCount(0);

    const p2 = await signedInPage(browser, P(2).username);
    await p2.goto(matchUrl);
    await expect(p2.getByText("Request a sub", { exact: true })).toBeVisible();
    // P16 has no linked Riot account, so no rank between name and tag.
    await p2.getByLabel("Sub in").selectOption({ label: `${P(16).name} · sub list` });
    await p2.getByLabel("Sitting out").selectOption({ label: member.name });
    await p2.getByLabel("Reason").fill("E2E duo captain request");
    await p2.getByRole("button", { name: "Request sub", exact: true }).click();
    await p2.waitForURL(/saved=sub-requested/);

    const ids = await userIdsByUsername([P(2).username, P(16).username, member.username]);
    const [req] = await getSubRequests(match.id);
    expect(req.teamId).toBe(duo.id);
    expect(req.subUserId).toBe(ids.get(P(16).username));
    expect(req.replacedUserId).toBe(ids.get(member.username));
    expect(req.requestedBy).toBe(ids.get(P(2).username));
    expect(req.status).toBe("pending");

    await adminPage.goto(matchUrl);
    await adminPage.getByRole("button", { name: "Approve", exact: true }).click();
    await adminPage.waitForURL(/saved=sub-approved/);
    expect((await getSubRequests(match.id))[0].status).toBe("approved");
  });
});
