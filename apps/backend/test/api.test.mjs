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

    const directorResponse = await fetch(`${baseUrl}/admin/directors`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ username: "director1", password: "secret", displayName: "Director One" })
    });
    assert.equal(directorResponse.status, 201);

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
    const directorLogin = await directorLoginResponse.json();

    const bookResponse = await fetch(`${baseUrl}/green-leaf-book?month=2026-05`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(bookResponse.status, 200);
    const book = await bookResponse.json();
    assert.equal(book.rows[0].supplierCode, "S001");
    assert.equal(book.rows[0].balanceToPay, 2400);
  });
});
