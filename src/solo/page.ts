// Brief 2 Step 12: the solo page. Same room, smaller felt: the dealer's cards
// on top, the board in the middle, yours and the dock below. The markup comes
// from one renderer, ./render.js, used for the first paint here and served to
// the browser for every re-render after a move. No stream: each move is a
// POST answered with the new state.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { User } from "../accounts.ts";
import { escapeHtml, page } from "../html.ts";
import { CARD_STYLE, DOCK_STYLE, TABLE_RENDER_VERSION } from "../poker/page.ts";
import type { SoloView } from "./game.ts";
import { renderSolo } from "./render.js";

// The renderer's one import, "../poker/render.js", resolves on the server
// but not in the browser, where this file is served from /assets/. It's
// rewritten here to the table renderer's own versioned URL, so the browser
// imports the same cardHtml the server does. Boot fails if the line isn't
// there to rewrite, rather than serve a module that can't load.
const SOLO_RENDER_SOURCE = readFileSync(resolve(import.meta.dirname, "render.js"), "utf8");
const TABLE_IMPORT = `from "../poker/render.js";`;
if (!SOLO_RENDER_SOURCE.includes(TABLE_IMPORT)) throw new Error("src/solo/render.js: the table renderer import moved");
if (SOLO_RENDER_SOURCE.split(TABLE_IMPORT).length !== 2) throw new Error("src/solo/render.js: expected one table renderer import");
export const SOLO_RENDER_JS = SOLO_RENDER_SOURCE.replace(
  TABLE_IMPORT,
  `from "/assets/table-render.js?v=${TABLE_RENDER_VERSION}";`,
);
export const SOLO_RENDER_VERSION = createHash("sha256").update(SOLO_RENDER_JS).digest("hex").slice(0, 12);

// Progressive enhancement: every form works without it (POST, then a 303
// back to /solo). With it, a form posts with fetch, the answer is the new
// view as JSON, and the felt re-renders in place; focus goes to the first
// control of the new dock, so a keyboard player can keep going.
const SOLO_CLIENT = String.raw`
import { renderSolo } from "/assets/solo-render.js?v=${SOLO_RENDER_VERSION}";

var root = document.getElementById("solo-root");
var status = document.getElementById("solo-status");
// A live region that stays in the page (a role="status" inserted with its
// text by innerHTML is often not announced): after each render, the result
// line and any notice are written into it, so a screen reader hears them.
var announcer = document.getElementById("solo-announcer");
function announce() {
  var parts = [root.querySelector("[data-new-stack]"), root.querySelector("[data-result]")]
    .filter(Boolean).map(function (el) { return el.textContent.trim(); });
  announcer.textContent = parts.join(" ");
}
function render(view) { root.innerHTML = renderSolo(view); announce(); }

function focusDock() {
  var target = root.querySelector(".solo-dock .actions button, .solo-dock #ante");
  if (target) target.focus();
}

root.addEventListener("click", function (event) {
  var preset = event.target.closest("[data-ante-preset]");
  if (!preset) return;
  var input = root.querySelector("#ante");
  if (input) { input.value = preset.dataset.value; input.focus(); }
});

root.addEventListener("submit", async function (event) {
  var form = event.target;
  event.preventDefault();
  var buttons = root.querySelectorAll("button");
  buttons.forEach(function (b) { b.disabled = true; });
  status.textContent = "";
  try {
    var res = await fetch(form.action, {
      method: "POST",
      headers: { accept: "application/json" },
      body: new URLSearchParams(new FormData(form)),
    });
    if (res.status === 401) { location.href = "/login?next=/solo"; return; }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      status.textContent = data.error || "That didn't work. Try again.";
      // Another tab may have moved the game on (a 400 "no hand in play"):
      // show what the server has now, rather than leave stale buttons.
      var fresh = await fetch("/solo/view", { headers: { accept: "application/json" } });
      if (fresh.ok) { render(await fresh.json()); focusDock(); }
      else buttons.forEach(function (b) { b.disabled = false; });
      return;
    }
    render(data);
    focusDock();
  } catch (err) {
    status.textContent = "Couldn't reach the house. Check your connection and try again.";
    buttons.forEach(function (b) { b.disabled = false; });
  }
});
`;

