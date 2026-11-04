-- Brief 2 Step 11: guest accounts. A guest is a signed-in account made in one
-- tap, with a generated name, a password hash nobody knows and no security
-- questions. Claiming it from the profile sets this back to 0. Existing
-- accounts are all registered ones, so the default is 0.
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
