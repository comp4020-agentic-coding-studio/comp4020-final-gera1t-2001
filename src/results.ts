// Final brief Step 8: the Results page, a ledger read from hand_results. Play
// chips only, so the nets are bragging rights, not money; the page says so.
import { db } from "./db.ts";
import { escapeHtml } from "./html.ts";
import { recentSoloHands, soloLedger } from "./solo/game.ts";

export interface LedgerRow {
  userId: number;
  displayName: string;
  isGuest: number; // brief 2 Step 11: 1 for an unclaimed guest
  hands: number;
  net: number;
}

export interface RecentHand {
  endedAt: string;
  players: { userId: number; displayName: string; isGuest: number; net: number }[];
}

// How many finished hands the page lists.
export const RECENT_HANDS = 20;

// Per player: hands played and net chips over every hand they were dealt
// into, best first. A user with no rows isn't listed.
export function ledger(tableId: number): LedgerRow[] {
  return db
    .prepare(
      `SELECT users.id AS userId, users.display_name AS displayName, users.is_guest AS isGuest,
              COUNT(*) AS hands, SUM(hand_results.net) AS net
       FROM hand_results JOIN users ON users.id = hand_results.user_id
       WHERE hand_results.table_id = ?
       GROUP BY users.id
       ORDER BY net DESC, hands DESC, users.display_name ASC`,
    )
    .all(tableId) as LedgerRow[];
}

// hand_results has no hand id: a hand is the rows written together when it
// ended. Since final brief Step 8 they share one ended_at (commitPreparedAction
// stamps it once), but older rows used SQLite's per-statement 'now', so one
// hand's rows can sit a few milliseconds apart. Rows within
// SAME_HAND_WINDOW_MS of the previous one are the same hand. Measured on the
// dev database's 394 older rows: rows of one hand were 0-3 ms apart, and the
// closest two separate hands (a test script dealing and folding over HTTP)
// were 29 ms apart. A person can't end hands that fast.
const SAME_HAND_WINDOW_MS = 10;

export function recentHands(tableId: number, limit = RECENT_HANDS): RecentHand[] {
  // Every row for the table, newest first: a home game's history is small,
  // and grouping by time can't be done with a plain LIMIT on rows.
  const rows = db
    .prepare(
      `SELECT hand_results.ended_at AS endedAt, users.id AS userId,
              users.display_name AS displayName, users.is_guest AS isGuest, hand_results.net AS net
       FROM hand_results JOIN users ON users.id = hand_results.user_id
       WHERE hand_results.table_id = ?
       ORDER BY hand_results.ended_at DESC, hand_results.id DESC`,
    )
    .all(tableId) as ({ endedAt: string } & RecentHand["players"][number])[];
  const hands: (RecentHand & { lastAt: number })[] = [];
  for (const { endedAt, ...player } of rows) {
    const at = new Date(endedAt).getTime();
    const current = hands[hands.length - 1];
    if (current && current.lastAt - at <= SAME_HAND_WINDOW_MS) {
      current.players.push(player);
      current.lastAt = at;
    } else {
      if (hands.length === limit) break;
      hands.push({ endedAt, players: [player], lastAt: at });
    }
  }
  return hands.map(({ endedAt, players }) => ({
    endedAt,
    players: players.sort((x, y) => y.net - x.net),
  }));
}

// Signed, so a loss and a win read differently even without colour.
function signed(n: number): string {
  if (n > 0) return `+${n.toLocaleString("en-AU")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("en-AU")}`;
  return "0";
}

// Brief 2 Step 11: an unclaimed guest's name carries a small tag, so a
// ledger of "Wombat 27"s reads as guests, not as regulars who chose that.
function playerName(p: { displayName: string; isGuest: number }): string {
  return `${escapeHtml(p.displayName)}${p.isGuest ? ` <span class="tag" data-guest>guest</span>` : ""}`;
}

function netCell(n: number): string {
  return `<td class="num${n < 0 ? " neg" : ""}" data-net="${n}">${signed(n)}</td>`;
}

// Brief 2 Step 12: Against the house. Its own ledger and its own recent
// hands, from solo_hands only; never summed with the table's.
const OUTCOME_WORDS: Record<string, string> = {
  fold: "Folded",
  no_qualify: "Dealer didn't qualify",
  player_wins: "Beat the dealer",
  dealer_wins: "Dealer won",
  push: "Push",
};

