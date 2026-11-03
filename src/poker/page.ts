// The table page (C9 Step 3, rebuilt from docs/design/table-mockup.html in
// final brief Step 7). The markup comes from one renderer, ./render.js: the
// server calls it for the first paint, and the browser imports the very same
// file (served at /assets/table-render.js) to re-render from each pushed
// view. The client below owns everything around that: the stream, the
// seq rule, the watchdog, the pill, the identity banner and the forms.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { User } from "../accounts.ts";
import { escapeHtml, page } from "../html.ts";
import { renderTable } from "./render.js";
import type { TableView } from "./table.ts";

// Served as-is to the browser. Like site.css, its URL carries a hash of its
// content, so a deploy never leaves a page on a stale renderer.
export const TABLE_RENDER_JS = readFileSync(resolve(import.meta.dirname, "render.js"), "utf8");
export const TABLE_RENDER_VERSION = createHash("sha256").update(TABLE_RENDER_JS).digest("hex").slice(0, 12);

// A module script, so it can import the renderer. Module scripts run after
// the document is parsed, which is all this needs.
const tableClientScript = String.raw`
import { nextHandLabel, renderTable, turnClock } from "/assets/table-render.js?v=${TABLE_RENDER_VERSION}";

var tableId = document.body.dataset.tableId;
var viewerId = Number(document.body.dataset.viewerId);
var viewerName = document.body.dataset.viewerName;
var root = document.getElementById("table-root");
// Outside #table-root, so a render never wipes it: a message stays until
// the player's next action (see post()), not until the next push.
var statusEl = document.getElementById("status-message");
var bannerEl = document.getElementById("identity-banner");
// In the header, outside #table-root too, so a render can't wipe it (final
// brief Step 3).
var connEl = document.getElementById("conn-pill");
var announcerEl = document.getElementById("turn-announcer");
// Set once this window learns the browser is signed in as someone else
// (final brief Step 2); only a reload clears it.
var identityLost = false;

// Final brief Step 3: only render a view at least as new as the last one
// painted, so a slow POST response can't paint over a newer push. seq
// restarts at 0 when the server restarts, under a new bootId, so a changed
// bootId always renders. Seeded from the server-rendered first paint, whose
// view is embedded in the page so the clock can tick from it.
var currentView = JSON.parse(document.getElementById("table-view").textContent);
var lastBootId = currentView.bootId;
var lastRenderedSeq = currentView.seq;
var lastDecision = decisionKey(currentView); // which turn the amount was typed for; see render()

// The raise amount belongs to one decision: your turn, on one street of one
// hand. Typed text survives renders within it and is dropped after.
function decisionKey(view) {
  var hand = view.hand;
  return hand && hand.winners === null ? hand.handNumber + ":" + hand.street + ":" + hand.actionTo : null;
}

function render(view) {
  // Once this window has lost its identity, stop painting: a view for
  // whoever the cookie belongs to now (their hole cards, their seat) has no
  // place under a banner that says this window is playing as someone else.
  if (view.you !== viewerId) showIdentityBanner(view.youDisplayName);
  if (identityLost) return;
  if (view.bootId === lastBootId && view.seq < lastRenderedSeq) return;
  lastBootId = view.bootId;
  lastRenderedSeq = view.seq;
  currentView = view;

  // Rebuilding the markup would drop what the player is doing: a half-typed
  // amount, or keyboard focus. Note both, restore them after.
  var focusKey = document.activeElement && root.contains(document.activeElement)
    ? controlKey(document.activeElement)
    : null;
  var amountBefore = root.querySelector("#action-form:not([hidden]) input[name=amount]");
  var typedAmount = amountBefore && amountBefore.dataset.typed ? amountBefore.value : "";
  var decision = decisionKey(view);
  if (decision !== lastDecision) typedAmount = "";
  lastDecision = decision;

  var wasMyTurn = !!root.querySelector("#action-form:not([hidden])");
  root.innerHTML = renderTable(view, Date.now());
  var isMyTurn = !!root.querySelector("#action-form:not([hidden])");
  // The prompt is rebuilt on every render, so a screen reader wouldn't hear
  // it change: say "Your turn." once, in a live region outside #table-root.
  if (isMyTurn && !wasMyTurn) announcerEl.textContent = "Your turn.";
  else if (!isMyTurn) announcerEl.textContent = "";

  var amountAfter = root.querySelector("#action-form input[name=amount]");
  if (amountAfter && typedAmount) {
    amountAfter.value = typedAmount;
    amountAfter.dataset.typed = "1";
    syncRaiseLabel();
  }
  if (focusKey) {
    var restored = false;
    root.querySelectorAll("button, input").forEach(function (el) {
      if (!restored && controlKey(el) === focusKey && !el.closest("[hidden]")) {
        el.focus();
        restored = true;
      }
    });
    // The control you were on is gone (you just acted, so the action
    // buttons hid): keep focus in the dock rather than drop it to the page.
    var dock = root.querySelector(".dock");
    if (!restored && dock) {
      dock.setAttribute("tabindex", "-1");
      dock.focus({ preventScroll: true });
    }
  }
  disableControls();
}

// Which control this is, in a way that survives the markup being rebuilt:
// its form, plus its name (an input) or its value or preset (a button).
// Fold, and Check-or-Call, keep their place even when the label changes.
function controlKey(el) {
  var form = el.form ? el.form.id : "";
  if (el.tagName === "INPUT") return form + "|input:" + el.name;
  if (el.dataset.preset) return form + "|preset:" + el.dataset.preset;
  if (el.value === "check" || el.value === "call") return form + "|button:check-call";
  if (el.value === "bet" || el.value === "raise") return form + "|button:bet-raise";
  return form + "|button:" + (el.value || el.textContent);
}

// The turn ring and the seconds left are recomputed from the server's
// turn_deadline every tick (never from when the page loaded), using the
// renderer's own turnClock, so a tick and a fresh render always agree. The
// "Next hand in 4 s" countdown (brief 2 Step 10) is ticked the same way, from
// the server's nextHandAt, through the renderer's own nextHandLabel.
function updateClock() {
  var now = Date.now();
  var next = nextHandLabel(currentView, now);
  if (next) root.querySelectorAll("[data-next-hand]").forEach(function (el) { el.textContent = next; });
  var clock = turnClock(currentView, now);
  if (!clock) return;
  var avatar = root.querySelector("[data-turn] .avatar");
  if (avatar) avatar.style.setProperty("--p", clock.share.toFixed(3));
  root.querySelectorAll("[data-clock]").forEach(function (el) { el.textContent = clock.seconds + "s"; });
}

// "Raise to 80" follows what's in the box, so the button says what it does.
function syncRaiseLabel() {
  var input = root.querySelector("#action-form input[name=amount]");
  var button = root.querySelector("#action-form button[data-verb]");
  if (!input || !button) return;
  var n = Number(input.value);
  button.textContent = button.dataset.verb + (input.value !== "" && n > 0 ? " " + n.toLocaleString("en-AU") : "");
}

function showError(message) {
  // Once the identity banner is up it says why nothing works; a second
  // copy of that in the status line is noise.
  statusEl.textContent = identityLost ? "" : message;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// nowSignedInAs is a display name, or null when the browser is signed out.
function showIdentityBanner(nowSignedInAs) {
  identityLost = true;
  var playingAs = "<strong>" + esc(viewerName) + "</strong>";
  bannerEl.querySelector("[data-banner-text]").innerHTML = nowSignedInAs
    ? "This window is playing as " + playingAs + ", but this browser is now signed in as <strong>" +
      esc(nowSignedInAs) + "</strong> (another tab or window). Reload to play as " + esc(nowSignedInAs) + "."
    : "This window is playing as " + playingAs +
      ", but this browser is now signed out (another tab or window). Reload to log in again.";
  bannerEl.hidden = false;
  statusEl.textContent = "";
  disableControls();
  // Nothing more to fetch for this window: it won't paint again.
  connEl.hidden = true;
  if (source) source.close();
  stopPolling();
}

function disableControls() {
  if (!identityLost) return;
  root.querySelectorAll("button, input").forEach(function (el) { el.disabled = true; });
}

// Every POST says who this page is playing as, so the server can refuse
// one whose cookie now belongs to someone else (409 identity_changed)
// instead of acting for them.
function post(path, fields) {
  showError(""); // the player's next action is what clears the last message
  var body = new URLSearchParams(fields || {});
  body.set("as", String(viewerId));
  return fetch(path, { method: "POST", body: body })
    .then(function (res) {
      return res.json().then(function (data) {
        if (res.status === 409 && data.code === "identity_changed") {
          showIdentityBanner(data.nowSignedInAs ? data.nowSignedInAs.displayName : null);
          throw new Error(data.error);
        }
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        return data;
      });
    });
}

// Delegated once on #table-root, so re-rendering never needs re-wiring.
var ROUTES = { "sit-form": "sit", "leave-form": "leave", "start-form": "start", "action-form": "act" };
root.addEventListener("submit", function (e) {
  var form = e.target;
  var route = ROUTES[form.id];
  if (!route) return;
  e.preventDefault();
  var fields;
  if (route === "act") {
    var type = e.submitter ? e.submitter.value : "";
    fields = { type: type };
    // The engine reads bet and raise amounts as "to" totals, which is what
    // the box holds, so it goes up unchanged.
    if (type === "bet" || type === "raise") fields.amount = String(new FormData(form).get("amount") || "");
  }
  post("/tables/" + tableId + "/" + route, fields).then(render).catch(function (err) { showError(err.message); });
});

// Presets only fill the box; they never act on their own.
root.addEventListener("click", function (e) {
  var preset = e.target.closest("[data-preset]");
  if (!preset) return;
  var input = root.querySelector("#action-form input[name=amount]");
  input.value = preset.dataset.amount;
  input.dataset.typed = "1";
  syncRaiseLabel();
});

root.addEventListener("input", function (e) {
  if (e.target.name !== "amount") return;
  e.target.dataset.typed = "1";
  syncRaiseLabel();
});

setInterval(updateClock, 250);

document.getElementById("identity-reload").addEventListener("click", function () {
  location.reload();
});

updateClock(); // paint the first paint's clock against this browser's own time now
// Loaded on your own turn: the first paint already shows the action buttons,
// so render() never sees them appear. Announce it once here instead.
if (root.querySelector("#action-form:not([hidden])")) announcerEl.textContent = "Your turn.";

// --- A stream the page can trust (final brief Step 3) ---------------
//
// The server sends a named "ping" every 5 s, so silence means a dead or
// stalled stream, not a quiet table: in production one was seen to stop
// delivering without ever erroring. If nothing (view or ping) arrives for
// STALL_MS, close it and open a new one, and poll the view until the new
// stream delivers, so the table stays current meanwhile.
var STALL_MS = 12000;
var POLL_MS = 1500;
var POLL_TIMEOUT_MS = 4000; // a hung poll counts as failed, not as one that never ends
// Reconnecting is the normal state while recovering, server restarts
// included. Offline means it's no longer likely to come back by itself:
// the browser says it has no network, or nothing has answered for this
// long.
var OFFLINE_AFTER_MS = 30000;
var RETRY_MS = 2000; // matches the server's "retry:"
var CONN_TEXT = {
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline: showing the last table I saw",
};
var viewUrl = "/tables/" + tableId + "/view";

var source = null;
var streamLive = false; // the current stream has delivered since it opened
var streamOpenedAt = 0;
var lastMessageAt = Date.now();
var pollTimer = null;
var pollInFlight = false;
var lastReachedAt = Date.now(); // last time the server answered anything

function setConn(state) {
  connEl.dataset.state = state;
  connEl.textContent = CONN_TEXT[state];
}

function openStream() {
  if (source) source.close();
  var s = new EventSource("/tables/" + tableId + "/events");
  source = s;
  streamOpenedAt = Date.now();
  function delivered() {
    if (s !== source) return false; // a stream already replaced
    lastMessageAt = lastReachedAt = Date.now();
    if (!streamLive) {
      streamLive = true;
      stopPolling();
      setConn("live");
    }
    return true;
  }
  s.addEventListener("view", function (event) {
    if (delivered()) render(JSON.parse(event.data));
  });
  s.addEventListener("ping", function (event) {
    if (!delivered()) return;
    var ping = JSON.parse(event.data);
    if (ping.seq > lastRenderedSeq) fetchView(); // a view this page never got
  });
  s.onerror = function () {
    if (s === source) streamDown();
  };
}

function streamDown() {
  if (identityLost) return;
  streamLive = false;
  if (connEl.dataset.state === "live") setConn("reconnecting");
  startPolling();
}

// Resolves true if the server answered (and the view was handed to
// render, which applies the seq rule), false if it couldn't be reached.
// A 401 means this browser is signed out now (Step 2's banner).
function fetchView() {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, POLL_TIMEOUT_MS);
  return fetch(viewUrl, { signal: controller.signal, cache: "no-store" })
    .then(function (res) {
      if (res.status === 401) {
        showIdentityBanner(null);
        return true;
      }
      if (!res.ok) return false; // e.g. the proxy's 502 while the app is down
      lastReachedAt = Date.now();
      return res.json().then(function (view) {
        render(view);
        return true;
      });
    })
    .catch(function () { return false; })
    .finally(function () { clearTimeout(timer); });
}

function pollOnce() {
  if (pollInFlight) return;
  pollInFlight = true;
  fetchView().then(function (reached) {
    pollInFlight = false;
    if (streamLive || identityLost) return;
    var gaveUp = !navigator.onLine || (!reached && Date.now() - lastReachedAt > OFFLINE_AFTER_MS);
    setConn(gaveUp ? "offline" : "reconnecting");
  });
}

function startPolling() {
  if (pollTimer || identityLost) return;
  pollTimer = setInterval(pollOnce, POLL_MS);
  pollOnce();
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

setInterval(function () {
  if (identityLost) return;
  var now = Date.now();
  if (streamLive) {
    if (now - lastMessageAt > STALL_MS) {
      streamDown();
      openStream();
    }
    return;
  }
  // Not live yet: EventSource retries a dropped connection by itself, but
  // gives up for good on a non-200 answer (a proxy's 502 while the app is
  // down), and a stream that opens but never delivers is no better.
  var waited = now - streamOpenedAt;
  if ((source.readyState === EventSource.CLOSED && waited > RETRY_MS) || waited > STALL_MS) openStream();
}, 1000);

// Back to a tab, back online, or back from the browser's page cache: the
// stream may have been asleep or dead the whole time, so catch up now
// rather than wait out the watchdog.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible" || identityLost) return;
  fetchView();
  // Brief 2 Step 10: as "online" does. A phone back from the background
  // usually has a dead stream; without this it waited for the watchdog.
  if (!streamLive) openStream();
});
window.addEventListener("online", function () {
  if (identityLost) return;
  fetchView();
  if (!streamLive) openStream();
});
window.addEventListener("offline", function () {
  streamDown();
  if (!identityLost) setConn("offline");
});
window.addEventListener("pageshow", function (event) {
  if (identityLost) return;
  fetchView();
  if (event.persisted) openStream(); // a page restored from cache has a closed stream
});

openStream();
`;

