# Tea Factory Web App

Static director/super-admin web UI for the hosted Node.js backend.

Serve this folder with any static file server. The web app uses the local backend API by default:

```text
http://localhost:8080
```

Features:

- Login as director, office user, or super admin.
- Logout revokes the current backend session and clears the browser session.
- View month-wise green leaf book.
- Super admin can create director accounts.

Security notes:

- The web app keeps the bearer token only in JavaScript memory.
- Refreshing or closing the page clears the browser-held token.
- The backend stores sessions in MySQL and validates the bearer token on protected routes.
