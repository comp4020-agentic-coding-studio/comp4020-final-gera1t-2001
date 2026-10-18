// Recreate the live table: 4 seated, 3 of them "ghosts" (their browsers closed),
// one real page watching. Does the watching page keep up with auto-folds?
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:8080";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH /* path to a Chromium binary */ });
async function newUser() {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const u = "g" + Math.random().toString(36).slice(2, 9);
  await p.goto(BASE + "/register");
  await p.fill("#username", u);
  await p.fill("#password", "Correct1!Horse");
  const opts = await p.$$eval("#question_1 option", (os) => os.map((o) => o.value).filter(Boolean));
  await p.selectOption("#question_1", opts[0]);
  await p.selectOption("#question_2", opts[1]);
  await p.fill("#answer_1", "a");
  await p.fill("#answer_2", "b");
  await p.click("button[type=submit]");
  await p.goto(BASE + "/tables/1");
  await p.click("#sit-form button");
  await p.waitForTimeout(300);
  return { ctx, p, u };
}
const ghosts = [await newUser(), await newUser(), await newUser()];
const me = await newUser();
const errors = [];
me.p.on("pageerror", (e) => errors.push(e.message));
for (const g of ghosts) await g.ctx.close(); // they walk away, still seated
await me.p.click("#start-form button");
const turn = () => me.p.evaluate(() => document.querySelector(".turn-info")?.textContent.trim().replace(/\s+/g, " "));
const server = () => me.p.evaluate(() => fetch("/tables/1/view").then((r) => r.json()).then((v) => v.hand?.winners ? "hand over" : `actionTo=${v.hand?.actionTo}`));
for (let i = 0; i < 14; i++) {
  await me.p.waitForTimeout(2000);
  console.log(`${2 * (i + 1)}s  page: ${await turn()}   server: ${await server()}`);
}
console.log("page errors:", errors);
await browser.close();
