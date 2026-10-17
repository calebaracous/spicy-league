import { expect, test, type Page } from "@playwright/test";

import {
  countMatches,
  getCaptainOrder,
  getDraft,
  getPicks,
  getSeason,
  getTeams,
} from "./support/db";
import {
  adminDraft,
  anonymousPage,
  board,
  closeContexts,
  freezeLiveUpdates,
  signedInPage,
  SSE_TIMEOUT,
} from "./support/pages";
import { admin, player, run, seasonSlug, seedRiotLink, seedSignups } from "./support/seed";

/**
 * Full season draft, end to end, through the real UI:
 * create season → signups → captains → snake draft (16 picks, 4 captains)
 * with pause/resume, undo, admin pick and stale-page rejections mixed in →
 * teams formed → schedule generated.
 *
 * Players 1–4 become captains (4 is moved above 3), 5–20 are the pool,
 * player 20 signs up through the form, the rest are seeded.
 */

// Snake order for 4 captains, by captain *order* (1-based). Written out by hand
// on purpose — an independent oracle for snakeOrder.
const SNAKE_4 = [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1];

test.afterEach(closeContexts);

test("season draft end to end", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const slug = seasonSlug("draft");
  const seasonName = `E2E Draft ${run().id}`;
  const P = player;

  const adminPage = await signedInPage(browser, admin().username);

  // ── Setup ────────────────────────────────────────────────────────────────
  await test.step("admin creates the season", async () => {
    await adminPage.goto("/admin/seasons/new");
    await adminPage.getByLabel("Name", { exact: true }).fill(seasonName);
    await adminPage.getByLabel("Slug", { exact: true }).fill(slug);
    await adminPage.getByLabel("Game", { exact: true }).selectOption("lol");
    await adminPage.getByRole("button", { name: "Create draft" }).click();
    await adminPage.waitForURL(`**/admin/seasons/${slug}`);
    expect((await getSeason(slug)).state).toBe("draft");
  });

  const transition = async (label: string, state: string) => {
    await adminPage.goto(`/admin/seasons/${slug}`);
    // Lifecycle moves ask for confirmation (ConfirmSubmitButton).
    adminPage.once("dialog", (d) => d.accept());
    await adminPage.getByRole("button", { name: `→ ${label}` }).click();
    await expect.poll(async () => (await getSeason(slug)).state).toBe(state);
  };

  await test.step("admin opens signups", () => transition("Signups open", "signups_open"));

  await test.step("a player signs up through the signup form", async () => {
    const page = await signedInPage(browser, P(20).username);
    // LoL signups need a linked Riot account: no form until there is one.
    await page.goto(`/seasons/${slug}/signup`);
    await expect(page.getByText(/Link your Riot account before signing up/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit signup" })).toHaveCount(0);
    await seedRiotLink(20);
    await page.goto(`/seasons/${slug}/signup`);
    await page.getByLabel("Primary role").selectOption("mid");
    await page.getByLabel("Secondary role").selectOption("top");
    await page.getByLabel("Moral quandary").fill("No, never.");
    await page.getByRole("button", { name: "Submit signup" }).click();
    await page.waitForURL(`**/seasons/${slug}?signed-up=1`);
    // Success is a toast now (FlashToast), not an inline alert.
    await expect(page.getByText(`You're signed up for ${seasonName}.`)).toBeVisible();
    await page.context().close();
  });

  await test.step("19 more signups are seeded", async () => {
    const season = await getSeason(slug);
    await seedSignups(
      season.id,
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
  });

  await test.step("admin closes signups", () => transition("Signups closed", "signups_closed"));

  await test.step("admin promotes 4 captains and reorders them", async () => {
    await adminPage.goto(`/admin/seasons/${slug}/signups`);
    for (const n of [1, 2, 3, 4]) {
      const row = adminPage.getByRole("row").filter({ hasText: P(n).name });
      await row.getByRole("button", { name: "Make captain" }).click();
      await expect
        .poll(() => getCaptainOrder(slug))
        .toEqual([1, 2, 3, 4].slice(0, n).map((i) => P(i).username));
    }
    // Move captain #4 up one slot: order becomes P1, P2, P4, P3.
    await adminPage.getByRole("button", { name: "↑" }).nth(3).click();
    await expect
      .poll(() => getCaptainOrder(slug))
      .toEqual([P(1), P(2), P(4), P(3)].map((p) => p.username));
  });

  await test.step("admin marks captains selected and starts the draft", async () => {
    await transition("Captains selected", "captains_selected");
    await adminDraft.click(adminPage, slug, "Start draft");
    expect((await getDraft(slug))?.state).toBe("in_progress");
    expect((await getSeason(slug)).state).toBe("drafting");
  });

  // ── Draft ────────────────────────────────────────────────────────────────
  const captainByOrder = [P(1), P(2), P(4), P(3)]; // index = captainOrder - 1
  const captainPages = new Map<string, Page>();
  for (const c of captainByOrder) {
    const page = await signedInPage(browser, c.username);
    await board.open(page, slug);
    captainPages.set(c.username, page);
  }
  const spectator = await anonymousPage(browser);
  await board.open(spectator, slug);
  const adminBoard = await adminPage.context().newPage();
  await board.open(adminBoard, slug);

  const queue = Array.from({ length: 16 }, (_, i) => P(i + 5)); // P5..P20
  const latencies: number[] = [];
  let undoDone = false;

  const expectBoardsShowOnClock = async (captainName: string) => {
    for (const page of [spectator, ...captainPages.values()]) {
      await expect(board.onClock(page)).toHaveText(captainName, { timeout: SSE_TIMEOUT });
    }
  };

  /** Make pick `n` from `pickerPage` and wait for a spectator to see it. */
  const makePick = async (n: number, pickerPage: Page) => {
    const captain = captainByOrder[SNAKE_4[n - 1] - 1];
    const picked = queue.shift()!;
    const t0 = Date.now();
    await board.pick(pickerPage, picked.name);
    await expect(board.logEntry(spectator, n)).toContainText(
      `${captain.name} picks ${picked.name}`,
      { timeout: SSE_TIMEOUT },
    );
    latencies.push(Date.now() - t0);
    const picks = await getPicks(slug);
    expect(picks).toHaveLength(n);
    expect(picks[n - 1]).toEqual({
      pickNumber: n,
      captain: captain.username,
      picked: picked.username,
    });
    return picked;
  };

  for (let n = 1; n <= 16; n++) {
    const captain = captainByOrder[SNAKE_4[n - 1] - 1];
    const captainPage = captainPages.get(captain.username)!;

    await test.step(`pick ${n}: ${captain.name} is on the clock`, async () => {
      await expectBoardsShowOnClock(captain.name);
      await expect(captainPage.getByText("Your pick", { exact: true })).toBeVisible();
      await expect(board.pickButtons(captainPage).first()).toBeVisible();
      for (const [username, page] of captainPages) {
        if (username !== captain.username) await expect(board.pickButtons(page)).toHaveCount(0);
      }
    });

    if (n === 3) {
      await test.step("a captain whose turn has passed is rejected (not-your-turn)", async () => {
        const stale = await signedInPage(browser, captain.username);
        await freezeLiveUpdates(stale);
        await board.open(stale, slug);
        await expect(board.pickButtons(stale).first()).toBeVisible();
        await makePick(3, captainPage);
        await board.pick(stale, queue[0].name);
        await expect(board.alert(stale)).toContainText("It isn't your pick.");
        expect(await getPicks(slug)).toHaveLength(3);
        await stale.context().close();
      });
      continue;
    }

    if (n === 5) {
      await test.step("pausing blocks picks; resuming restores them (not-running)", async () => {
        const stale = await signedInPage(browser, captain.username);
        await freezeLiveUpdates(stale);
        await board.open(stale, slug);
        await expect(board.pickButtons(stale).first()).toBeVisible();
        await adminDraft.click(adminPage, slug, "Pause");
        await expect(spectator.getByText("The draft is paused by an admin.")).toBeVisible({
          timeout: SSE_TIMEOUT,
        });
        await expect(board.pickButtons(captainPage)).toHaveCount(0, { timeout: SSE_TIMEOUT });
        await board.pick(stale, queue[0].name);
        await expect(board.alert(stale)).toContainText("The draft isn't active right now.");
        expect(await getPicks(slug)).toHaveLength(4);
        expect((await getDraft(slug))?.state).toBe("paused");
        await stale.context().close();
        await adminDraft.click(adminPage, slug, "Resume");
        await expectBoardsShowOnClock(captain.name);
      });
    }

    if (n === 9) {
      await test.step("admin makes pick 9 on the captain's behalf", async () => {
        await expect(adminBoard.getByText("Admin override", { exact: true })).toBeVisible({
          timeout: SSE_TIMEOUT,
        });
        await makePick(9, adminBoard);
      });
      continue;
    }

    if (n === 10) {
      await test.step("a player picked moments ago can't be picked again (already-picked)", async () => {
        const staleAdmin = await adminPage.context().newPage();
        await freezeLiveUpdates(staleAdmin);
        await board.open(staleAdmin, slug);
        const picked = await makePick(10, captainPage);
        await board.pick(staleAdmin, picked.name);
        await expect(board.alert(staleAdmin)).toContainText("That player has already been picked.");
        expect(await getPicks(slug)).toHaveLength(10);
        await staleAdmin.close();
      });
      continue;
    }

    await test.step(`pick ${n}`, () => makePick(n, captainPage).then(() => undefined));

    if (n === 6 && !undoDone) {
      undoDone = true;
      await test.step("admin undoes pick 6; the clock rewinds for everyone", async () => {
        const undone = (await getPicks(slug))[5];
        await adminDraft.click(adminPage, slug, "Undo last pick");
        await expect(board.logEntries(spectator)).toHaveCount(5, { timeout: SSE_TIMEOUT });
        await expectBoardsShowOnClock(captain.name);
        expect(await getPicks(slug)).toHaveLength(5);
        // The undone player is back in the pool; draft them last.
        const back = queue.length;
        queue.push(P(Number(undone.picked.slice(-2))));
        expect(queue).toHaveLength(back + 1);
        await expect(board.poolHeading(spectator)).toHaveText(`Available pool (${16 - 5})`, {
          timeout: SSE_TIMEOUT,
        });
      });
      n -= 1; // redo pick 6
    }

    if (n === 12) {
      await test.step("a spectator who reloads mid-draft sees the current state", async () => {
        await spectator.reload();
        await expect(board.logEntries(spectator)).toHaveCount(12);
      });
    }
  }

  test.info().annotations.push({
    type: "live-update latency",
    description: `pick → spectator: max ${Math.max(...latencies)}ms, median ${
      [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
    }ms over ${latencies.length} picks`,
  });

  // ── Completion ───────────────────────────────────────────────────────────
  await test.step("last pick completes the draft and forms teams", async () => {
    await expect(spectator.getByText("Draft complete — teams have been formed.")).toBeVisible({
      timeout: SSE_TIMEOUT,
    });
    const draft = await getDraft(slug);
    expect(draft?.state).toBe("completed");
    expect(draft?.completedAt).not.toBeNull();
    expect((await getSeason(slug)).state).toBe("group_stage");

    const picks = await getPicks(slug);
    expect(picks.map((p) => p.pickNumber)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(picks.map((p) => p.captain)).toEqual(SNAKE_4.map((o) => captainByOrder[o - 1].username));
    const pickedUsers = picks.map((p) => p.picked);
    expect(new Set(pickedUsers).size).toBe(16);
    for (const c of captainByOrder) expect(pickedUsers).not.toContain(c.username);

    const teams = await getTeams(slug);
    expect(teams.size).toBe(4);
    const allMembers = new Set<string>();
    for (const c of captainByOrder) {
      const team = teams.get(c.username);
      expect(team, `team for ${c.name}`).toBeDefined();
      expect(team!.name).toBe(`Team ${c.name}`);
      expect(team!.members).toHaveLength(5);
      const expected = picks
        .filter((p) => p.captain === c.username)
        .map((p) => ({ username: p.picked, pickNumber: p.pickNumber }));
      expect(team!.members.filter((m) => m.pickNumber !== null)).toEqual(
        expect.arrayContaining(expected),
      );
      team!.members.forEach((m) => allMembers.add(m.username));
    }
    expect(allMembers.size).toBe(20);
  });

  await test.step("season page shows the group stage", async () => {
    await spectator.goto(`/seasons/${slug}`);
    await expect(spectator.getByText("Group stage", { exact: true }).first()).toBeVisible();
  });

  await test.step("admin generates the round-robin schedule", async () => {
    await adminPage.goto(`/admin/seasons/${slug}/matches`);
    await adminPage.getByRole("button", { name: /Generate schedule/ }).click();
    await expect.poll(() => countMatches(slug)).toBe(6);
    await spectator.goto(`/seasons/${slug}/matches`);
    await expect(spectator.getByText("Standings", { exact: true })).toBeVisible();
    for (const c of captainByOrder) {
      await expect(spectator.getByText(`Team ${c.name}`).first()).toBeVisible();
    }
  });
});
