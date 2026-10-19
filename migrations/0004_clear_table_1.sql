-- Final brief Step 4, owner decision (18 Oct): clear the live table once.
-- Players left seated from testing would otherwise stay seated forever, and
-- the presence rules that stand ghosts up only start with this deploy. This
-- empties table 1 so everyone sits down again with a fresh buy-in.
--
-- hand_results is untouched, so history stays. table_state goes too, so no
-- hand is left in progress for seats that no longer exist; startHand treats
-- a missing row as version 0. src/db.ts applies this on the first boot after
-- deploy, inside the import that src/server.ts makes before
-- restoreSchedulersOnBoot(), so no turn timer is ever armed for the deleted
-- hand.
DELETE FROM table_state WHERE table_id = 1;
DELETE FROM seats WHERE table_id = 1;
