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

## Run Desktop Sync Server Only

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
node src/server.mjs
```

## Run Backend API

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

