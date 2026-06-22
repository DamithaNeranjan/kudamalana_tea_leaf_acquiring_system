# Development Guide

## Requirements

- Node.js 24 or newer for the desktop SQLite sync service.
- npm.
- Android Studio and a JDK for the Android app.
- DB Browser for SQLite or another SQLite viewer for desktop local data inspection.
- MySQL Workbench for hosted backend database inspection.

On this Windows machine, use `npm.cmd` instead of `npm` because PowerShell blocks the `npm.ps1` shim.

## Install

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd install
```

## Run Tests

```powershell
npm.cmd test
```

## Run Desktop App

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
npm.cmd start
```

The Electron window starts the local sync server on:

```text
http://127.0.0.1:7070
```

Health check:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:7070/health
```

Default desktop office login:

```text
username: office
password: office123
```

The desktop app starts at the login screen. After login, the sidebar opens separate sections for Tea Lines, Line Users, Suppliers, Staging Review, Collection Records, Green Leaf Book, Pair Tablet, and Profile.
The Pair Tablet section is available to the logged-in office user and shows a QR code for tablet sync pairing.

The visible logo and Electron window icon use:

```text
apps/logo/KudamalanaLogo1.png
```

## Run Desktop Sync Server Only

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
node src/server.mjs
```

## Run Android Tablet App

Open this folder in Android Studio:

```text
C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\mobile-android
```

Use a compatible Android Studio/Gradle setup and JDK 17. The tablet app expects the desktop app or desktop sync server to be running on the same Wi-Fi or hotspot network.

Daily tablet setup:

1. Log in to the desktop app as the office user.
2. Open Pair Tablet and show the QR code.
3. On the tablet, tap Pair / Change Server on the login screen and scan the QR code.
4. Log in with an active line-user account created in the desktop app. The first successful online login stores that account locally so the tablet can later log in offline.
5. Download master data from Sync Data before collection.
6. Upload completed records from Sync Data when the tablet is back on the local office network. The desktop receives them in Staging Review; posted records appear in Collection Records.

For Android 12 and newer, allow Nearby Devices/Bluetooth permission when checking printer status or printing. The tablet prints by opening a Bluetooth socket to a paired ESC/POS receipt printer; Android may show a printer as paired even when it is only connected during the actual print attempt.

## Run Backend API

Configure MySQL values in `.env` first. The backend reads `.env`, creates the configured database and missing tables when the MySQL user has permission, seeds the development super admin, and stores web/director data in MySQL.

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd run backend
```

Backend health check:

```text
http://127.0.0.1:8080/health
```

Development super admin:

```text
username: superadmin
password: admin123
```

Change this before production use.
