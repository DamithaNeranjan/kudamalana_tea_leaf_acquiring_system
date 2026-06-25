import test from "node:test";
import assert from "node:assert/strict";
import { createBackendServer } from "../src/server.mjs";
import { createMemoryStore } from "../src/store.mjs";

async function withServer(fn) {
  const server = createBackendServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("super admin can create directors and director can view green leaf book", async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "superadmin", password: "admin123" })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();

    const defaultAdminLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });
    assert.equal(defaultAdminLoginResponse.status, 200);
    assert.equal((await defaultAdminLoginResponse.json()).user.role, "super_admin");

    const directorResponse = await fetch(`${baseUrl}/admin/directors`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ username: "director1", password: "secret", displayName: "Director One" })
    });
    assert.equal(directorResponse.status, 201);
    const createdDirector = await directorResponse.json();

    const directorsResponse = await fetch(`${baseUrl}/admin/directors`, {
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(directorsResponse.status, 200);
    const directors = await directorsResponse.json();
    assert.equal(directors.directors.length, 1);
    assert.equal(directors.directors[0].username, "director1");

    const officeUserResponse = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        role: "office_user",
        username: "office-web",
        password: "office-secret",
        displayName: "Office Web"
      })
    });
    assert.equal(officeUserResponse.status, 201);
    const officeUser = await officeUserResponse.json();

    const updateOfficeUserResponse = await fetch(`${baseUrl}/admin/users/${officeUser.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ displayName: "Office Web Updated", active: false })
    });
    assert.equal(updateOfficeUserResponse.status, 200);
    const updatedOfficeUser = await updateOfficeUserResponse.json();
    assert.equal(updatedOfficeUser.displayName, "Office Web Updated");
    assert.equal(updatedOfficeUser.active, false);

    const inactiveLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office-web", password: "office-secret" })
    });
    assert.equal(inactiveLoginResponse.status, 403);

    const officeUsersResponse = await fetch(`${baseUrl}/admin/users?role=office_user`, {
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(officeUsersResponse.status, 200);
    const officeUsers = await officeUsersResponse.json();
    assert.ok(officeUsers.users.some((user) => user.username === "office-web"));
    assert.ok(officeUsers.users.every((user) => user.role === "office_user"));

    const activeOfficeUserResponse = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        role: "office_user",
        username: "office-viewer",
        password: "office-viewer-secret",
        displayName: "Office Viewer"
      })
    });
    assert.equal(activeOfficeUserResponse.status, 201);

    const syncResponse = await fetch(`${baseUrl}/sync/desktop`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        suppliers: [{ id: "sup_1", code: "S001", name: "Nimal", lineName: "Line A" }],
        collectionEntries: [{ id: "entry_1", supplierId: "sup_1", collectionDate: "2026-05-01", netWeightKg: 12 }],
        monthlySettings: [{ month: "2026-05", teaPricePerKg: 200 }]
      })
    });
    assert.equal(syncResponse.status, 200);

    const directorLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "director1", password: "secret" })
    });
    assert.equal(directorLoginResponse.status, 200);
    const directorLogin = await directorLoginResponse.json();

    const directorDirectoryResponse = await fetch(`${baseUrl}/admin/users?role=director`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(directorDirectoryResponse.status, 200);
    const directorDirectory = await directorDirectoryResponse.json();
    assert.equal(directorDirectory.users[0].username, "director1");

    const directorOfficeUsersResponse = await fetch(`${baseUrl}/admin/users?role=office_user`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(directorOfficeUsersResponse.status, 200);
    const directorOfficeUsers = await directorOfficeUsersResponse.json();
    assert.ok(directorOfficeUsers.users.some((user) => user.username === "office-web"));
    assert.ok(directorOfficeUsers.users.some((user) => user.username === "office-viewer"));

    const officeViewerLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office-viewer", password: "office-viewer-secret" })
    });
    assert.equal(officeViewerLoginResponse.status, 200);
    const officeViewerLogin = await officeViewerLoginResponse.json();

    const officeViewerUsersResponse = await fetch(`${baseUrl}/admin/users?role=office_user`, {
      headers: { authorization: `Bearer ${officeViewerLogin.token}` }
    });
    assert.equal(officeViewerUsersResponse.status, 200);
    const officeViewerUsers = await officeViewerUsersResponse.json();
    assert.ok(officeViewerUsers.users.some((user) => user.username === "office-viewer"));

    const officeViewerDirectorsResponse = await fetch(`${baseUrl}/admin/users?role=director`, {
      headers: { authorization: `Bearer ${officeViewerLogin.token}` }
    });
    assert.equal(officeViewerDirectorsResponse.status, 403);

    const officeViewerCreateUserResponse = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${officeViewerLogin.token}` },
      body: JSON.stringify({
        role: "office_user",
        username: "office-from-office",
        password: "secret",
        displayName: "Office From Office"
      })
    });
    assert.equal(officeViewerCreateUserResponse.status, 403);

    const directorCreateUserResponse = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({
        role: "office_user",
        username: "office-from-director",
        password: "secret",
        displayName: "Office From Director"
      })
    });
    assert.equal(directorCreateUserResponse.status, 403);

    const directorUpdateUserResponse = await fetch(`${baseUrl}/admin/users/${createdDirector.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({ displayName: "Changed By Director" })
    });
    assert.equal(directorUpdateUserResponse.status, 403);

    const bookResponse = await fetch(`${baseUrl}/green-leaf-book?month=2026-05`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(bookResponse.status, 200);
    const book = await bookResponse.json();
    assert.equal(book.rows[0].supplierCode, "S001");
    assert.equal(book.rows[0].balanceToPay, 2400);
  });
});

test("web login can restore and revoke an http-only cookie session", async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ username: "superadmin", password: "admin123" })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie");
    assert.match(cookie, /tea_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie }
    });
    assert.equal(meResponse.status, 200);
    const session = await meResponse.json();
    assert.equal(session.user.username, "superadmin");

    const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);

    const expiredResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie }
    });
    assert.equal(expiredResponse.status, 401);
  });
});
