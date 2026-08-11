import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopSyncServer } from "../src/server.mjs";
import { LocalStore } from "../src/localStore.mjs";
import { createBackendServer } from "../../backend/src/server.mjs";
import { createMemoryStore } from "../../backend/src/store.mjs";

function webHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

async function withDesktopServer(fn, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tea-desktop-"));
  const store = new LocalStore(join(dir, "tea-local-db.sqlite"));
  const envToUse = { DESKTOP_DATA_DIR: dir, ...env };
  const previousEnv = {};
  for (const [key, value] of Object.entries(envToUse)) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }
  const server = await createDesktopSyncServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of Object.keys(envToUse)) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function withBackendServer(fn) {
  const server = createBackendServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("desktop imports tablet records idempotently and posts reviewed entries", async () => {
  await withDesktopServer(async (baseUrl) => {
    const blocked = await fetch(`${baseUrl}/office/state`);
    assert.equal(blocked.status, 401);
    const blockedAudit = await fetch(`${baseUrl}/office/audit-log`);
    assert.equal(blockedAudit.status, 401);

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

    const tabletLineUserLogin = await fetch(`${baseUrl}/sync/login`, {
      method: "POST",
      body: JSON.stringify({ username: "lineuser", password: "lineuser123" })
    });
    assert.equal(tabletLineUserLogin.status, 200);
    assert.equal((await tabletLineUserLogin.json()).user.displayName, "Default Line User");

    const seededMasterData = await (await fetch(`${baseUrl}/sync/master-data`)).json();
    assert.equal(seededMasterData.suppliers.length, 496);
    assert.ok(seededMasterData.teaLines.some((line) => line.name === "Aruna Pathma"));
    assert.equal(seededMasterData.suppliers.find((supplier) => supplier.code === "116").name, "K P Wasantha");
    assert.equal(seededMasterData.suppliers.find((supplier) => supplier.code === "29").lineName, "Factory");

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
      body: JSON.stringify({ id: "line_1", name: "Line A", wholeLineBankTransfer: true, active: true })
    });

    await fetch(`${baseUrl}/office/suppliers`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: "sup_1", code: "S001", name: "Nimal", lineId: "line_1", lineName: "Line A", active: true })
    });

    await fetch(`${baseUrl}/office/tea-lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: "line_1", name: "Line A Updated", wholeLineBankTransfer: true, active: true })
    });
    const renamedLineState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    assert.equal(renamedLineState.teaLines.find((line) => line.id === "line_1").wholeLineBankTransfer, true);
    assert.equal(renamedLineState.suppliers.find((supplier) => supplier.id === "sup_1").lineName, "Line A Updated");
    assert.equal(renamedLineState.suppliers.find((supplier) => supplier.id === "sup_1").paymentMode, "cash");

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

    await fetch(`${baseUrl}/office/suppliers`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        id: "sup_debt",
        code: "S002",
        name: "Debt Supplier",
        lineId: "line_1",
        lineName: "Line A Updated",
        paymentMode: "bank_transfer",
        active: true
      })
    });

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
    const unpaidDebtAdvance = await fetch(`${baseUrl}/office/advances`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ supplierId: "sup_debt", effectiveMonth: "2026-05", date: "2026-05-15", amount: 100 })
    });
    assert.equal(unpaidDebtAdvance.status, 201);

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

    const payment = await fetch(`${baseUrl}/office/supplier-payments`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ month: "2026-05", scope: "supplier", supplierId: "sup_1", paidAt: "2026-05-31" })
    });
    assert.equal(payment.status, 201);
    assert.equal((await payment.json()).recordedCount, 1);
    const paidBook = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-05`, { headers: auth })).json();
    assert.equal(paidBook.rows[0].payment.amount, 1800);

    const closeBook = await fetch(`${baseUrl}/office/green-leaf-book/close`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ month: "2026-05", note: "Completed May payments" })
    });
    assert.equal(closeBook.status, 201);
    const closedBook = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-05`, { headers: auth })).json();
    assert.equal(closedBook.closed, true);
    const blockedClosedAdvance = await fetch(`${baseUrl}/office/advances`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ supplierId: "sup_1", effectiveMonth: "2026-05", date: "2026-05-18", amount: 100 })
    });
    assert.equal(blockedClosedAdvance.status, 409);
    const reopenBook = await fetch(`${baseUrl}/office/green-leaf-book/reopen`, {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ month: "2026-05", note: "Correction needed" })
    });
    assert.equal(reopenBook.status, 200);
    assert.equal((await reopenBook.json()).closed, false);

    const extraAdvance = await fetch(`${baseUrl}/office/advances`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ supplierId: "sup_1", effectiveMonth: "2026-05", date: "2026-05-20", amount: 3000 })
    });
    assert.equal(extraAdvance.status, 201);
    const debtPayment = await fetch(`${baseUrl}/office/supplier-payments`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ month: "2026-05", scope: "supplier", supplierId: "sup_1", paidAt: "2026-05-31" })
    });
    assert.equal(debtPayment.status, 201);
    const summary = await (await fetch(`${baseUrl}/office/month-end-summary?month=2026-05`, { headers: auth })).json();
    assert.equal(summary.supplierBills[0].balanceToPay, -1200);
    assert.equal(summary.supplierBills.find((bill) => bill.supplierId === "sup_debt").paymentMode, "bank_transfer");
    assert.equal(summary.lineSummaries[0].balanceToPay, -1300);
    const printAudit = await fetch(`${baseUrl}/office/supplier-bill-print-audit`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        month: "2026-05",
        suppliers: summary.supplierBills.map((bill) => ({
          id: bill.supplierId,
          code: bill.supplierCode,
          name: bill.supplierName
        }))
      })
    });
    assert.equal(printAudit.status, 201);
    const juneBook = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-06`, { headers: auth })).json();
    assert.equal(juneBook.rows[0].arrearsCarriedForward, 1200);
    const automaticDebtRow = juneBook.rows.find((row) => row.supplierId === "sup_debt");
    assert.equal(automaticDebtRow.arrearsCarriedForward, 100);

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

    const fertilizerType = await fetch(`${baseUrl}/office/fertilizer-types`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "Urea", type: "Granular", bagWeightKg: 50 })
    });
    assert.equal(fertilizerType.status, 201);
    const fertilizerTypeBody = await fertilizerType.json();
    const fertilizerStock = await fetch(`${baseUrl}/office/fertilizer-stocks`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        date: "2026-07-01",
        fertilizerTypeId: fertilizerTypeBody.id,
        perBagPrice: 12000,
        bagsReceived: 10
      })
    });
    assert.equal(fertilizerStock.status, 201);
    const fertilizerStockBody = await fertilizerStock.json();
    const stockIssue = await fetch(`${baseUrl}/office/fertilizer-issues`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        supplierId: "sup_1",
        date: "2026-07-02",
        fertilizerStockId: fertilizerStockBody.id,
        bagsIssued: 2,
        splitMonths: 1,
        effectiveMonth1: "2026-07"
      })
    });
    assert.equal(stockIssue.status, 201);
    const overIssue = await fetch(`${baseUrl}/office/fertilizer-issues`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        supplierId: "sup_1",
        date: "2026-07-03",
        fertilizerStockId: fertilizerStockBody.id,
        bagsIssued: 9,
        splitMonths: 1,
        effectiveMonth1: "2026-07"
      })
    });
    assert.equal(overIssue.status, 400);
    const fertilizerState = await (await fetch(`${baseUrl}/office/state`, { headers: auth })).json();
    const savedStockIssue = fertilizerState.fertilizerIssues.find((issue) => issue.fertilizerStockId === fertilizerStockBody.id);
    assert.equal(savedStockIssue.bagsIssued, 2);
    assert.equal(savedStockIssue.kgGiven, 100);
    assert.equal(savedStockIssue.totalAmount, 24000);

    const auditReport = await (await fetch(`${baseUrl}/office/audit-log`, { headers: auth })).json();
    assert.ok(auditReport.auditLogs.length >= 8);
    assert.ok(
      auditReport.auditLogs.some(
        (entry) => entry.action === "create" && entry.entityType === "supplier" && entry.entityLabel.includes("Nimal")
      )
    );
    assert.ok(
      auditReport.auditLogs.some(
        (entry) => entry.action === "post" && entry.entityType === "collection_entry" && entry.entityLabel === "Nimal"
      )
    );
    assert.ok(
      auditReport.auditLogs.some((entry) => entry.action === "record_payment" && entry.entityType === "supplier_payment")
    );
    assert.ok(
      auditReport.auditLogs.some(
        (entry) => entry.action === "print" && entry.entityType === "supplier_bill" && entry.summary.includes("Nimal")
      )
    );
    const officeUserAudit = auditReport.auditLogs.find((entry) => entry.entityType === "office_user");
    assert.ok(officeUserAudit);
    assert.equal(JSON.stringify(officeUserAudit).includes("counter123"), false);
    assert.equal(JSON.stringify(officeUserAudit).includes("passwordHash"), false);

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