function houseSection(youId: number): string {
  const rows = soloLedger();
  const recent = recentSoloHands(RECENT_HANDS);
  const ledgerHtml = rows.length
    ? `<table class="ledger" id="house-ledger">
        <caption class="visually-hidden">Net chips against the house per player, best first</caption>
        <thead><tr><th scope="col">Player</th><th scope="col" class="num">Hands</th><th scope="col" class="num">Net</th></tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr data-user-id="${r.userId}"${r.userId === youId ? ` class="you"` : ""}><th scope="row">${playerName(r)}${r.userId === youId ? " (you)" : ""}</th>` +
              `<td class="num" data-hands="${r.hands}">${r.hands.toLocaleString("en-AU")}</td>${netCell(r.net)}</tr>`,
          )
          .join("")}</tbody>
      </table>`
    : `<p>No one has played the house yet.</p>`;
  const recentHtml = recent.length
    ? `<h3>${recent.length < RECENT_HANDS ? "Hands so far" : `Last ${RECENT_HANDS} hands`}</h3>
      <table class="ledger" id="house-recent">
        <caption class="visually-hidden">The last ${recent.length} ${recent.length === 1 ? "hand" : "hands"} against the house, newest first</caption>
        <thead><tr><th scope="col">Ended</th><th scope="col">Player</th><th scope="col">Result</th><th scope="col" class="num">Net</th></tr></thead>
        <tbody>${recent
          .map(
            (h) =>
              `<tr><td><time datetime="${escapeHtml(h.endedAt)}">${escapeHtml(h.endedAt.slice(0, 16).replace("T", " "))} UTC</time></td>` +
              `<td data-user-id="${h.userId}">${playerName(h)}</td><td>${escapeHtml(OUTCOME_WORDS[h.outcome] ?? h.outcome)}</td>${netCell(h.net)}</tr>`,
          )
          .join("")}</tbody>
      </table>`
    : "";
  return `<h2>Against the house</h2>${ledgerHtml}${recentHtml}`;
}

export function resultsPage(tableId: number, youId: number): string {
  const rows = ledger(tableId);
  const hands = recentHands(tableId);

  const ledgerHtml = rows.length
    ? `<table class="ledger" id="ledger">
        <caption class="visually-hidden">Net chips per player, best first</caption>
        <thead><tr><th scope="col">Player</th><th scope="col" class="num">Hands</th><th scope="col" class="num">Net</th></tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr data-user-id="${r.userId}"${r.userId === youId ? ` class="you"` : ""}><th scope="row">${playerName(r)}${r.userId === youId ? " (you)" : ""}</th>` +
              `<td class="num" data-hands="${r.hands}">${r.hands.toLocaleString("en-AU")}</td>${netCell(r.net)}</tr>`,
          )
          .join("")}</tbody>
      </table>`
    : `<p>No hands have finished yet. Results show up here after the first one.</p>`;

  // One row per player per hand, so every net sits in its own right-aligned
  // numeric cell like the ledger's; the hand's end time spans its rows.
  const handsHtml = hands.length
    ? `<table class="ledger" id="recent">
        <caption class="visually-hidden">The last ${hands.length} ${hands.length === 1 ? "hand" : "hands"}, newest first</caption>
        <thead><tr><th scope="col">Ended</th><th scope="col">Player</th><th scope="col" class="num">Net</th></tr></thead>
        ${hands
          .map(
            (h) =>
              `<tbody class="hand">${h.players
                .map(
                  (p, i) =>
                    `<tr>${i === 0 ? `<td rowspan="${h.players.length}"><time datetime="${escapeHtml(h.endedAt)}">${escapeHtml(h.endedAt.slice(0, 16).replace("T", " "))} UTC</time></td>` : ""}` +
                    `<td data-user-id="${p.userId}">${playerName(p)}</td>${netCell(p.net)}</tr>`,
                )
                .join("")}</tbody>`,
          )
          .join("")}
      </table>`
    : "";

  return `<main class="column results">
      <h1>Results</h1>
      <p class="lede-room">Play chips only. Nothing here is money. The table and the house are kept apart; their nets are never added together.</p>
      <h2>Table</h2>
      ${ledgerHtml}
      ${hands.length ? `<h3>${hands.length < RECENT_HANDS ? "Hands so far" : `Last ${RECENT_HANDS} hands`}</h3>${handsHtml}` : ""}
      ${houseSection(youId)}
    </main>
    <script>
      // The server runs in UTC; show each hand's end in this browser's time.
      document.querySelectorAll(".results time[datetime]").forEach(function (el) {
        var d = new Date(el.getAttribute("datetime"));
        if (!isNaN(d)) el.textContent = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      });
    </script>`;
}
