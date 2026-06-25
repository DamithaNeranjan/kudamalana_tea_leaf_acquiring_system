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

    const adminLogin = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });
    assert.equal(adminLogin.status, 200);
    const { token: adminToken, user: adminUser } = await adminLogin.json();
    assert.equal(adminUser.role, "admin");
    const adminAuth = { authorization: `Bearer ${adminToken}` };

    const createdOfficeUser = await fetch(`${baseUrl}/office/office-users`, {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ username: "counter", password: "counter123", displayName: "Counter User" })
    });
    assert.equal(createdOfficeUser.status, 201);
    const counterUser = await createdOfficeUser.json();

    const tabletAdminLogin = await fetch(`${baseUrl}/sync/login`, {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });
    assert.equal(tabletAdminLogin.status, 200);

    const login = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office", password: "office123" })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const auth = { authorization: `Bearer ${token}` };

    const officeState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    assert.ok(officeState.officeUsers.some((user) => user.username === "counter"));
    const deniedOfficeUserCreate = await fetch(`${baseUrl}/office/office-users`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ username: "blocked", password: "blocked123", displayName: "Blocked User" })
    });
    assert.equal(deniedOfficeUserCreate.status, 403);
    const deniedOfficeUserUpdate = await fetch(`${baseUrl}/office/office-users`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ ...counterUser, active: false })
    });
    assert.equal(deniedOfficeUserUpdate.status, 403);

    const profileUpdate = await fetch(`${baseUrl}/office/profile`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ username: "office-updated", displayName: "Factory Office", password: "office456" })
    });
    assert.equal(profileUpdate.status, 200);
    const updatedProfile = await profileUpdate.json();
    assert.equal(updatedProfile.username, "office-updated");
    assert.equal(updatedProfile.displayName, "Factory Office");

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

    const fertilizer = await fetch(`${baseUrl}/office/fertilizer-issues`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        supplierId: "sup_1",
        date: "2026-05-13",
        kgGiven: 20,
        totalAmount: 1000,
        splitMonths: 2,
        effectiveMonth1: "2026-05",
        effectiveMonth2: "2026-06"
      })
    });
    assert.equal(fertilizer.status, 201);

    const teaPackets = await fetch(`${baseUrl}/office/tea-packets`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        supplierId: "sup_1",
        date: "2026-05-14",
        packetCount: 2,
        perPacketPrice: 100,
        totalAmount: 200,
        effectiveMonth: "2026-05"
      })
    });
    assert.equal(teaPackets.status, 201);

    const book = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-05`, { headers: auth })).json();
    assert.equal(book.rows[0].totalKg, 12);
    assert.equal(book.rows[0].pricePerKg, 250);
    assert.deepEqual(book.rows[0].advancePayments, [{ date: "2026-05-12", amount: 500 }]);
    assert.equal(book.rows[0].fertilizerDeduction, 500);
    assert.equal(book.rows[0].teaPacketDeduction, 200);
    assert.equal(book.rows[0].balanceToPay, 1800);
    const postedState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    assert.equal(postedState.collectionEntries[0].postedByOfficeUserName, "Factory Office");
    assert.equal(postedState.fertilizerIssues[0].kgGiven, 20);
    assert.deepEqual(
      postedState.fertilizerInstallments.map((item) => [item.effectiveMonth, item.amount]).sort(),
      [
        ["2026-05", 500],
        ["2026-06", 500]
      ]
    );
    assert.equal(postedState.teaPackets[0].totalAmount, 200);

    const logout = await fetch(`${baseUrl}/office/logout`, { method: "POST", headers: auth });
    assert.equal(logout.status, 200);
    const blockedAfterLogout = await fetch(`${baseUrl}/office/state`, { headers: auth });
    assert.equal(blockedAfterLogout.status, 401);

    const relogin = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office-updated", password: "office456" })
    });
    assert.equal(relogin.status, 200);
  });
});
