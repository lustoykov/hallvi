// Called only by the offline, backed-up schema preparation command. Keep
// workspace IDs as execution history while conversations acquire an owner.
export function migrateChatOwnership(database) {
  const columns = database.prepare("PRAGMA table_info(chats)").all();
  if (
    !columns.length ||
    columns.some((column) => column.name === "application_id")
  )
    return;
  const retained = [
    "id",
    "workspace_id",
    "title",
    "is_primary",
    "created_at",
    "archived_at",
    "native_session_id",
  ];
  if (columns.some((column) => !retained.includes(column.name)))
    throw new Error(
      "Unexpected chat columns. Inspect the backup before migrating.",
    );
  if (database.pragma("foreign_key_check").length)
    throw new Error(
      "Invalid source references. Chat migration was not attempted.",
    );

  const associatedObjects = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE tbl_name = 'chats' AND type IN ('index', 'trigger') AND sql IS NOT NULL",
    )
    .all();
  const foreignKeys = database.pragma("foreign_keys", { simple: true });
  // Disabling FKs outside the transaction prevents DROP TABLE from cascading
  // into transcripts/runs. Validate the entire graph before committing.
  database.pragma("foreign_keys = OFF");
  try {
    database
      .transaction(() => {
        const tables = database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all();
        const counts = tables.map(({ name }) => [name, count(database, name)]);
        database.exec(`CREATE TABLE chats_with_owner (
        id text PRIMARY KEY NOT NULL,
        application_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        workspace_id text NOT NULL REFERENCES phase_workspaces(id) ON DELETE CASCADE,
        title text NOT NULL,
        is_primary integer DEFAULT false NOT NULL,
        created_at text NOT NULL,
        archived_at text,
        native_session_id text
      )`);
        const selection = retained
          .map((name) =>
            columns.some((column) => column.name === name)
              ? `c.${name}`
              : "NULL",
          )
          .join(", ");
        database.exec(`INSERT INTO chats_with_owner (${retained.join(", ")}, application_id)
        SELECT ${selection}, w.application_id FROM chats c
        JOIN phase_workspaces w ON w.id = c.workspace_id`);
        if (count(database, "chats_with_owner") !== count(database, "chats"))
          throw new Error(
            "A conversation has no application owner. Migration rolled back.",
          );
        const present = columns.map((column) => column.name).join(", ");
        if (
          database
            .prepare(
              `SELECT ${present} FROM chats EXCEPT SELECT ${present} FROM chats_with_owner`,
            )
            .get()
        )
          throw new Error(
            "Conversation history changed during migration. Migration rolled back.",
          );
        database.exec(
          "DROP TABLE chats; ALTER TABLE chats_with_owner RENAME TO chats",
        );
        for (const { sql } of associatedObjects) database.exec(sql);
        for (const [name, before] of counts) {
          if (count(database, name) !== before)
            throw new Error(
              `Migration changed retained ${name} row count. Rolled back.`,
            );
        }
        if (database.pragma("foreign_key_check").length)
          throw new Error(
            "Migration produced invalid references. Rolled back.",
          );
      })
      .immediate();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function count(database, name) {
  return database
    .prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`)
    .get().n;
}