// Ported from docs/design/table-mockup.html: the oval, the rail and the lamp,
// six seat slots (a phone set at <= 640 px, where the oval stands up), cards,
// the turn ring, the bubbles and the dock. Tokens come from site.css.
const TABLE_STYLE = `
  .table-page { padding: 0 0 2rem; }
  .table-page > h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .stage { padding: clamp(1rem, 3vw, 2.5rem) clamp(1rem, 3vw, 2rem) 0; }
  .table {
    position: relative; max-width: 1040px; margin: 0 auto; aspect-ratio: 2.05 / 1; border-radius: 999px;
    background: radial-gradient(ellipse 55% 60% at 50% 46%, var(--felt-lit), var(--felt) 70%);
    box-shadow: 0 0 0 14px var(--rail), 0 0 0 16px var(--rail-hi), 0 30px 80px rgba(0,0,0,.45);
    margin-block: 56px 72px;
  }
  .center {
    position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%);
    display: grid; justify-items: center; gap: .6rem; text-align: center;
  }
  .pot { font: 1.05rem var(--sans); color: #e9f3ee; }
  .pot strong { font: 1.6rem/1 var(--serif); color: #fff; margin-left: .35rem; font-weight: 400; }
  .street { font-size: .85rem; color: #bfe0d1; }
  .board { display: flex; gap: .45rem; }

  .card {
    --w: 3.4rem; width: var(--w); aspect-ratio: 5 / 7; flex: none;
    background: var(--card); color: var(--ink); border-radius: calc(var(--w) * .12);
    box-shadow: 0 2px 0 rgba(0,0,0,.15), 0 6px 14px rgba(0,0,0,.25);
    position: relative; display: grid; place-items: center; font-family: var(--serif);
  }
  .card.red { color: var(--red); }
  .card .idx { position: absolute; left: 12%; top: 6%; line-height: .95; text-align: center; font-size: calc(var(--w) * .34); }
  .card .idx span { display: block; font-size: .8em; }
  .card .pip { font-size: calc(var(--w) * .62); margin-top: 18%; }
  .card.slot { background: transparent; box-shadow: none; border: 2px dashed rgba(255,255,255,.18); }
  .card.back {
    background:
      repeating-linear-gradient(45deg, transparent 0 5px, rgba(255,255,255,.14) 5px 6px),
      repeating-linear-gradient(-45deg, transparent 0 5px, rgba(255,255,255,.14) 5px 6px),
      #8a2a25;
    border: 3px solid var(--card);
  }
  .card.sm { --w: 2.1rem; }
  .card.sm .pip { display: none; }
  .card.sm .idx { position: static; font-size: .95rem; }
  .card.sm.back { border-width: 2px; }
  .card.lg { --w: 4.6rem; }

  /* Six fixed slots around the oval; slot 0 is always the viewer. --bx/--by
     place the bet marker toward the centre. A zero is written 0rem: a bare 0
     makes calc(-50% + 0) invalid, which throws away the whole transform (the
     mockup has bare zeros, but never shows a bet on those two slots). */
  .seat {
    position: absolute; left: var(--x); top: var(--y); transform: translate(-50%, -50%);
    display: grid; justify-items: center; gap: .25rem; width: 8.5rem; text-align: center;
  }
  .s0 { --x: 50%; --y: 100%; --bx: 0rem; --by: -5.2rem; }
  .s1 { --x: 9%;  --y: 82%;  --bx: 5rem;  --by: -2.6rem; }
  .s2 { --x: 9%;  --y: 18%;  --bx: 5rem;  --by: 2.6rem; }
  .s3 { --x: 50%; --y: 0%;   --bx: 0rem;  --by: 7.8rem; }
  .s4 { --x: 91%; --y: 18%;  --bx: -5rem; --by: 2.6rem; }
  .s5 { --x: 91%; --y: 82%;  --bx: -5rem; --by: -2.6rem; }
  .avatar {
    --p: 0; width: 3.6rem; height: 3.6rem; border-radius: 50%; display: grid; place-items: center;
    font: 1.45rem/1 var(--serif); color: var(--text); background: var(--room-2);
    border: 3px solid var(--line); position: relative;
  }
  .seat.turn .avatar {
    border-color: transparent;
    background:
      linear-gradient(var(--room-2), var(--room-2)) padding-box,
      conic-gradient(var(--brass) calc(var(--p) * 1turn), rgba(255,255,255,.12) 0) border-box;
  }
  .seat.you .avatar { color: var(--brass); }
  .name { font-weight: 600; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stack { font-size: .875rem; color: var(--muted); }
  .plate { background: rgba(20,22,25,.82); border-radius: .6rem; padding: .3rem .6rem; max-width: 100%; min-width: 0; overflow: hidden; }
  .away-tag {
    display: inline-block; margin-top: .15rem; padding: 0 .45rem; border-radius: 999px;
    font-size: .75rem; font-weight: 700; color: var(--text); border: 1px solid var(--muted);
  }
  .seat .hole { display: flex; gap: .2rem; margin-bottom: -.2rem; }
  .s0 .hole { display: none; } /* your cards live in the dock, as in the mockup */
  .seat.folded { opacity: .45; }
  .dealer {
    position: absolute; right: -.35rem; top: -.35rem; width: 1.45rem; height: 1.45rem; border-radius: 50%;
    background: var(--brass); color: var(--brass-ink); font: 700 .8rem/1.45rem var(--sans); text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,.4);
  }
  .bet {
    position: absolute; left: 50%; top: 50%;
    transform: translate(calc(-50% + var(--bx)), calc(-50% + var(--by)));
    display: inline-flex; align-items: center; gap: .35rem;
    font-weight: 700; font-size: .9rem; color: #fff; white-space: nowrap;
  }
  .bet::before {
    content: ""; width: 1rem; height: 1rem; border-radius: 50%;
    background: radial-gradient(circle, #fff 0 22%, var(--red) 23% 60%, #fff 61% 70%, var(--red) 71%);
    box-shadow: 0 1px 2px rgba(0,0,0,.5);
  }
  .said {
    position: absolute; bottom: calc(100% + .2rem); background: var(--card); color: var(--ink);
    font-size: .8rem; font-weight: 600; padding: .1rem .5rem; border-radius: 999px; white-space: nowrap;
  }
  .said.auto { background: var(--brass); color: var(--brass-ink); }
  .seat.empty .avatar { border-style: dashed; color: var(--muted); font: .8rem var(--sans); }

  /* The dock */
  .dock {
    max-width: 1040px; margin: 0 auto 2rem; background: var(--room-2); border: 1px solid var(--line);
    border-radius: 1rem; padding: 1rem 1.25rem;
    display: grid; grid-template-columns: auto 1fr; gap: 1rem 1.5rem; align-items: center;
  }
  .dock .mine { display: flex; gap: .4rem; }
  .dock .mine:empty { display: none; }
  .dock:has(.mine:empty) > * { grid-column: 1 / -1; }
  .watching { margin: 0; color: var(--muted); }
  .prompt { font-size: 1.05rem; margin: 0; }
  .prompt strong { font-family: var(--serif); font-weight: 400; font-size: 1.25rem; }
  .prompt .clock { color: var(--brass); font-weight: 700; margin-left: .35rem; }
  .prompt .clock-plain { font-weight: 700; }
  /* Its own line on a phone. The space before it stays in the text, for
     screen readers and copy; a block's leading whitespace isn't drawn. */
  .prompt .next-hand { color: var(--muted); white-space: nowrap; margin-left: .2rem; }
  @media (max-width: 640px) { .prompt .next-hand { display: block; margin-left: 0; } }
  .actions, .table-controls { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; grid-column: 2; }
  .table-controls form { display: contents; }
  .btn {
    font: 700 1rem var(--sans); border-radius: .65rem; padding: .7rem 1.2rem;
    border: 2px solid transparent; cursor: pointer; min-height: 3rem;
  }
  .btn.fold { background: transparent; color: var(--text); border-color: var(--line); }
  .btn.call { background: var(--card); color: var(--ink); }
  .btn.raise { background: var(--brass); color: var(--brass-ink); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .raise-box { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
  .raise-box input {
    width: 6.5rem; font: 700 1rem var(--sans); padding: .6rem .7rem; min-height: 3rem;
    border-radius: .65rem; border: 2px solid var(--line); background: var(--room); color: var(--text);
  }
  .chip-btn {
    font: 600 .875rem var(--sans); padding: .45rem .7rem; border-radius: 999px; min-height: 2.25rem;
    background: transparent; border: 1px solid var(--line); color: var(--muted); cursor: pointer;
  }
  .chip-btn:hover { color: var(--text); border-color: var(--muted); }
  /* The C9 bug guard: these set display, which would beat the UA's
     [hidden] { display: none } at equal specificity, so a hidden control
     would still show. Caught by looking at a real render, not by pnpm check. */
  .actions[hidden], .table-controls form[hidden], .raise-box[hidden] { display: none; }

  .table-notice { max-width: 1040px; margin: 1rem auto 0; padding: 0 clamp(1rem, 3vw, 2rem); color: var(--muted); font-style: italic; }
  .status-line { max-width: 1040px; margin: .75rem auto 0; padding: 0 clamp(1rem, 3vw, 2rem); color: #f0b7b3; font-weight: 600; }
  .status-line:empty { display: none; }
  .banner {
    max-width: 1040px; margin: 1rem auto 0; padding: .8rem 1.1rem; border-radius: .8rem;
    background: var(--card); color: var(--ink); display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
  }
  .banner p { margin: 0; flex: 1 1 20rem; }
  .banner strong { font-family: var(--serif); font-weight: 400; }
  .banner button { margin-left: auto; }
  .banner[hidden] { display: none; }

  /* Phone: the oval stands up. */
  @media (max-width: 640px) {
    .stage { padding-inline: 2.3rem; }
    .table { aspect-ratio: 0.7 / 1; margin-block: 44px 64px; box-shadow: 0 0 0 10px var(--rail), 0 0 0 12px var(--rail-hi), 0 20px 50px rgba(0,0,0,.45); }
    .center { top: 47%; }
    .card { --w: 2.55rem; }
    .card.sm { --w: 1.7rem; }
    .card.sm .idx { font-size: .78rem; }
    .board { gap: .3rem; }
    .seat { width: 4.9rem; }
    .avatar { width: 2.8rem; height: 2.8rem; font-size: 1.15rem; }
    .name { font-size: .85rem; }
    .stack { font-size: .78rem; }
    .s0 { --x: 50%; --y: 100%; --bx: 0rem; --by: -4.1rem; }
    .s1 { --x: 4%;  --y: 74%;  --bx: 3.6rem; --by: -1.2rem; }
    .s2 { --x: 4%;  --y: 30%;  --bx: 3.6rem; --by: 1.2rem; }
    .s3 { --x: 50%; --y: 0%;   --bx: 0rem; --by: 7.4rem; }
    .s4 { --x: 96%; --y: 30%;  --bx: -3.6rem; --by: 1.2rem; }
    .s5 { --x: 96%; --y: 74%;  --bx: -3.6rem; --by: -1.2rem; }
    .s0 .said { display: none; }
    .you-tag { display: none; } /* you're always the bottom seat; the name needs the room */
    .dock { margin: 0 1rem 1.5rem; padding: .9rem 1rem; }
    .actions, .table-controls { grid-column: 1 / -1; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; }
    .raise-box { grid-column: 1 / -1; }
    .raise-box input { flex: 1; }
    .card.lg { --w: 3.1rem; }
    .banner { margin-inline: 1rem; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .seat.turn .avatar { transition: --p .25s linear; }
  }
`;

