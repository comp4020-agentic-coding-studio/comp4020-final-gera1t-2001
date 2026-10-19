// C9 Step 3: the table page. Server-rendered first paint (renderTableHtml,
// below) from the same masked TableView every JSON route returns; a small
// vanilla-JS EventSource client (tableClientScript) then takes over,
// re-rendering the same markup from each pushed "view" event. The two
// renderers are deliberately similar in shape — one in TypeScript for the
// first paint, one in JavaScript for live updates — rather than one trying
// to serve both a server template and a browser runtime.
import { escapeHtml, page } from "../html.ts";
import type { TableView } from "./table.ts";

const SUIT: Record<string, { symbol: string; color: "red" | "black" }> = {
  s: { symbol: "♠", color: "black" },
  h: { symbol: "♥", color: "red" },
  d: { symbol: "♦", color: "red" },
  c: { symbol: "♣", color: "black" },
};

function cardHtml(code: string | null): string {
  if (!code) return `<span class="card card-back" aria-label="hidden card">??</span>`;
  const rank = code[0];
  const suit = SUIT[code[1]];
  if (!suit) return `<span class="card">${escapeHtml(code)}</span>`;
  return `<span class="card ${suit.color}">${escapeHtml(rank)}${suit.symbol}</span>`;
}

function renderTableHtml(view: TableView): string {
  const hand = view.hand;
  const seatByNo = new Map(view.seats.map((s) => [s.seatNo, s]));
  const handPlayers = hand?.players ?? [];

  const seatsHtml = Array.from({ length: view.table.max_seats }, (_, seatNo) => {
    const seat = seatByNo.get(seatNo);
    if (!seat) return `<li class="seat seat-empty" data-seat="${seatNo}">Empty seat</li>`;
    const handPlayer = handPlayers[seatNo];
    const isTurn = hand?.actionTo === seatNo;
    const isYou = view.you === seat.userId;
    const cards = handPlayer
      ? (handPlayer.hand ?? [null, null]).map(cardHtml).join("")
      : "";
    const lastAction =
      view.lastAction && view.lastAction.seat === seatNo
        ? `<span class="last-action${view.lastAction.auto ? " auto" : ""}">${escapeHtml(
            (view.lastAction.auto ? "auto-" : "") + view.lastAction.type.toLowerCase(),
          )}</span>`
        : "";
    return `<li class="seat${isTurn ? " seat-turn" : ""}${isYou ? " seat-you" : ""}" data-seat="${seatNo}">
        <div class="seat-name">${escapeHtml(seat.displayName)}${isYou ? " (you)" : ""}</div>
        ${seat.away ? `<div class="seat-away">Away</div>` : ""}
        <div class="seat-stack">${seat.stack} chips</div>
        ${cards ? `<div class="seat-cards">${cards}</div>` : ""}
        ${lastAction}
      </li>`;
  }).join("");

  const board = hand ? hand.board.map(cardHtml).join("") : "";
  const pot = hand ? hand.pots.reduce((sum, p) => sum + p.amount, 0) : 0;

  const turnInfo = !hand
    ? `<p class="turn-info">No hand has been dealt yet.</p>`
    : hand.winners !== null
      ? `<p class="turn-info">Hand finished.</p>`
      : hand.actionTo === null
        ? `<p class="turn-info">Waiting...</p>`
        : `<p class="turn-info" data-turn-deadline="${escapeHtml(view.turnDeadline ?? "")}">
            ${escapeHtml(seatByNo.get(hand.actionTo)?.displayName ?? `seat ${hand.actionTo}`)} to act
            <span class="countdown" data-countdown></span>
          </p>`;

  const youSeat = view.seats.find((s) => s.userId === view.you);
  const canAct = hand && hand.winners === null && youSeat && hand.actionTo === youSeat.seatNo;

  const actionsHtml = `
    <form id="action-form" class="actions" ${canAct ? "" : "hidden"}>
      <button type="submit" name="type" value="fold">Fold</button>
      <button type="submit" name="type" value="check">Check</button>
      <button type="submit" name="type" value="call">Call</button>
      <input type="number" name="amount" min="0" step="1" aria-label="bet or raise amount" />
      <button type="submit" name="type" value="bet">Bet</button>
      <button type="submit" name="type" value="raise">Raise</button>
    </form>`;

  const seatControlsHtml = `
    <form id="sit-form" class="table-controls" ${youSeat ? "hidden" : ""}>
      <button type="submit">Sit down (buy in for ${view.table.buy_in})</button>
    </form>
    <form id="leave-form" class="table-controls" ${youSeat ? "" : "hidden"}>
      <button type="submit">Leave table</button>
    </form>
    <form id="start-form" class="table-controls" ${!hand || hand.winners !== null ? "" : "hidden"}>
      <button type="submit">Start hand</button>
    </form>`;

  // Final brief Step 4: why a seat just emptied.
  const noticeHtml =
    view.notice?.type === "left_away"
      ? `<p class="table-notice">${escapeHtml(
          view.notice.players.map((p) => p.displayName).join(", "),
        )} left the table (away).</p>`
      : "";

  return `
    ${noticeHtml}
    <div class="felt">
      <div class="community">
        <div class="pot">Pot: ${pot}</div>
        <div class="board">${board || "<em>no community cards yet</em>"}</div>
      </div>
      <ul class="seats">${seatsHtml}</ul>
    </div>
    ${turnInfo}
    ${actionsHtml}
    ${seatControlsHtml}`;
}

