# Deployment Checklist

This system has four deployable/runtime parts, but three user-facing apps:

- Hosted backend API: Node.js service with MySQL.
- Web app: React/Vite static build pointed at the hosted backend API.
- Desktop app: Electron app running at the factory with local SQLite and local tablet sync.
- Android tablet app: APK installed on field tablets, paired to the desktop sync server.

## Backend API

Set production environment values before starting the backend:

```text
NODE_ENV=production
PORT=8080
MYSQL_HOST=<mysql-host>
MYSQL_PORT=3306
MYSQL_DATABASE=<database-name>
MYSQL_USER=<database-user>
MYSQL_PASSWORD=<strong-password>
ALLOWED_ORIGINS=https://<web-app-domain>
COOKIE_SECURE=true
CLOUD_SYNC_TOKEN=<same-long-random-secret-used-by-desktop>
```

Make sure the MySQL user can create the configured database and tables on first startup, or create them from `apps/backend/src/mysql-schema.sql` before starting the service.

For CloudLinux / cPanel NodeJS Selector, use:

```text
Application root: /home/<user>/TeaLeaf_Acquiring_Web_Backend
Application startup file: app.cjs
```

`app.cjs` is a CommonJS wrapper for hosts that load the startup file with `require()`. It starts the ESM backend server in `apps/backend/src/server.mjs`.

## Web App

Build the web app with the production API URL:

```powershell
$env:VITE_API_URL="https://<backend-api-domain>"
npm.cmd run web:build
```

If the web app and backend are served from the same origin, `VITE_API_URL` can be omitted and the client will use the current origin in production-style URLs. Local development still falls back to the current host on port `8080`.

## Desktop App

Build the Windows desktop installer from the repository root:

```powershell
npm.cmd install
npm.cmd run desktop:dist
```

The default installer is written to `release/Tea Leaf Acquiring System-Setup-<version>-x64.exe`. It is a per-user Windows 64-bit installer with Start Menu and desktop shortcuts, so it does not require Node.js to be installed on the target computer.

For a separate 32-bit Windows installer, run:

```powershell
npm.cmd run desktop:dist:ia32
```

The 32-bit installer is written to `release/Tea Leaf Acquiring System-Setup-<version>-ia32.exe`. Keep the 64-bit installer as the default for modern Windows computers.

Optional cloud-sync configuration can be provided with environment variables before launching the app:

```text
DESKTOP_SYNC_PORT=7070
BACKEND_URL=https://<backend-api-domain>
CLOUD_SYNC_TOKEN=<same-long-random-secret-used-by-backend>
```

For installed desktops, the app also reads `.env` from the per-user desktop data folder, or from the file path in `DESKTOP_CONFIG_PATH`.

The desktop app is the local source of truth for tablet collection workflows. Do not expose the desktop sync server publicly; keep it on the factory local network or hotspot.

## Android Tablet App

The tablet still supports QR pairing from the desktop app. To package an APK with a production default sync address, build with either a Gradle property or environment variable:

```powershell
cd apps/mobile-android
.\gradlew.bat assembleRelease -PofficeSyncUrl=http://<desktop-lan-ip>:7070
```

or:

```powershell
$env:OFFICE_SYNC_URL="http://<desktop-lan-ip>:7070"
.\gradlew.bat assembleRelease
```

## Before Go-Live

- Replace the seeded default passwords immediately after first login: `admin`, `director`, `office`, `lineuser`, and compatibility `superadmin` / tablet `admin`.
- Use HTTPS for the hosted backend and web app, then set `COOKIE_SECURE=true`.
- Set `ALLOWED_ORIGINS` to the exact web app origin, not `*`.
- Use a long random `CLOUD_SYNC_TOKEN` and keep the same value on backend and desktop.
- Confirm backend `/health` responds from the hosting environment.
- Confirm web login, logout, and page refresh session restore work against the hosted backend.
- Confirm desktop Sync to Web App succeeds and the web Green Leaf Book shows the synced month.
- Confirm each tablet can pair with the desktop QR code, log in as a line user, download 14 tea lines and 496 suppliers, save offline records, print receipts, and upload records to desktop staging.
- Back up the desktop SQLite database folder and hosted MySQL database before production use.
- Confirm server clocks/timezones are sane; date-only collection fields must remain calendar dates, while timestamp fields render in local time.
