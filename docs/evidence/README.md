# Evidence behind docs/final-brief.md

Gathered on 18 Oct 2026, in the owner's session with Claude in chat, before
any code changed. Treat it as a record of what was seen, not as code to ship.

| File | What it shows |
|---|---|
| `production-timeline-2026-10-18.json` | A recorder stream on the live table page. Every push arrived within the clock-offset error of the server's own action timestamp, but the page's own `EventSource` stopped rendering after 12:35:26 and still showed "soundwave to act (0s)" at 12:43:36. A second stream opened in the same page at 12:37:00 got the current state at once. Two absent players (soundwave, lynx) each cost a full 30 s turn. |
| `repro-same-browser-two-accounts.mjs` | One browser context (shared cookies), two windows, two accounts. Window A's Call is rejected as "Player 2 attempted to act, but action is on seat 0", because its POST carries B's cookie. Brief Step 2. |
| `repro-ghost-seats.mjs` | Three accounts sit down and close their browsers; a fourth deals. Every ghost turn takes the full timeout. Run the app with `TURN_TIMEOUT_SECONDS=5` to keep it short. Brief Step 4. |
| `before-register-390.png`, `before-login-1920.png` | The log-in and register pages before this brief. |

Both scripts use `playwright-core` and expect `CHROMIUM_PATH` (a Chromium
binary) and `BASE` (default `http://localhost:8080`). They register random
accounts, so run them **against a local app only**, never production.