// Mirrors renderTableHtml above, but runs in the browser from the JSON a
// "view" SSE event carries. Template literals, not a framework — the whole
// point of "small vanilla JS" is that it stays small.
const tableClientScript = String.raw`
(function () {
  var tableId = document.body.dataset.tableId;
  var viewerId = Number(document.body.dataset.viewerId);
  var viewerName = document.body.dataset.viewerName;
  var root = document.getElementById("table-root");
  // Outside #table-root, so a render never wipes it: a message stays until
  // the player's next action (see post()), not until the next push.
  var statusEl = document.getElementById("status-message");
  var bannerEl = document.getElementById("identity-banner");
  // Outside #table-root too, so a render can't wipe it (final brief Step 3).
  var connEl = document.getElementById("conn-pill");
  // Set once this window learns the browser is signed in as someone else
  // (final brief Step 2); only a reload clears it.
  var identityLost = false;

  // Final brief Step 3: only render a view at least as new as the last one
  // painted, so a slow POST response can't paint over a newer push. seq
  // restarts at 0 when the server restarts, under a new bootId, so a changed
  // bootId always renders. Seeded from the server-rendered first paint.
  var lastBootId = document.body.dataset.bootId;
  var lastRenderedSeq = Number(document.body.dataset.seq);
  var lastDecision = null; // which turn the raise amount was typed for; see render()

  var SUITS = { s: ["♠", "black"], h: ["♥", "red"], d: ["♦", "red"], c: ["♣", "black"] };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cardHtml(code) {
    if (!code) return '<span class="card card-back" aria-label="hidden card">??</span>';
    var suit = SUITS[code[1]];
    if (!suit) return '<span class="card">' + esc(code) + "</span>";
    return '<span class="card ' + suit[1] + '">' + esc(code[0]) + suit[0] + "</span>";
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
    var hand = view.hand;
    var seatByNo = {};
    view.seats.forEach(function (s) { seatByNo[s.seatNo] = s; });
    var handPlayers = (hand && hand.players) || [];

    var seatsHtml = "";
    for (var seatNo = 0; seatNo < view.table.max_seats; seatNo++) {
      var seat = seatByNo[seatNo];
      if (!seat) {
        seatsHtml += '<li class="seat seat-empty" data-seat="' + seatNo + '">Empty seat</li>';
        continue;
      }
      var handPlayer = handPlayers[seatNo];
      var isTurn = hand && hand.actionTo === seatNo;
      var isYou = view.you === seat.userId;
      var cardsHtml = "";
      if (handPlayer) {
        var cards = handPlayer.hand || [null, null];
        cardsHtml = '<div class="seat-cards">' + cards.map(cardHtml).join("") + "</div>";
      }
      var lastActionHtml = "";
      if (view.lastAction && view.lastAction.seat === seatNo) {
        var label = (view.lastAction.auto ? "auto-" : "") + view.lastAction.type.toLowerCase();
        lastActionHtml =
          '<span class="last-action' + (view.lastAction.auto ? " auto" : "") + '">' + esc(label) + "</span>";
      }
      seatsHtml +=
        '<li class="seat' + (isTurn ? " seat-turn" : "") + (isYou ? " seat-you" : "") + '" data-seat="' + seatNo + '">' +
        '<div class="seat-name">' + esc(seat.displayName) + (isYou ? " (you)" : "") + "</div>" +
        (seat.away ? '<div class="seat-away">Away</div>' : "") +
        '<div class="seat-stack">' + seat.stack + " chips</div>" +
        cardsHtml + lastActionHtml + "</li>";
    }

    var board = hand ? hand.board.map(cardHtml).join("") : "";
    var pot = hand ? hand.pots.reduce(function (sum, p) { return sum + p.amount; }, 0) : 0;

    var turnInfo;
    if (!hand) {
      turnInfo = '<p class="turn-info">No hand has been dealt yet.</p>';
    } else if (hand.winners !== null) {
      turnInfo = '<p class="turn-info">Hand finished.</p>';
    } else if (hand.actionTo === null) {
      turnInfo = '<p class="turn-info">Waiting...</p>';
    } else {
      var actor = seatByNo[hand.actionTo];
      turnInfo =
        '<p class="turn-info" data-turn-deadline="' + esc(view.turnDeadline || "") + '">' +
        esc((actor && actor.displayName) || "seat " + hand.actionTo) + " to act" +
        '<span class="countdown" data-countdown></span></p>';
    }

    var youSeat = null;
    view.seats.forEach(function (s) { if (s.userId === view.you) youSeat = s; });
    var canAct = hand && hand.winners === null && youSeat && hand.actionTo === youSeat.seatNo;

    var actionsHtml =
      '<form id="action-form" class="actions"' + (canAct ? "" : " hidden") + '>' +
      '<button type="submit" name="type" value="fold">Fold</button>' +
      '<button type="submit" name="type" value="check">Check</button>' +
      '<button type="submit" name="type" value="call">Call</button>' +
      '<input type="number" name="amount" min="0" step="1" aria-label="bet or raise amount" />' +
      '<button type="submit" name="type" value="bet">Bet</button>' +
      '<button type="submit" name="type" value="raise">Raise</button>' +
      "</form>";

    var seatControlsHtml =
      '<form id="sit-form" class="table-controls"' + (youSeat ? " hidden" : "") + '>' +
      '<button type="submit">Sit down (buy in for ' + view.table.buy_in + ")</button></form>" +
      '<form id="leave-form" class="table-controls"' + (youSeat ? "" : " hidden") + '>' +
      '<button type="submit">Leave table</button></form>' +
      '<form id="start-form" class="table-controls"' + (!hand || hand.winners !== null ? "" : " hidden") + '>' +
      '<button type="submit">Start hand</button></form>';

    // Rebuilding the markup would drop what the player is doing: a half-typed
    // raise amount, or keyboard focus. Note both, restore them after.
    var focusKey = document.activeElement && root.contains(document.activeElement)
      ? controlKey(document.activeElement)
      : null;
    // The typed amount belongs to this decision only: keep it while it's
    // still your turn on the same street, drop it once you've acted.
    var amountBefore = root.querySelector("#action-form:not([hidden]) input[name=amount]");
    var typedAmount = amountBefore ? amountBefore.value : "";
    var decision = hand && hand.winners === null ? hand.handNumber + ":" + hand.street + ":" + hand.actionTo : null;
    if (decision !== lastDecision) typedAmount = "";
    lastDecision = decision;

    var noticeHtml = "";
    if (view.notice && view.notice.type === "left_away") {
      noticeHtml =
        '<p class="table-notice">' +
        esc(view.notice.players.map(function (p) { return p.displayName; }).join(", ")) +
        " left the table (away).</p>";
    }

    root.innerHTML =
      noticeHtml +
      '<div class="felt"><div class="community"><div class="pot">Pot: ' + pot + '</div>' +
      '<div class="board">' + (board || "<em>no community cards yet</em>") + "</div></div>" +
      '<ul class="seats">' + seatsHtml + "</ul></div>" +
      turnInfo + actionsHtml + seatControlsHtml;

    var amountAfter = root.querySelector("#action-form input[name=amount]");
    if (amountAfter && typedAmount) amountAfter.value = typedAmount;
    if (focusKey) {
      root.querySelectorAll("button, input").forEach(function (el) {
        if (controlKey(el) === focusKey) el.focus();
      });
    }

    wireForms();
    disableControls();
    updateCountdown(); // paint it now, not up to 250ms later on the next tick
  }

  // Which control this is, in a way that survives the markup being rebuilt:
  // its form, plus its name (an input, whose value changes as you type) or
  // its value (a button: fold, check, ...).
  function controlKey(el) {
    var form = el.form ? el.form.id : "";
    return form + "|" + (el.tagName === "INPUT" ? "input:" + el.name : "button:" + (el.value || el.textContent));
  }

  // The countdown is always recomputed from the server's turn_deadline, not
  // from when the page (or this interval) started — so a push mid-countdown
  // (or several in a row) never resets or drifts it.
  function updateCountdown() {
    var el = document.querySelector("[data-turn-deadline]");
    if (!el) return;
    var deadline = el.getAttribute("data-turn-deadline");
    var span = el.querySelector("[data-countdown]");
    if (!deadline || !span) return;
    var secondsLeft = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
    span.textContent = " (" + secondsLeft + "s)";
  }

  function showError(message) {
    // Once the identity banner is up it says why nothing works; a second
    // copy of that in the status line is noise.
    statusEl.textContent = identityLost ? "" : message;
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

  function wireForms() {
    var sitForm = document.getElementById("sit-form");
    if (sitForm) sitForm.addEventListener("submit", function (e) {
      e.preventDefault();
      post("/tables/" + tableId + "/sit").then(render).catch(function (err) { showError(err.message); });
    });
    var leaveForm = document.getElementById("leave-form");
    if (leaveForm) leaveForm.addEventListener("submit", function (e) {
      e.preventDefault();
      post("/tables/" + tableId + "/leave").then(render).catch(function (err) { showError(err.message); });
    });
    var startForm = document.getElementById("start-form");
    if (startForm) startForm.addEventListener("submit", function (e) {
      e.preventDefault();
      post("/tables/" + tableId + "/start").then(render).catch(function (err) { showError(err.message); });
    });
    var actionForm = document.getElementById("action-form");
    if (actionForm) actionForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var type = e.submitter ? e.submitter.value : "";
      var amount = new FormData(actionForm).get("amount");
      var fields = { type: type };
      if (amount) fields.amount = String(amount);
      post("/tables/" + tableId + "/act", fields).then(render).catch(function (err) { showError(err.message); });
    });
  }

  setInterval(updateCountdown, 250);

  document.getElementById("identity-reload").addEventListener("click", function () {
    location.reload();
  });

  wireForms();
  updateCountdown(); // paint the server-rendered first paint's countdown immediately too

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
    if (document.visibilityState === "visible" && !identityLost) fetchView();
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
})();
`;

