# Roadmap

## Phase 1: Mobile Field Collection

- Complete Android login against synced line users.
- Implement Room repositories and JSON parsing for master-data sync.
- Connect collection form to local SQLite storage.
- Implement Bluetooth printer pairing and GOOJPRT PT-210 receipt printing.
- Mark print success/failure per collection.
- Upload unsynced records to desktop and mark them synced after confirmation.

## Phase 2: Desktop Office Operations

- Replace scaffold forms with full office workflows.
- Add remaining desktop-only office user registration workflows.
- Add complete monthly override screens.
- Add financial entry screens for advances, fertilizer, tea packets, and arrears.
- Add richer staging review filters and bulk posting.
- Add export/print options for green leaf books.
- Add SQLite backup and restore workflow.

## Phase 3: Cloud And Web

- Add backend migrations.
- Upgrade backend password hashing and session expiry for production authentication.
- Implement desktop-to-cloud sync with retry/error history.
- Expand director web app with month filters and print/export support.
- Add role-based access controls and audit logs.

## Production Hardening

- Replace any remaining prototype authentication pieces with production-grade password and session policies.
- Add database backups.
- Add schema migrations.
- Add app versioning and sync protocol versioning.
- Add device registration for tablets.
- Add receipt numbering policy.
- Add automated desktop and backend integration tests.
