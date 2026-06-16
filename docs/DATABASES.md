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

The backend API uses MySQL for hosted data persistence. Web login, director creation, desktop sync uploads, sessions, and director green leaf book reads all go through the MySQL-backed store.

Reference schema:

```text
apps/backend/src/mysql-schema.sql
```

MySQL Workbench is suitable for this hosted backend database.

Configure the backend with `.env` values at the repository root:

```text
PORT=8080
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=tea_leaf_system
MYSQL_USER=root
MYSQL_PASSWORD=damitha1234
```

The backend creates the configured database, creates missing tables from `apps/backend/src/mysql-schema.sql`, and seeds the development super admin at startup when the MySQL user has permission.

## Current Persistence Notes

- Desktop uses SQLite through Node's built-in `node:sqlite` module in the spawned sync server.
- Electron does not load SQLite directly; it starts the sync server as a normal Node process.
- The desktop app can migrate an old `tea-local-db.json` file into SQLite if that JSON file exists beside the new `.sqlite` file.
- Desktop office-user and line-user passwords are stored as salted `scrypt` hashes.
- Existing legacy plain-text desktop passwords are transparently upgraded after a successful login.
- Backend web/director users and sessions are stored in MySQL.
- Backend logout deletes the current bearer token from the `sessions` table.
- Suppliers are validated against active registered tea lines before saving.
- Local runtime data, WAL files, and logs are excluded from Git.
