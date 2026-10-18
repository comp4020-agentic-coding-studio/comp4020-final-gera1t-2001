// Two windows in the SAME browser profile (shared cookies), two accounts.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:8080";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH /* path to a Chromium binary */ });
const ctx = await browser.newContext();
async function register(p, u) {
  await p.goto(BASE + "/register");
  await p.fill("#username", u);
  await p.fill("#password", "Correct1!Horse");
  const opts = await p.$$eval("#question_1 option", (os) => os.map((o) => o.value).filter(Boolean));
  await p.selectOption("#question_1", opts[0]);
  await p.selectOption("#question_2", opts[1]);
  await p.fill("#answer_1", "a");
  await p.fill("#answer_2", "b");
  await p.click("button[type=submit]");
}
const a = await ctx.newPage();
const ua = "wa" + Date.now().toString(36);
await register(a, ua);
await a.goto(BASE + "/tables/1");
await a.click("#sit-form button");
await a.waitForTimeout(300);
const b = await ctx.newPage();
// window 2: log out A, register/log in as B (what you'd do to "use a second account")
await b.goto(BASE + "/profile");
await b.click("nav form button"); // log out
const ub = "wb" + Date.now().toString(36);
await register(b, ub);
await b.goto(BASE + "/tables/1");
await b.click("#sit-form button");
await b.waitForTimeout(300);
await b.click("#start-form button");
await b.waitForTimeout(600);
const seen = (p) => p.evaluate(() => ({
  you: document.querySelector(".seat-you .seat-name")?.textContent,
  turn: document.querySelector(".turn-info")?.textContent.trim().replace(/\s+/g, " "),
  canAct: !document.getElementById("action-form")?.hidden,
  status: document.getElementById("status-message")?.textContent,
}));
console.log("A window:", ua, JSON.stringify(await seen(a)));
console.log("B window:", ub, JSON.stringify(await seen(b)));
const actor = (await seen(a)).canAct ? a : b;
console.log("acting in", actor === a ? "A window" : "B window");
await actor.click("#action-form button[value=call]");
await actor.waitForTimeout(800);
console.log("A window:", JSON.stringify(await seen(a)));
console.log("B window:", JSON.stringify(await seen(b)));
await browser.close();
