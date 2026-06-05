# Testing

## Current Automated Tests

Run all available tests:

```powershell
npm.cmd test
```

The current suite covers:

- monthly green leaf book calculations
- supplier-month price and transport overrides
- advance payment suggestion
- backend login, director creation, desktop sync, and green leaf book viewing
- desktop tablet import, duplicate suppression, staging edit/post, and monthly book impact

## Manual Checks

Desktop sync server:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
node src/server.mjs
```

Then open:

```text
http://127.0.0.1:7070/health
```

Desktop app:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
npm.cmd start
```

Backend:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd run backend
```

Then open:

```text
http://127.0.0.1:8080/health
```