const TABLE_STYLE = `
  .felt { background: #0b5d33; color: #fff; border-radius: 12px; padding: 1rem; max-width: 100%; box-sizing: border-box; }
  .community { text-align: center; margin-bottom: 1rem; }
  .pot { font-weight: bold; }
  .board { min-height: 2.5rem; }
  .seats { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0; margin: 0; justify-content: center; }
  .seat { background: rgba(255,255,255,0.1); border-radius: 8px; padding: 0.5rem; min-width: 7rem; max-width: 100%; box-sizing: border-box; }
  .seat-empty { opacity: 0.6; }
  .seat-away { font-size: 0.85rem; font-style: italic; opacity: 0.8; }
  .table-notice { margin: 0 0 0.5rem; font-style: italic; }
  .seat-turn { outline: 3px solid gold; }
  .seat-you { border: 2px solid #fff; }
  .seat-cards { margin-top: 0.25rem; }
  .card { display: inline-block; border: 1px solid #333; border-radius: 4px; background: #fff; color: #000;
          padding: 0.1rem 0.35rem; margin-right: 0.2rem; font-weight: bold; min-width: 1.5rem; text-align: center; }
  .card.red { color: #b00020; }
  .card.black { color: #000; }
  .card-back { background: #333; color: #333; }
  .last-action { display: block; font-size: 0.8em; font-style: italic; }
  .last-action.auto { color: gold; }
  .turn-info { font-weight: bold; }
  .actions, .table-controls { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
  /* Same specificity as the class rule above, so without this the [hidden]
     attribute's default UA style (display: none) loses to .actions's
     display: flex and a "hidden" form still renders — caught by actually
     looking at a real render, not by pnpm check. */
  .actions[hidden], .table-controls[hidden] { display: none; }
  .actions input[type="number"] { width: 6rem; max-width: 100%; }
  .identity-banner { background: #fff4d6; color: #3a2a00; border: 2px solid #b8860b; border-radius: 8px;
                     padding: 0.75rem 1rem; margin: 0.5rem 0; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem;
                     align-items: center; }
  .identity-banner p { margin: 0; flex: 1 1 20rem; }
  .identity-banner[hidden] { display: none; }
  .table-header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; }
  .table-header h1 { margin-right: auto; }
  /* The mockup's .conn: a dot coloured by state. */
  .conn { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; }
  .conn::before { content: ""; flex: none; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: #6fcf97; }
  .conn[data-state="reconnecting"]::before { background: #e2b24f; }
  .conn[data-state="offline"]::before { background: #c0302a; }
  .conn[hidden] { display: none; }
`;

