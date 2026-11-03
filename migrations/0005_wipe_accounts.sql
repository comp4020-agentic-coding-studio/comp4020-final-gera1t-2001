-- Owner decision (4 Nov 2026): wipe every account on production once, for a
-- clean start before friends are invited and before marking. This is the
-- wipe brief 1's "Next" postponed. The app starts again with no users and an
-- empty table 1. A backup of the production database was taken and
-- downloaded before this was pushed; it is kept outside the repo because it
-- holds password hashes.
--
-- Removes every row that belongs to an account: the live hand, seats, hand
-- history, security questions, sessions, and the users themselves. Deletes
-- run explicitly, child tables first, instead of relying on ON DELETE
-- CASCADE, so the migration says what it removes and doesn't depend on
-- foreign_keys being on. poker_tables (table 1 itself) and schema_migrations
-- are left alone. With table_state gone, startHand treats the missing row as
-- version 0, as after 0004.
--
-- src/db.ts applies this on the first boot after deploy, inside the import
-- that src/server.ts makes before restoreSchedulersOnBoot(), so no turn timer
-- is ever armed for the deleted hand.
DELETE FROM table_state;
DELETE FROM seats;
DELETE FROM hand_results;
DELETE FROM security_questions;
DELETE FROM sessions;
DELETE FROM users;
