import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopSyncServer } from "../src/server.mjs";
import { LocalStore } from "../src/localStore.mjs";

async function withDesktopServer(fn) {
  const dir = await mkdtemp(join(tmpdir(), "tea-desktop-"));
  const store = new LocalStore(join(dir, "tea-local-db.sqlite"));
  const server = await createDesktopSyncServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

test("desktop imports tablet records idempotently and posts reviewed entries", async () => {
  await withDesktopServer(async (baseUrl) => {
    const blocked = await fetch(`${baseUrl}/office/state`);
    assert.equal(blocked.status, 401);

    const login = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office", password: "office123" })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const auth = { authorization: `Bearer ${token}` };

    const profileUpdate = await fetch(`${baseUrl}/office/profile`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ displayName: "Factory Office", password: "office456" })
    });
    assert.equal(profileUpdate.status, 200);
    assert.equal((await profileUpdate.json()).displayName, "Factory Office");

    await fetch(`${baseUrl}/office/tea-lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: "line_1", name: "Line A", active: true })
    });

    await fetch(`${baseUrl}/office/suppliers`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: "sup_1", code: "S001", name: "Nimal", lineId: "line_1", lineName: "Line A", active: true })
    });

    await fetch(`${baseUrl}/office/tea-lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: "line_1", name: "Line A Updated", active: true })
    });
    const renamedLineState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    assert.equal(renamedLineState.suppliers.find((supplier) => supplier.id === "sup_1").lineName, "Line A Updated");

    const upload = await fetch(`${baseUrl}/sync/collections`, {
      method: "POST",
      body: JSON.stringify({
        deviceId: "tablet-1",
        records: [
          {
            id: "mobile_1",
            supplierId: "sup_1",
            supplierCode: "S001",
            supplierName: "Nimal",
            lineName: "Line A",
            collectionDate: "2026-05-01",
            collectionTime: "08:30",
            bagCount: 2,
            grossWeightKg: 12.5,
            lineUserName: "Sunil",
            printStatus: "printed"
          }
        ]
      })
    });
    const uploadResult = await upload.json();
    assert.match(uploadResult.imported[0], /^stage_/);
    assert.deepEqual(uploadResult.skipped, []);

    const duplicate = await fetch(`${baseUrl}/sync/collections`, {
      method: "POST",
      body: JSON.stringify({ deviceId: "tablet-1", records: [{ id: "mobile_1" }] })
    });
    assert.equal((await duplicate.json()).skipped[0], "mobile_1");

    const state = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    const stageId = state.collectionStaging[0].id;
    await fetch(`${baseUrl}/office/staging/${stageId}`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ netWeightKg: 12 })
    });
    await fetch(`${baseUrl}/office/staging/${stageId}/post`, { method: "POST", headers: auth });

    const lineOverride = await fetch(`${baseUrl}/office/line-supplier-price-overrides`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ lineId: "line_1", lineName: "Line A", month: "2026-05", teaPricePerKg: 250 })
    });
    assert.equal(lineOverride.status, 201);
    assert.equal((await lineOverride.json()).updatedCount, 1);

    const suggestion = await (
      await fetch(`${baseUrl}/office/advance-suggestion?month=2026-05&supplierId=sup_1`, { headers: auth })
    ).json();
    assert.equal(suggestion.suggestedAmount, 3000);

    const advance = await fetch(`${baseUrl}/office/advances`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ supplierId: "sup_1", effectiveMonth: "2026-05", date: "2026-05-12", amount: 500 })
    });
    assert.equal(advance.status, 201);

    const book = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-05`, { headers: auth })).json();
    assert.equal(book.rows[0].totalKg, 12);
    assert.equal(book.rows[0].pricePerKg, 250);
    assert.deepEqual(book.rows[0].advancePayments, [{ date: "2026-05-12", amount: 500 }]);
    assert.equal(book.rows[0].balanceToPay, 2500);
    const postedState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    assert.equal(postedState.collectionEntries[0].postedByOfficeUserName, "Factory Office");

    const logout = await fetch(`${baseUrl}/office/logout`, { method: "POST", headers: auth });
    assert.equal(logout.status, 200);
    const blockedAfterLogout = await fetch(`${baseUrl}/office/state`, { headers: auth });
    assert.equal(blockedAfterLogout.status, 401);

    const relogin = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office", password: "office456" })
    });
    assert.equal(relogin.status, 200);
  });
});
