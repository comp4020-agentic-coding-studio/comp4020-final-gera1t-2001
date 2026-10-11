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

  return `
    <p id="status-message" role="status" aria-live="polite"></p>
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
  var root = document.getElementById("table-root");
  var statusEl = null;

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

    root.innerHTML =
      '<p id="status-message" role="status" aria-live="polite"></p>' +
      '<div class="felt"><div class="community"><div class="pot">Pot: ' + pot + '</div>' +
      '<div class="board">' + (board || "<em>no community cards yet</em>") + "</div></div>" +
      '<ul class="seats">' + seatsHtml + "</ul></div>" +
      turnInfo + actionsHtml + seatControlsHtml;

    statusEl = document.getElementById("status-message");
    wireForms();
    updateCountdown(); // paint it now, not up to 250ms later on the next tick
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
    if (statusEl) statusEl.textContent = message;
  }

  function post(path, body) {
    return fetch(path, { method: "POST", body: body })
      .then(function (res) {
        return res.json().then(function (data) {
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
      var body = new URLSearchParams();
      body.set("type", type);
      if (amount) body.set("amount", String(amount));
      post("/tables/" + tableId + "/act", body).then(render).catch(function (err) { showError(err.message); });
    });
  }

  setInterval(updateCountdown, 250);

  wireForms();
  updateCountdown(); // paint the server-rendered first paint's countdown immediately too

  var source = new EventSource("/tables/" + tableId + "/events");
  source.addEventListener("view", function (event) {
    render(JSON.parse(event.data));
  });
  source.onerror = function () {
    showError("Live updates disconnected — reconnecting...");
  };
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
`;

export function renderTablePage(view: TableView): string {
  const body = `
    <style>${TABLE_STYLE}</style>
    <main data-table-id="${view.table.id}">
      <h1>${escapeHtml(view.table.name)}</h1>
      <p><a href="/">Home</a></p>
      <div id="table-root">${renderTableHtml(view)}</div>
    </main>
    <script>${tableClientScript}</script>`;
  // data-table-id lives on <body> (not just <main>) because the inline
  // script reads it off document.body for simplicity.
  return page(view.table.name, body).replace("<body>", `<body data-table-id="${view.table.id}">`);
}
