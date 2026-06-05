# Tea Collector Android App

Native Android tablet app skeleton for offline tea leaf collection.

## Features represented in this source

- Landscape-first tablet UI.
- Local SQLite data model through Room entities.
- Local login for synced line users.
- Offline collection record creation.
- Bluetooth receipt printer abstraction for the GOOJPRT PT-210 first release.
- Local Wi-Fi sync API client for:
  - `GET /sync/master-data`
  - `POST /sync/collections`
  - `GET /sync/status/:deviceId`

## Build note

Android/Java tooling is not installed in this workspace, so this project is not compiled here. Open this folder in Android Studio with a JDK installed to build and run.

