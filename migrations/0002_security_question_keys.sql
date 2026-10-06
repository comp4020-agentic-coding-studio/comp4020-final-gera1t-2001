-- Security questions are no longer free text (step 4b): a user picks two
-- different questions from a fixed catalog kept in code
-- (src/security-questions.ts), and this column stores which one, by key.
ALTER TABLE security_questions RENAME COLUMN question TO question_key;

-- Belt-and-braces alongside the app-level "two different questions" check:
-- the same question can't be stored twice for one user.
CREATE UNIQUE INDEX security_questions_user_question_key ON security_questions (user_id, question_key);
