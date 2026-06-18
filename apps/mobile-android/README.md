# Tea Collector Android App

Native Android tablet app for offline tea leaf collection.

## Features represented in this source

- Landscape-first tablet UI aligned with the desktop app theme and Kudamalana logo.
- QR pairing flow that saves the desktop sync server URL locally on the tablet.
- Local login for synced line users through the desktop sync server.
- Side navigation for Tea Collection, Recorded Data, Sync Data, and Master Data.
- Tea-line dropdown and supplier-name dropdown. Suppliers are filtered by the selected active tea line.
- Local SQLite data model through Room entities for synced master data and unsynced collection records.
- Offline collection record creation, receipt preview, edit-before-upload flow, and upload to desktop staging review.
- Bluetooth status workflow for the GOOJPRT PT-210 first release. The app checks permissions and paired printer presence, opens Bluetooth settings, and marks records as printed or printer-not-connected.
- Local Wi-Fi sync API client for:
  - `POST /sync/login`
  - `GET /sync/master-data`
  - `POST /sync/collections`
  - `GET /sync/status/:deviceId`

## Pairing and daily use

1. Open the desktop app and log in as the office user.
2. Open Pair Tablet in the desktop sidebar.
3. On the tablet login screen, tap Pair / Change Server and scan the QR code.
4. Log in on the tablet using an active line-user account created in the desktop app.
5. Open Sync Data and download master data.
6. Open Tea Collection, select a tea line, then select a supplier name filtered to that line.
7. Enter bags and gross weight, then save and preview the receipt.
8. Review or edit unsynced records in Recorded Data.
9. Upload unsynced records from Sync Data when the tablet is on the same Wi-Fi or hotspot as the desktop.

## Printer note

The current printer flow detects Bluetooth permission and paired-device status for GOOJPRT/PT-210-like device names. Android may show the printer as paired even when it is not actively connected to the app; many receipt printers connect only when the app opens a Bluetooth socket and sends print bytes. Full ESC/POS Bluetooth printing to the PT-210 still needs the concrete `ReceiptPrinter` implementation.

## Build note

Android/Java tooling is not installed in this workspace, so this project is not compiled here. Open this folder in Android Studio with a JDK installed to build and run.