// The connection pill (final brief Step 3) sits in the layout's header nav,
// as in the mockup, which keeps it outside #table-root.
const CONN_PILL = `<span id="conn-pill" class="conn" data-state="reconnecting" role="status">Reconnecting…</span>`;

// The first paint's view, for the client to start from. "<" is escaped so no
// display name can close the script element early.
function embeddedView(view: TableView): string {
  return JSON.stringify(view).replace(/</g, "\\u003c");
}

export function renderTablePage(view: TableView, user: User): string {
  const body = `
    <style>${TABLE_STYLE}</style>
    <main class="table-page">
      <h1>${escapeHtml(view.table.name)}</h1>
      <div id="identity-banner" class="banner" role="alert" hidden>
        <p data-banner-text></p>
        <button type="button" class="btn raise" id="identity-reload">Reload</button>
      </div>
      <p id="status-message" class="status-line" role="status" aria-live="polite"></p>
      <p id="turn-announcer" class="visually-hidden" aria-live="assertive"></p>
      <div id="table-root">${renderTable(view, Date.now())}</div>
    </main>
    <script type="application/json" id="table-view">${embeddedView(view)}</script>
    <script type="module">${tableClientScript}</script>`;
  // Read off document.body by the inline script. data-viewer-id is who this
  // page was rendered for; every POST sends it back as "as" (final brief
  // Step 2), and a view whose "you" differs means the cookie changed hands.
  return page("Table", body, { user, current: "table", navExtra: CONN_PILL }).replace(
    "<body>",
    `<body data-table-id="${view.table.id}" data-viewer-id="${view.you ?? ""}" data-viewer-name="${escapeHtml(view.youDisplayName ?? "")}">`,
  );
}
