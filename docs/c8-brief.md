# C8 brief — "It's alive!" (first working slice)

Read `CLAUDE.md` first; its rules apply to every step below.

## What this week's slice is

The final project's direction is **not decided yet**, and `README.md` (already
written by the human) says so honestly. This week ships the smallest thing that
is alive:

- A stranger can **register** (username + password), **log in**, and **edit a
  profile**: a display name and a one-line bio (signature).
- When they come back later (new session, after a restart or redeploy), they
  log in and **find the name and bio they saved**. That is their trace.
- The home page lists members (display name + bio), so more than one person is
  visible and the app tells them apart.
- A user who forgot their password can reset it by answering the **security
  questions** they set at registration (no email, no phone number). This is a
  deliberate, owner-made choice: do not replace it with another recovery
  method or argue it away; implement it with the protections in Step 4.

Out of scope this week: real-time updates, any feature beyond the above,
email, avatars, styling beyond clean and readable.

## Fixed constraints (from the template — do not change)

- `fly.toml`: one shared-cpu-1x machine, **256 MB**, one volume at **`/data`**
  (the only storage that survives restarts and redeploys). App serves plain HTTP
  on `0.0.0.0:$PORT`; Fly terminates TLS.
- `spec/invariants.test.ts`: `/` returns 200, and `/readme/` contains every
  `README.md` heading, in order, in the HTML the **server** sends (no client JS).
- CI builds the `Dockerfile`, runs it with a throwaway `/data`, and runs
  `pnpm check` against it. A red check blocks the deploy.

## Working rules for this brief

- Do **one step**, report what you did and what you verified, then **stop and
  wait for a go-ahead**.
- Do **not** write or edit `README.md`, `PROCESS.md`, `reflections/`, or the
  *Decision* section of any ADR. Those are written by the human.
- `README.md` is the contract. Its **Enforced** list is what the Step 5 checks
  must prove, one check per promise. If the implementation cannot keep a
  README promise, stop and tell the human; never change the README to match
  the code.
- Never open or print `mise.local.toml` (it holds the Fly token).
- Do not install system tools (e.g. `flyctl`) without asking.
- One commit per step; log each commit in `process-log.md` as `CLAUDE.md`
  describes (entry written before the next commit, citing the real hash).

---

## Step 0 — Prove the deploy path (human runs the deploy)

Check that `flyctl` is available and that `mise.local.toml` exists (existence
only). Tell the human the exact deploy command from `fly.toml`. The human
deploys the untouched placeholder and confirms `https://<repo>.fly.dev/` returns
200. No commit unless something had to change.

## Step 1 — Stack options (ADR draft, no code)

Create `docs/adr/0001-stack.md` with: **Context** (the constraints above, plus:
real-time is required from week 10, `/readme/` must be server-rendered, auth
with hashed passwords, a solo developer with limited time), **Options** (2–3
realistic stacks, e.g. the course default Astro + Drizzle + SQLite used in
crit 7, a lighter Node server such as Hono + SQLite, and one more if worth
it), and for each option: how it serves `/readme/`, how it would add real-time
later (SSE/WebSocket), memory fit in 256 MB, migration story, and what it
costs. Leave **Decision** and **Consequences** empty for the human.
**Stop.** Do not scaffold anything until the human fills in the decision.

## Step 2 — Scaffold the chosen stack + `/readme/`

- Scaffold the chosen stack; replace the placeholder `Dockerfile` so the image
  serves the app on `0.0.0.0:$PORT`.
- `/` returns 200 with a minimal page.
- `/readme/` renders `README.md` to HTML **on the server** (a markdown library
  is fine) and serves it in full. Relative image links in the README must
  resolve at `/readme/` too.
- SQLite file lives under `/data` in production (path from an env var with a
  local default for dev).
- Verify: build and run the Docker image locally, then `APP_URL=... pnpm check`
  is green (the README already has headings, so the `/readme/` check is real).

## Step 3 — Smallest schema

Three tables only, as a migration that runs on boot:

- `users`: id, username (**unique**), password_hash, display_name, bio,
  recovery_failed_attempts, recovery_locked_until, created_at
- `security_questions`: user_id → users, position, question, answer_hash
  (unique on user_id + position)
- `sessions`: token (primary key), user_id → users, created_at, expires_at

Show the generated SQL in your report. **Stop** so the human can read it.

## Step 4 — Register, log in, log out, edit profile

- Passwords: hash with `node:crypto` `scrypt` and a per-user random salt;
  compare with `timingSafeEqual`. Never store or log a plaintext password.
- Sessions: random 32-byte token in an `httpOnly`, `SameSite=Lax` cookie;
  `Secure` only when the request came over HTTPS (check `X-Forwarded-Proto`,
  since Fly terminates TLS).
- Limits: username 3–20 chars `[a-z0-9_]`; display name ≤ 40 chars; bio ≤ 160
  chars. All user text is HTML-escaped on output.
- Security questions: at registration the user writes their own questions and
  answers. How many is a named constant, `RECOVERY_QUESTION_COUNT = 2`
  (the owner may change it to 3). Each answer is normalised (trim, lowercase,
  collapse spaces) and then hashed exactly like a password (scrypt + its own
  salt). Never store or log an answer in plain text.
- Password reset: username → show their questions → all answers + new
  password. **Every** answer must be correct; a failed attempt counts once and
  the error never says which answer was wrong.
  After **5** failed attempts, recovery for that username is locked for
  **1 hour** (`recovery_locked_until`). A successful reset clears the counter
  and **deletes all existing sessions** for that user. The error message for a
  wrong answer must not reveal whether the username exists beyond what the
  login form already reveals.
- Pages: register, log in, forgot password, "my profile" (edit name + bio,
  log out), and the home page listing members.
- Every form works with the keyboard alone and has visible labels and error
  messages.

## Step 5 — Our own checks (`spec/accounts.test.ts`)

Against the running app over HTTP, with random usernames so reruns don't
collide:

1. **Trace persists:** register, set name + bio, then log in again with a
   *fresh* session → the profile page shows the saved bio. Assert on the parsed
   DOM node that holds the bio, not on a raw HTML substring (CLAUDE.md: assert
   meaning, not spelling).
2. A second registration with the same username is rejected.
3. A wrong password does not create a session.
4. Editing a profile without a valid session is rejected and changes nothing.
5. One wrong answer (with the others correct) does not change the password
   (the old password still logs in), and the response does not say which
   answer was wrong.
6. All answers correct resets the password: the new one logs in, the
   old one no longer does, and a session from before the reset is no longer
   valid.
7. After 5 failed attempts, even all-correct answers are refused (locked).

Then prove test 1 is not vacuous: deliberately break saving the bio, confirm
**test 1 (and only the expected tests) go red**, revert, confirm green. Report
exactly which tests went red.

## Step 6 — Look at it, then deploy

- Open the built app (served over HTTP) at **1920×1080** and **390×844**; do a
  Tab-key pass through register → profile. Report what you saw and anything
  you did not check.
- Human runs the deploy, then checks by hand on the live URL: register on the
  phone, close the tab, come back later, log in, bio still there.

## Step 7 — Human only (agent does not draft these)

The ADR decision, `PROCESS.md`, `reflections/crit-8.md` (`README.md` v1 is
already done; the human revises it if the build changes anything it promises).
Then `pnpm check` and `pnpm check:evidence` green, then `/ship` before the cutoff.