const SOLO_STYLE = `
  .solo-page { max-width: 46rem; margin: 0 auto; padding: 1.5rem clamp(1rem, 3vw, 2rem) 2rem; }
  .solo-page h1 { font-size: 1.8rem; margin: 0 0 .25rem; }
  .solo-page .lede-room { margin: 0 0 1.25rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .solo-felt {
    display: grid; gap: 1.1rem; justify-items: center; padding: 1.5rem 1rem; border-radius: 1.5rem;
    background: radial-gradient(ellipse 60% 60% at 50% 45%, var(--felt-lit), var(--felt) 75%);
    box-shadow: 0 0 0 10px var(--rail), 0 0 0 12px var(--rail-hi), 0 20px 50px rgba(0,0,0,.45);
    margin: 12px 12px 2rem;
  }
  .solo-side { display: grid; justify-items: center; gap: .4rem; }
  .solo-label { font-size: .85rem; color: #bfe0d1; letter-spacing: .02em; }
  .solo-cards { display: flex; gap: .45rem; }
${CARD_STYLE}
${DOCK_STYLE}
  .solo-dock { grid-template-columns: 1fr; margin: 0; }
  .solo-dock > * { grid-column: 1 / -1; }
  .solo-dock .actions { grid-column: 1 / -1; }
  .solo-money { display: flex; gap: 1.5rem; flex-wrap: wrap; margin: 0; color: var(--muted); }
  .solo-money strong { color: var(--text); font: 700 1.25rem var(--sans); margin-left: .35rem; }
  .solo-money strong.neg { color: #f0857e; }
  .solo-result { margin: 0; font: 700 1.2rem var(--sans); }
  .solo-result.pos { color: var(--brass); }
  .solo-result.neg { color: #f0857e; }
  .solo-notice { margin: 0; padding: .6rem .9rem; border-radius: .6rem; background: var(--card); color: var(--ink); font-weight: 600; }
  .solo-deal { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
  .solo-deal label { font-weight: 700; }
  .solo-deal input {
    width: 6.5rem; font: 700 1rem var(--sans); padding: .6rem .7rem; min-height: 3rem;
    border-radius: .65rem; border: 2px solid var(--line); background: var(--room); color: var(--text);
  }
  .solo-deal .presets { display: flex; flex-wrap: wrap; gap: .4rem; }
  .solo-deal .hint-room { flex-basis: 100%; color: var(--muted); font-size: .9rem; order: 5; }
  .chip-btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn:focus-visible, .chip-btn:focus-visible, .solo-deal input:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
  .solo-status { color: #f0b7b3; font-weight: 600; min-height: 1.5em; margin: .75rem 0 0; }
  @media (max-width: 640px) {
    .solo-felt { padding: 1.1rem .5rem; }
    .card { --w: 2.55rem; }
    .card.lg { --w: 3.1rem; }
    .solo-cards.board { gap: .3rem; }
    .solo-deal .btn { flex: 1 1 100%; }
    .solo-dock .actions { display: grid; grid-template-columns: 1fr 1fr; }
    .solo-dock .actions form, .solo-dock .actions .btn { width: 100%; }
  }
`;

// error: a refused move's message, for the page a form post without
// JavaScript gets back (with JavaScript it goes in the same element).
export function renderSoloPage(view: SoloView, user: User, error = ""): string {
  const body = `<main class="solo-page">
      <style>${SOLO_STYLE}</style>
      <h1>Against the house</h1>
      <p class="lede-room">Casino Hold'em: ante, see your two cards and the flop, then call (twice the ante) or fold.
        The dealer needs a pair of fours or better to qualify. Its own stack; play chips only.</p>
      <div id="solo-root">${renderSolo(view)}</div>
      <p id="solo-status" class="solo-status" role="alert">${escapeHtml(error)}</p>
      <p id="solo-announcer" class="visually-hidden" aria-live="polite"></p>
    </main>
    <script type="module">${SOLO_CLIENT}</script>`;
  return page("Against the house", body, { user });
}
