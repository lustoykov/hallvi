# Protect and restore application data

**Goal:** “Make sure my data is backed up.” Finish with a clear policy, verified off-host backup and isolated restoration evidence. This applies to the supported single-instance stack, including embedded state and persistent files.

1. Inspect PostgreSQL/SQLite and other required state: uploads, documents, repositories, configuration and necessary keys. Identify existing protection and coverage gaps.
2. Recommend R2 or S3, schedule and retention, reusing existing access where sensible. Explain the recovery window and relevant cost; ask for missing access or authority inline.
3. Configure a consistent method for the actual data. Do not copy a live SQLite file blindly or assume a PostgreSQL dump includes uploaded documents. Keep credentials out of transcripts and repositories.
4. Record backup creation, transfer and verification separately. A failed off-host upload must remain a failed protection outcome even if a local dump exists.
5. Restore to an isolated disposable destination and verify meaningful application data. Show recovery point, test time, what was checked and remaining gaps. Testing a backup must not overwrite live data.
6. Run the configured schedule independently of the controller/chat, record failures and create an in-app issue when protection falls behind policy.

Controller records/native sessions and diagnostic archives have separate protection and retention from application data. Queue state may replay work after restoration; follow the actual application's recovery rules and do not claim exactly-once effects.

**Acceptance:** both R2 and S3, successful backup/restore, expired access, failed/partial transfer, stale backup and controller restart. Manual replacement-host recovery preserves application history and verifies one intended active writer/scheduler before cutover. Production restoration needs its own authority. No automatic failover or zero-data-loss claim follows from a schedule.
