// Final brief Step 8: the Results page, a ledger read from hand_results. Play
// chips only, so the nets are bragging rights, not money; the page says so.
import { db } from "./db.ts";
import { escapeHtml } from "./html.ts";

export interface LedgerRow {
  userId: number;
  displayName: string;
  hands: number;
  net: number;
}

export interface RecentHand {
  endedAt: string;
  players: { userId: number; displayName: string; net: number }[];
}

// How many finished hands the page lists.
export const RECENT_HANDS = 20;

// Per player: hands played and net chips over every hand they were dealt
// into, best first. A user with no rows isn't listed.
export function ledger(tableId: number): LedgerRow[] {
  return db
    .prepare(
      `SELECT users.id AS userId, users.display_name AS displayName,
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
              users.display_name AS displayName, hand_results.net AS net
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

function netCell(n: number): string {
  return `<td class="num${n < 0 ? " neg" : ""}" data-net="${n}">${signed(n)}</td>`;
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
              `<tr data-user-id="${r.userId}"${r.userId === youId ? ` class="you"` : ""}><th scope="row">${escapeHtml(r.displayName)}${r.userId === youId ? " (you)" : ""}</th>` +
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
                    `<td>${escapeHtml(p.displayName)}</td>${netCell(p.net)}</tr>`,
                )
                .join("")}</tbody>`,
          )
          .join("")}
      </table>`
    : "";

  return `<main class="column results">
      <h1>Results</h1>
      <p class="lede-room">Play chips only. Nothing here is money.</p>
      <h2>Ledger</h2>
      ${ledgerHtml}
      ${hands.length ? `<h2>${hands.length < RECENT_HANDS ? "Hands so far" : `Last ${RECENT_HANDS} hands`}</h2>${handsHtml}` : ""}
    </main>
    <script>
      // The server runs in UTC; show each hand's end in this browser's time.
      document.querySelectorAll(".results time[datetime]").forEach(function (el) {
        var d = new Date(el.getAttribute("datetime"));
        if (!isNaN(d)) el.textContent = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      });
    </script>`;
}