test("desktop can import web-created office users for local login", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tea-desktop-users-"));
  const store = new LocalStore(join(dir, "tea-local-db.sqlite"));
  try {
    await store.load();
    const result = store.importSyncedOfficeUsers([
      {
        id: "web_office_1",
        role: "office_user",
        username: "web-office",
        displayName: "Web Office",
        passwordHash: webHash("web-secret"),
        active: true,
        updatedAt: "2026-05-03T08:00:00.000Z"
      }
    ]);
    assert.equal(result.importedCount, 1);
    assert.ok(store.officeUsersForSync().some((user) => user.username === "web-office" && user.passwordHash.includes(":")));
    const login = store.login("web-office", "web-secret");
    assert.equal(login.displayName, "Web Office");
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("desktop admin can save cloud sync config for deployed app use", async () => {
  await withDesktopServer(async (baseUrl) => {
    const officeLogin = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office", password: "office123" })
    });
    assert.equal(officeLogin.status, 200);
    const { token: officeToken } = await officeLogin.json();
    const officeAuth = { authorization: `Bearer ${officeToken}` };

    const officeStatus = await (await fetch(`${baseUrl}/office/cloud-sync/status`, { headers: officeAuth })).json();
    assert.equal(officeStatus.config.canManage, false);
    assert.equal(officeStatus.config.backendUrl, "");

    const officeUpdate = await fetch(`${baseUrl}/office/cloud-sync/config`, {
      method: "PUT",
      headers: officeAuth,
      body: JSON.stringify({ backendUrl: "https://api.example.com" })
    });
    assert.equal(officeUpdate.status, 403);

    const adminLogin = await fetch(`${baseUrl}/office/login`, {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });
    assert.equal(adminLogin.status, 200);
    const { token: adminToken } = await adminLogin.json();
    const adminAuth = { authorization: `Bearer ${adminToken}` };

    const saveConfig = await fetch(`${baseUrl}/office/cloud-sync/config`, {
      method: "PUT",
      headers: adminAuth,
      body: JSON.stringify({
        backendUrl: "https://api.example.com/",
        backendToken: "desktop-secret-token"
      })
    });
    assert.equal(saveConfig.status, 200);
    const savedConfig = await saveConfig.json();
    assert.equal(savedConfig.backendUrl, "https://api.example.com");
    assert.equal(savedConfig.backendUrlConfigured, true);
    assert.equal(savedConfig.tokenConfigured, true);
    assert.equal(savedConfig.canManage, true);

    const adminStatus = await (await fetch(`${baseUrl}/office/cloud-sync/status`, { headers: adminAuth })).json();
    assert.equal(adminStatus.config.backendUrl, "https://api.example.com");
    assert.equal(adminStatus.config.tokenConfigured, true);

    const envContent = await readFile(join(process.env.DESKTOP_DATA_DIR, ".env"), "utf8");
    assert.match(envContent, /BACKEND_URL=https:\/\/api\.example\.com/);
    assert.match(envContent, /CLOUD_SYNC_TOKEN=desktop-secret-token/);
  });
});

