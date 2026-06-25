# Roadmap

## Phase 1: Mobile Field Collection

- Complete Android login against synced line users. (Implemented for online setup plus cached offline login.)
- Implement Room repositories and JSON parsing for master-data sync. (Implemented for current tablet workflow.)
- Connect collection form to local SQLite storage. (Implemented.)
- Implement Bluetooth printer pairing and ESC/POS receipt printing. (Implemented for paired Bluetooth printers.)
- Mark print success/failure per collection. (Implemented with print status and tablet print timestamps.)
- Upload unsynced records to desktop and mark them synced after confirmation. (Implemented with visible success/failure feedback.)

## Phase 2: Desktop Office Operations

- Replace scaffold forms with full office workflows.
- Add remaining desktop-only office user registration workflows.
- Add complete monthly override screens.
- Add financial entry screens for advances, fertilizer, tea packets, and arrears. (Advances, fertilizer, and made tea packets implemented.)
- Add richer staging review filters and bulk posting. (Bulk Post all implemented; filters remain future work.)
- Expand Collection Records audit filters/export options.
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
