# Databases

## Desktop Local Database

The desktop app uses SQLite for offline local storage.

Runtime file:

```text
apps/desktop/desktop-data/tea-local-db.sqlite
```

This runtime database is intentionally ignored by Git.

Open it with DB Browser for SQLite or a similar SQLite viewer. MySQL Workbench cannot open this file because it is not MySQL.

The reference desktop schema is:

```text
apps/desktop/src/sqlite-schema.sql
```

## Hosted Backend Database

The backend production target is MySQL.

Reference schema:

```text
apps/backend/src/mysql-schema.sql
```

MySQL Workbench is suitable for this hosted backend database.

## Current Persistence Notes

- Desktop uses SQLite through Node's built-in `node:sqlite` module in the spawned sync server.
- Electron does not load SQLite directly; it starts the sync server as a normal Node process.
- The desktop app can migrate an old `tea-local-db.json` file into SQLite if that JSON file exists beside the new `.sqlite` file.
- Local runtime data, WAL files, and logs are excluded from Git.

