# External destination database — SQL run order

Run these in the destination project's SQL Editor, top to bottom.
Every file is idempotent (safe to run more than once).

1. `call_reports.sql` — base `call_reports` table (transcript + report JSON).
2. `telecaller_data.sql` — base `telecaller_data` table (one column per detailed caller-report sub-heading; introduction score column is `introduction_score_1`).
3. `workspace-access.sql` — profiles, user roles, Admin session/attempt-limit tables,
   owner/admin read policies, and the extra workspace columns
   (`owner_id`, `submission_key`, `processing_status`).

After the SQL: create the private `call-audio` storage bucket through the
Storage API (not SQL) — the app's audio upload needs it.

`destination-data.json` in project backups is an exported data snapshot,
not schema — restore it only after all three SQL files have run.
