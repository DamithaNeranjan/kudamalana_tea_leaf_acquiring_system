# Tea Collector Android App

Native Android tablet app for offline tea leaf collection.

## Features represented in this source

- Landscape-first tablet UI aligned with the desktop app theme and Kudamalana logo.
- QR pairing flow that saves the desktop sync server URL locally on the tablet.
- Offline-capable login for synced line users. The first successful online login caches the line-user account locally, then later tablet login can work without Wi-Fi.
- Side navigation for Tea Collection, Recorded Data, Sync Data, and Master Data.
- Tea-line dropdown and supplier-name dropdown. Suppliers are filtered by the selected active tea line.
- Local SQLite data model through Room entities for synced master data and unsynced collection records.
- Offline collection record creation, receipt preview, edit-before-upload flow, tablet saved/printed timestamp capture, print-only reprints from Recorded Data, and upload to desktop staging review.
- Bluetooth receipt workflow for ESC/POS receipt printers such as GOOJPRT/PT-210. The app checks permissions, tries paired Bluetooth devices with likely printer names first, then tries other paired devices, opens Bluetooth settings, and marks records as printed only after bytes are sent successfully.
- Local Wi-Fi sync API client for:
  - `POST /sync/login`
  - `GET /sync/master-data`
  - `POST /sync/collections`
  - `GET /sync/status/:deviceId`

## Pairing and daily use

1. Open the desktop app and log in as the office user.
2. Open Pair Tablet in the desktop sidebar.
3. On the tablet login screen, tap Pair / Change Server and scan the QR code.
4. Log in on the tablet using an active line-user account created in the desktop app. This first online login saves the account locally for later offline use.
5. Open Sync Data and download master data.
6. Open Tea Collection, select a tea line, then select a supplier name filtered to that line.
7. Enter bags and gross weight, then save and preview the receipt. The printed receipt shows Kudamalana Tea Factory, Green Leaf Collection, a shortened receipt ID, saved time, and printed time.
8. Review, edit, or print-only reprint unsynced records in Recorded Data.
9. Upload unsynced records from Sync Data when the tablet is on the same Wi-Fi or hotspot as the desktop. The app shows completion or failure messages for both master-data download and record upload.

## Printer note

The current printer flow checks Bluetooth permission, orders paired devices with likely printer names first, then tries paired Bluetooth devices until one accepts the ESC/POS receipt bytes. Android may show a printer as paired even when it is not actively connected to the app; many receipt printers connect only while the app opens a Bluetooth socket and sends print data. Recorded Data includes a print-only path for reprinting saved receipts without saving the collection again.

## Build note

Android/Java tooling is not installed in this workspace, so this project is not compiled here. Open this folder in Android Studio with a JDK installed to build and run.
