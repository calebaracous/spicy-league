import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { run } from "./seed";

/** Live-update poll is 2s; allow a few cycles plus network. */
export const SSE_TIMEOUT = 10_000;

// Contexts opened by these helpers; closed by `closeContexts()` after each test.
const opened: BrowserContext[] = [];

export async function closeContexts(): Promise<void> {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  opened.push(context);
  return context;
}

/** Fresh browser context signed in as `username` via the real /signin form. */
export async function signedInPage(browser: Browser, username: string): Promise<Page> {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(run().password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/profile");
  return page;
}

export async function anonymousPage(browser: Browser): Promise<Page> {
  const context = await newContext(browser);
  return context.newPage();
}

/** Block the draft SSE stream so the page keeps showing what it first
 *  rendered — lets a test click a button the live board would have hidden. */
export async function freezeLiveUpdates(page: Page): Promise<void> {
  await page.route("**/api/draft/**/stream", (route) => route.abort());
}

// ── Draft live board (/seasons/[slug]/draft) ────────────────────────────────

export const board = {
  open: async (page: Page, slug: string) => {
    await page.goto(`/seasons/${slug}/draft`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Draft");
  },

  onClock: (page: Page) =>
    page.getByText("On the clock:", { exact: true }).locator("xpath=following-sibling::span[1]"),

  pickButtons: (page: Page) => page.getByRole("button", { name: "Pick", exact: true }),

  /** Pick-log rows ("#n Captain picks Player"). */
  logEntries: (page: Page) => page.locator("li").filter({ hasText: " picks " }),

  logEntry: (page: Page, n: number) =>
    page
      .locator("li")
      .filter({ hasText: " picks " })
      .filter({ hasText: new RegExp(`^#${n}(?!\\d)`) }),

  /** Click Pick next to `playerName` and accept the confirm() dialog. */
  pick: async (page: Page, playerName: string) => {
    page.once("dialog", (d) => d.accept());
    await page
      .locator("li")
      .filter({ hasText: playerName })
      .filter({ has: page.getByRole("button", { name: "Pick", exact: true }) })
      .getByRole("button", { name: "Pick", exact: true })
      .click();
  },

  poolHeading: (page: Page) => page.getByText(/^Available pool \(\d+\)$/),

  // The app's <Alert>, not Next's route announcer (which also has role=alert).
  alert: (page: Page) => page.locator('[data-slot="alert"]'),
};

// ── Admin draft controls (/admin/seasons/[slug]/draft) ───────────────────────

export const adminDraft = {
  open: (page: Page, slug: string) => page.goto(`/admin/seasons/${slug}/draft`),
  click: async (
    page: Page,
    slug: string,
    label: "Start draft" | "Pause" | "Resume" | "Undo last pick",
  ) => {
    await adminDraft.open(page, slug);
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForURL(/[?&](saved|error)=/);
  },
};
