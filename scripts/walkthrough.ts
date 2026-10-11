/**
 * Walks the whole main flow in a headless browser against a running app and saves
 * a 1440x900 screenshot of each screen. Fails on any console error.
 *
 * Usage: BASE_URL=http://127.0.0.1:4108 SHOTS_DIR=/tmp/shots npm run walkthrough
 * Uses the installed Chrome (channel "chrome") with a throwaway profile.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4108";
const shots = process.env.SHOTS_DIR ?? path.join(process.cwd(), "test-results", "shots");
const runTimeout = Number(process.env.RUN_TIMEOUT_MS ?? 180_000);
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name: string, p: Page = page) => {
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(shots, `${name}.png`) });
    console.log(`shot ${name}`);
  };

  // 1. Requests: pick the offsite example and run it
  await page.goto(`${base}/`);
  await page.getByText("Synthetic data").first().waitFor();
  await page.getByRole("button", { name: /Sales offsite by the sea/ }).click();
  await shot("01-request");
  await page.getByRole("button", { name: /Run agent/ }).click();
  await page.waitForURL(/\/requests\//);
  await page.getByText(/Agent steps/).waitFor();
  await page.waitForTimeout(4_000);
  await shot("02-live-run");

  // 2. Shortlist lands
  await page.getByText("Waiting for expert review").last().waitFor({ timeout: runTimeout });
  await shot("03-shortlist");

  // 3. Expert review: reject the flight option, approve the rest
  await page.getByRole("link", { name: /Open expert review/ }).click();
  await page.getByText("Drafted RFP").waitFor();
  await shot("04-review");
  const cards = page.locator("article");
  const count = await cards.count();
  let rejected = false;
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if (!rejected && (await card.getByText("Flight", { exact: true }).count()) > 0) {
      await card.getByRole("button", { name: /Reject/ }).click();
      await card.getByLabel("Rejection note").fill("No flights for short offsites, keep it reachable by train");
      await card.getByLabel("Check").selectOption("no_flight_destinations");
      await shot("05-reject-form");
      await card.getByRole("button", { name: /^Reject$/ }).click();
      await card.getByText(/Saved as a regression case/).waitFor();
      rejected = true;
    }
  }
  if (!rejected) throw new Error("No flight option to reject in this shortlist");
  for (let i = 0; i < count; i++) {
    const approve = cards.nth(i).getByRole("button", { name: /Approve RFP/ });
    if (await approve.count()) {
      await approve.click();
      await cards.nth(i).getByText(/sent to the outbox/).waitFor();
    }
  }
  await shot("06-approved-outbox");

  // 4. Evals: the new case shows its source run failing
  await page.getByRole("link", { name: "Evals", exact: true }).click();
  await page.getByText("From expert review").first().waitFor();
  await page.getByText(/Source run:/).first().waitFor();
  await shot("07-evals-new-case");

  // Baseline suite before the policy change, so the next run has a real comparison
  await page.getByRole("button", { name: /Run all/ }).click();
  await page.getByRole("button", { name: /Running/ }).waitFor();
  await page.getByRole("button", { name: /Run all/ }).waitFor({ timeout: runTimeout * 3 });
  await page.waitForTimeout(1_500);
  await shot("07b-evals-baseline");

  // 5. Trace of the failing source run
  await page.getByText(/Source run:/).first().locator("xpath=..").getByRole("link", { name: "trace" }).click();
  await page.getByText("Timeline").waitFor();
  await page.locator("button", { hasText: "get_quote" }).first().click();
  await shot("08-trace");

  // 6. Policy: turn on the no-flights rule
  await page.getByRole("link", { name: "Policy", exact: true }).click();
  const toggle = page.getByRole("switch", { name: /No flights/ });
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await page.getByRole("button", { name: /Save policy/ }).click();
  await page.getByText("Saved").waitFor();
  await shot("09-policy");

  // 7. Evals: run all, wait for the suite to finish
  await page.getByRole("link", { name: "Evals", exact: true }).click();
  await page.getByRole("button", { name: /Run all/ }).click();
  await page.getByRole("button", { name: /Running/ }).waitFor();
  await page.waitForTimeout(3_000);
  await shot("10-evals-running");
  await page.getByRole("button", { name: /Run all/ }).waitFor({ timeout: runTimeout * 3 });
  await shot("11-evals-done");
  const failing = await page.locator("tbody tr").filter({ hasText: /Fail|Error/ }).count();
  console.log(`cases failing after the fix: ${failing}`);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(`Console errors:\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("WALKTHROUGH_OK");