export function renderTablePage(view: TableView): string {
  const body = `
    <style>${TABLE_STYLE}</style>
    <main data-table-id="${view.table.id}">
      <div class="table-header">
        <h1>${escapeHtml(view.table.name)}</h1>
        <span id="conn-pill" class="conn" data-state="reconnecting" role="status">Reconnecting…</span>
      </div>
      <p><a href="/">Home</a></p>
      <div id="identity-banner" class="identity-banner" role="alert" hidden>
        <p data-banner-text></p>
        <button type="button" id="identity-reload">Reload</button>
      </div>
      <p id="status-message" role="status" aria-live="polite"></p>
      <div id="table-root">${renderTableHtml(view)}</div>
    </main>
    <script>${tableClientScript}</script>`;
  // Read off document.body by the inline script. data-viewer-id is who this
  // page was rendered for; every POST sends it back as "as" (final brief
  // Step 2), and a view whose "you" differs means the cookie changed hands.
  // data-seq/data-boot-id are this first paint's place in the seq order
  // (Step 3), so a slower, older response can't replace it either.
  return page(view.table.name, body).replace(
    "<body>",
    `<body data-table-id="${view.table.id}" data-viewer-id="${view.you ?? ""}" data-viewer-name="${escapeHtml(view.youDisplayName ?? "")}" data-seq="${view.seq}" data-boot-id="${escapeHtml(view.bootId)}">`,
  );
}