test("desktop cloud sync records status and sends only changed data after first sync", async () => {
  const previousToken = process.env.CLOUD_SYNC_TOKEN;
  process.env.CLOUD_SYNC_TOKEN = "test-cloud-sync-token";
  try {
    await withBackendServer(async (backendUrl) => {
      await withDesktopServer(async (desktopUrl) => {
      const adminLogin = await fetch(`${desktopUrl}/office/login`, {
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "admin123" })
      });
      assert.equal(adminLogin.status, 200);
      const { token } = await adminLogin.json();
      const auth = { authorization: `Bearer ${token}` };

      const officeUserResponse = await fetch(`${desktopUrl}/office/office-users`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ username: "daily-sync-user", password: "daily123", displayName: "Daily Sync User" })
      });
      assert.equal(officeUserResponse.status, 201);

      const syncLineResponse = await fetch(`${desktopUrl}/office/tea-lines`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: "Sync Line" })
      });
      assert.equal(syncLineResponse.status, 201);
      const lineState = await (await fetch(`${desktopUrl}/office/state`, { headers: auth })).json();
      const syncLine = lineState.teaLines.find((line) => line.name === "Sync Line");
      assert.ok(syncLine);
      const syncSupplierResponse = await fetch(`${desktopUrl}/office/suppliers`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ code: "SYNC001", name: "Sync Supplier", lineName: syncLine.name, paymentMode: "cash" })
      });
      assert.equal(syncSupplierResponse.status, 201);
      const syncSupplierState = await (await fetch(`${desktopUrl}/office/state`, { headers: auth })).json();
      const syncSupplier = syncSupplierState.suppliers.find((supplier) => supplier.code === "SYNC001");
      assert.ok(syncSupplier);
      const syncCollection = await fetch(`${desktopUrl}/sync/collections`, {
        method: "POST",
        body: JSON.stringify({
          deviceId: "tablet-sync-test",
          records: [
            {
              id: "sync_mobile_1",
              supplierId: syncSupplier.id,
              supplierCode: syncSupplier.code,
              supplierName: syncSupplier.name,
              lineId: syncSupplier.lineId,
              lineName: syncSupplier.lineName,
              collectionDate: "2026-05-01",
              collectionTime: "08:15",
              bagCount: 1,
              grossWeightKg: 10,
              netWeightKg: 10,
              lineUserName: "Sync Collector",
              printStatus: "printed"
            }
          ]
        })
      });
      assert.equal(syncCollection.status, 200);
      const syncCollectionResult = await syncCollection.json();
      const syncStageId = syncCollectionResult.imported[0];
      await fetch(`${desktopUrl}/office/staging/${syncStageId}/post`, { method: "POST", headers: auth });
      const individualPriceOverride = await fetch(`${desktopUrl}/office/supplier-month-overrides`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          supplierId: syncSupplier.id,
          month: "2026-05",
          teaPricePerKg: 350
        })
      });
      assert.equal(individualPriceOverride.status, 201);

      const firstSync = await fetch(`${desktopUrl}/office/cloud-sync`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ fullSync: true, syncOfficeUsers: true })
      });
      assert.equal(firstSync.status, 200);
      const firstResult = await firstSync.json();
      assert.equal(firstResult.sentCounts.officeUsers >= 2, true);
      assert.equal(firstResult.sentCounts.supplierMonthOverrides, 1);
      assert.equal(firstResult.syncRun.status, "success");

      const webLogin = await fetch(`${backendUrl}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: "daily-sync-user", password: "daily123" })
      });
      assert.equal(webLogin.status, 200);
      const webLoginResult = await webLogin.json();
      const webBook = await (
        await fetch(`${backendUrl}/green-leaf-book?month=2026-05`, {
          headers: { authorization: `Bearer ${webLoginResult.token}` }
        })
      ).json();
      const webSyncSupplierRow = webBook.rows.find((row) => row.supplierCode === "SYNC001");
      assert.equal(webSyncSupplierRow.pricePerKg, 350);
      assert.equal(webSyncSupplierRow.balanceToPay, 3500);

      const secondSync = await fetch(`${desktopUrl}/office/cloud-sync`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({})
      });
      assert.equal(secondSync.status, 200);
      const secondResult = await secondSync.json();
      assert.equal(secondResult.syncRun.mode, "incremental");
      assert.equal(secondResult.sentCounts.officeUsers, 0);
      assert.equal(secondResult.sentCounts.collectionEntries, 0);
      assert.equal(secondResult.sentCounts.teaLines > 0, true);
      assert.equal(secondResult.sentCounts.suppliers > 0, true);

      const status = await (await fetch(`${desktopUrl}/office/cloud-sync/status`, { headers: auth })).json();
      assert.equal(status.lastSuccessfulSync.status, "success");
      assert.equal(status.recentRuns.length, 2);
      }, { BACKEND_URL: backendUrl, CLOUD_SYNC_TOKEN: "test-cloud-sync-token" });
    });
  } finally {
    if (previousToken === undefined) delete process.env.CLOUD_SYNC_TOKEN;
    else process.env.CLOUD_SYNC_TOKEN = previousToken;
  }
});
