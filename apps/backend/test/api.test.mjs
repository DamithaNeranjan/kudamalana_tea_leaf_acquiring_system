import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { createBackendServer } from "../src/server.mjs";
import { createMemoryStore } from "../src/store.mjs";

function desktopHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

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

    const defaultDirectorLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "director", password: "director123" })
    });
    assert.equal(defaultDirectorLoginResponse.status, 200);
    assert.equal((await defaultDirectorLoginResponse.json()).user.role, "director");

    const defaultOfficeLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "office", password: "office123" })
    });
    assert.equal(defaultOfficeLoginResponse.status, 200);
    assert.equal((await defaultOfficeLoginResponse.json()).user.role, "office_user");

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
    assert.ok(directors.directors.some((director) => director.username === "director"));
    assert.ok(directors.directors.some((director) => director.username === "director1"));

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
        officeUsers: [
          {
            id: "office_desktop_1",
            role: "office_user",
            username: "desktop-office",
            displayName: "Desktop Office",
            passwordHash: desktopHash("desktop-secret"),
            active: true,
            updatedAt: "2026-05-02T10:00:00.000Z"
          }
        ],
        teaLines: [
          { id: "line_a", name: "Line A", wholeLineBankTransfer: true },
          { id: "line_b", name: "Line B" },
          { id: "line_c", name: "Line C" }
        ],
        suppliers: [
          { id: "sup_2", code: "S002", name: "Factory", lineName: "Line B", excludeFromBalance: true },
          { id: "sup_1", code: "S001", name: "Nimal", lineId: "line_a", lineName: "Line A" },
          { id: "sup_3", code: "S003", name: "Bank Supplier", lineId: "line_c", lineName: "Line C", paymentMode: "bank_transfer" },
          { id: "sup_4", code: "S004", name: "Cash Supplier", lineId: "line_b", lineName: "Line B", paymentMode: "cash" }
        ],
        collectionEntries: [
          { id: "entry_0", supplierId: "sup_4", collectionDate: "2026-04-01", netWeightKg: 1 },
          { id: "entry_1", supplierId: "sup_1", collectionDate: "2026-05-01", netWeightKg: 12 },
          { id: "entry_2", supplierId: "sup_2", collectionDate: "2026-05-01", netWeightKg: 5 },
          { id: "entry_3", supplierId: "sup_3", collectionDate: "2026-05-01", netWeightKg: 4 },
          { id: "entry_4", supplierId: "sup_4", collectionDate: "2026-05-01", netWeightKg: 3 }
        ],
        supplierMonthOverrides: [
          { id: "override_sup_3_2026_05", supplierId: "sup_3", month: "2026-05", teaPricePerKg: 300 }
        ],
        advances: [
          { id: "advance_sup_4_2026_04", supplierId: "sup_4", date: "2026-04-15", effectiveMonth: "2026-04", amount: 400 }
        ],
        supplierPayments: [
          {
            id: "payment_1",
            supplierId: "sup_1",
            month: "2026-05",
            lineName: "Line A",
            scope: "supplier",
            amount: 2400,
            balanceAmount: 2400,
            paidAt: "2026-05-31T10:00:00.000Z",
            paidByOfficeUserName: "Office Viewer"
          }
        ],
        monthlySettings: [
          { month: "2026-04", teaPricePerKg: 200 },
          { month: "2026-05", teaPricePerKg: 200 }
        ]
      })
    });
    assert.equal(syncResponse.status, 200);
    const syncResult = await syncResponse.json();
    assert.ok(syncResult.officeUsers.some((user) => user.username === "desktop-office"));
    assert.ok(syncResult.officeUsers.some((user) => user.username === "office-viewer"));

    const desktopOfficeLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "desktop-office", password: "desktop-secret" })
    });
    assert.equal(desktopOfficeLoginResponse.status, 200);

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
    assert.ok(directorDirectory.users.some((user) => user.username === "director"));
    assert.ok(directorDirectory.users.some((user) => user.username === "director1"));

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
    assert.equal(book.rows[0].payment.id, "payment_1");
    assert.equal(book.rows[1].supplierCode, "S002");
    assert.equal(book.rows[1].balanceExcluded, true);
    assert.equal(book.rows[1].balanceToPay, 0);
    const bankSupplierBookRow = book.rows.find((row) => row.supplierId === "sup_3");
    assert.equal(bankSupplierBookRow.pricePerKg, 300);
    assert.equal(bankSupplierBookRow.balanceToPay, 1200);
    const cashSupplierBookRow = book.rows.find((row) => row.supplierId === "sup_4");
    assert.equal(cashSupplierBookRow.arrearsCarriedForward, 200);
    assert.equal(cashSupplierBookRow.balanceToPay, 400);

    const balancesResponse = await fetch(`${baseUrl}/balances?month=2026-05`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(balancesResponse.status, 200);
    const balances = await balancesResponse.json();
    assert.equal(balances.lineWiseBankTransfers[0].lineName, "Line A");
    assert.equal(balances.lineWiseBankTransfers[0].positiveBalance, 2400);
    assert.equal(balances.supplierWiseBankTransfers[0].supplierCode, "S003");
    assert.equal(balances.supplierWiseBankTransfers[0].positiveBalance, 1200);
    assert.equal(balances.factoryOfficerTransfers.suppliers[0].supplierCode, "S004");
    assert.equal(balances.factoryOfficerTransfers.positiveBalance, 400);

    const officeMarkPaidResponse = await fetch(`${baseUrl}/balances/mark-paid`, {
      method: "POST",
      headers: { authorization: `Bearer ${officeViewerLogin.token}` },
      body: JSON.stringify({ month: "2026-05", section: "line", targetId: "line_a", amount: 2400 })
    });
    assert.equal(officeMarkPaidResponse.status, 403);

    const markLinePaidResponse = await fetch(`${baseUrl}/balances/mark-paid`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({
        month: "2026-05",
        section: "line",
        targetId: "line_a",
        targetLabel: "Line A",
        amount: 2400,
        paymentDoneDate: "2026-05-31",
        comment: "Transferred as a whole line"
      })
    });
    assert.equal(markLinePaidResponse.status, 201);
    const factoryOfficerPaymentResponse = await fetch(`${baseUrl}/balances/factory-officer-payments`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({ month: "2026-05", amount: 250, paymentDoneDate: "2026-05-30", comment: "First cash batch" })
    });
    assert.equal(factoryOfficerPaymentResponse.status, 201);

    const signalledBalancesResponse = await fetch(`${baseUrl}/balances?month=2026-05`, {
      headers: { authorization: `Bearer ${officeViewerLogin.token}` }
    });
    assert.equal(signalledBalancesResponse.status, 200);
    const signalledBalances = await signalledBalancesResponse.json();
    assert.equal(signalledBalances.lineWiseBankTransfers[0].signal.comment, "Transferred as a whole line");
    assert.equal(signalledBalances.lineWiseBankTransfers[0].signal.paymentDoneDate, "2026-05-31");
    assert.equal(signalledBalances.factoryOfficerTransfers.payments[0].paymentDoneDate, "2026-05-30");
    assert.equal(signalledBalances.factoryOfficerTransfers.payments[0].remainingPositiveBalance, 150);

    const directorReadBalanceResponse = await fetch(`${baseUrl}/signals/mark-read`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({ type: "balance", id: signalledBalances.lineWiseBankTransfers[0].signal.id })
    });
    assert.equal(directorReadBalanceResponse.status, 403);

    const officeReadBalanceResponse = await fetch(`${baseUrl}/signals/mark-read`, {
      method: "POST",
      headers: { authorization: `Bearer ${officeViewerLogin.token}` },
      body: JSON.stringify({ type: "balance", id: signalledBalances.lineWiseBankTransfers[0].signal.id })
    });
    assert.equal(officeReadBalanceResponse.status, 200);
    assert.ok((await officeReadBalanceResponse.json()).readAt);

    const otherDirectorLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "director", password: "director123" })
    });
    assert.equal(otherDirectorLoginResponse.status, 200);
    const otherDirectorLogin = await otherDirectorLoginResponse.json();

    const otherDirectorUpdateBalanceResponse = await fetch(`${baseUrl}/balances/mark-paid`, {
      method: "POST",
      headers: { authorization: `Bearer ${otherDirectorLogin.token}` },
      body: JSON.stringify({
        month: "2026-05",
        section: "line",
        targetId: "line_a",
        targetLabel: "Line A",
        amount: 2400,
        paymentDoneDate: "2026-06-01",
        comment: "Changed by another director"
      })
    });
    assert.equal(otherDirectorUpdateBalanceResponse.status, 403);

    const originalDirectorUpdateBalanceResponse = await fetch(`${baseUrl}/balances/mark-paid`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({
        month: "2026-05",
        section: "line",
        targetId: "line_a",
        targetLabel: "Line A",
        amount: 2400,
        paymentDoneDate: "2026-06-01",
        comment: "Updated by original director"
      })
    });
    assert.equal(originalDirectorUpdateBalanceResponse.status, 201);
    const updatedBalanceSignal = await originalDirectorUpdateBalanceResponse.json();
    assert.equal(updatedBalanceSignal.comment, "Updated by original director");
    assert.equal(updatedBalanceSignal.paymentDoneDate, "2026-06-01");
    assert.equal(updatedBalanceSignal.markedByUserId, directorLogin.user.id);
    assert.equal(updatedBalanceSignal.readAt, null);

    const otherDirectorDeleteBalanceResponse = await fetch(`${baseUrl}/balances/signals/${updatedBalanceSignal.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${otherDirectorLogin.token}` }
    });
    assert.equal(otherDirectorDeleteBalanceResponse.status, 403);

    const adminDeleteBalanceResponse = await fetch(`${baseUrl}/balances/signals/${updatedBalanceSignal.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(adminDeleteBalanceResponse.status, 200);

    const otherDirectorUpdateFactoryResponse = await fetch(`${baseUrl}/balances/factory-officer-payments/${signalledBalances.factoryOfficerTransfers.payments[0].id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${otherDirectorLogin.token}` },
      body: JSON.stringify({ amount: 300, paymentDoneDate: "2026-06-02", comment: "Changed by another director" })
    });
    assert.equal(otherDirectorUpdateFactoryResponse.status, 403);

    const originalDirectorUpdateFactoryResponse = await fetch(`${baseUrl}/balances/factory-officer-payments/${signalledBalances.factoryOfficerTransfers.payments[0].id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({ amount: 275, paymentDoneDate: "2026-06-02", comment: "Updated cash batch" })
    });
    assert.equal(originalDirectorUpdateFactoryResponse.status, 200);
    const updatedFactorySignal = await originalDirectorUpdateFactoryResponse.json();
    assert.equal(updatedFactorySignal.amount, 275);
    assert.equal(updatedFactorySignal.paymentDoneDate, "2026-06-02");
    assert.equal(updatedFactorySignal.markedByUserId, directorLogin.user.id);

    const advanceSignalsListResponse = await fetch(`${baseUrl}/advance-signals`, {
      headers: { authorization: `Bearer ${officeViewerLogin.token}` }
    });
    assert.equal(advanceSignalsListResponse.status, 200);
    const advanceSignalsList = await advanceSignalsListResponse.json();
    assert.ok(advanceSignalsList.suppliers.some((supplier) => supplier.id === "sup_3"));
    assert.ok(advanceSignalsList.teaLines.some((line) => line.id === "line_b"));

    const supplierAdvanceSuggestionResponse = await fetch(
      `${baseUrl}/advance-signals/suggestion?scope=supplier&targetId=sup_3&month=2026-05`,
      { headers: { authorization: `Bearer ${directorLogin.token}` } }
    );
    assert.equal(supplierAdvanceSuggestionResponse.status, 200);
    const supplierAdvanceSuggestion = await supplierAdvanceSuggestionResponse.json();
    assert.equal(supplierAdvanceSuggestion.suggestedAmount, 1200);
    assert.equal(supplierAdvanceSuggestion.breakdown[0].leafValue, 1200);

    const lineAdvanceSuggestionResponse = await fetch(
      `${baseUrl}/advance-signals/suggestion?scope=line&targetId=line_b&month=2026-05`,
      { headers: { authorization: `Bearer ${directorLogin.token}` } }
    );
    assert.equal(lineAdvanceSuggestionResponse.status, 200);
    const lineAdvanceSuggestion = await lineAdvanceSuggestionResponse.json();
    const cashSupplierBreakdown = lineAdvanceSuggestion.breakdown.find((item) => item.supplierId === "sup_4");
    assert.equal(cashSupplierBreakdown.leafValue, 600);
    assert.equal(cashSupplierBreakdown.arrearsCarriedForward, 200);
    assert.equal(cashSupplierBreakdown.suggestedAmount, 400);

    const officeAdvanceSignalResponse = await fetch(`${baseUrl}/advance-signals`, {
      method: "POST",
      headers: { authorization: `Bearer ${officeViewerLogin.token}` },
      body: JSON.stringify({
        scope: "supplier",
        targetId: "sup_3",
        effectiveMonth: "2026-05",
        dateGiven: "2026-05-20",
        amount: 100
      })
    });
    assert.equal(officeAdvanceSignalResponse.status, 403);

    const directorAdvanceSignalResponse = await fetch(`${baseUrl}/advance-signals`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({
        scope: "line",
        targetId: "line_b",
        effectiveMonth: "2026-05",
        dateGiven: "2026-05-20",
        amount: 300,
        comment: "Director requested advance"
      })
    });
    assert.equal(directorAdvanceSignalResponse.status, 201);
    const directorAdvanceSignal = await directorAdvanceSignalResponse.json();
    assert.equal(directorAdvanceSignal.scope, "line");
    assert.equal(directorAdvanceSignal.amount, 300);
    assert.equal(directorAdvanceSignal.suggestedAmount, lineAdvanceSuggestion.suggestedAmount);

    const otherDirectorUpdateAdvanceResponse = await fetch(`${baseUrl}/advance-signals/${directorAdvanceSignal.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${otherDirectorLogin.token}` },
      body: JSON.stringify({
        effectiveMonth: "2026-05",
        dateGiven: "2026-05-21",
        amount: 350,
        comment: "Changed by another director"
      })
    });
    assert.equal(otherDirectorUpdateAdvanceResponse.status, 403);

    const originalDirectorUpdateAdvanceResponse = await fetch(`${baseUrl}/advance-signals/${directorAdvanceSignal.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({
        effectiveMonth: "2026-05",
        dateGiven: "2026-05-21",
        amount: 350,
        comment: "Updated director requested advance"
      })
    });
    assert.equal(originalDirectorUpdateAdvanceResponse.status, 200);
    const updatedAdvanceSignal = await originalDirectorUpdateAdvanceResponse.json();
    assert.equal(updatedAdvanceSignal.amount, 350);
    assert.equal(updatedAdvanceSignal.dateGiven, "2026-05-21");
    assert.equal(updatedAdvanceSignal.markedByUserId, directorLogin.user.id);

    const directorReadAdvanceResponse = await fetch(`${baseUrl}/signals/mark-read`, {
      method: "POST",
      headers: { authorization: `Bearer ${directorLogin.token}` },
      body: JSON.stringify({ type: "advance", id: updatedAdvanceSignal.id })
    });
    assert.equal(directorReadAdvanceResponse.status, 403);

    const officeReadAdvanceResponse = await fetch(`${baseUrl}/signals/mark-read`, {
      method: "POST",
      headers: { authorization: `Bearer ${officeViewerLogin.token}` },
      body: JSON.stringify({ type: "advance", id: updatedAdvanceSignal.id })
    });
    assert.equal(officeReadAdvanceResponse.status, 200);
    const readAdvance = await officeReadAdvanceResponse.json();
    assert.ok(readAdvance.readAt);
    assert.equal(readAdvance.readByDisplayName, "Office Viewer");

    const afterAdvanceSignalBook = await (
      await fetch(`${baseUrl}/green-leaf-book?month=2026-05`, {
        headers: { authorization: `Bearer ${directorLogin.token}` }
      })
    ).json();
    assert.equal(afterAdvanceSignalBook.rows.find((row) => row.supplierId === "sup_4").totalAdvances, 0);

    const advanceSignalsAfterCreate = await (
      await fetch(`${baseUrl}/advance-signals`, {
        headers: { authorization: `Bearer ${officeViewerLogin.token}` }
      })
    ).json();
    assert.equal(advanceSignalsAfterCreate.signals[0].comment, "Updated director requested advance");
    assert.ok(advanceSignalsAfterCreate.signals[0].readAt);

    const adminDeleteAdvanceResponse = await fetch(`${baseUrl}/advance-signals/${updatedAdvanceSignal.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(adminDeleteAdvanceResponse.status, 200);

    const adminDeleteFactoryResponse = await fetch(`${baseUrl}/balances/factory-officer-payments/${updatedFactorySignal.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(adminDeleteFactoryResponse.status, 200);

    const directorAuditResponse = await fetch(`${baseUrl}/web-audit-log`, {
      headers: { authorization: `Bearer ${directorLogin.token}` }
    });
    assert.equal(directorAuditResponse.status, 403);

    const officeAuditResponse = await fetch(`${baseUrl}/web-audit-log`, {
      headers: { authorization: `Bearer ${officeViewerLogin.token}` }
    });
    assert.equal(officeAuditResponse.status, 403);

    const adminAuditResponse = await fetch(`${baseUrl}/web-audit-log`, {
      headers: { authorization: `Bearer ${login.token}` }
    });
    assert.equal(adminAuditResponse.status, 200);
    const auditPayload = await adminAuditResponse.json();
    assert.ok(auditPayload.auditLogs.some((log) => log.entityType === "advance_signal" && log.action === "update"));
    assert.ok(auditPayload.auditLogs.some((log) => log.entityType === "factory_transfer_signal" && log.action === "delete"));
    assert.ok(auditPayload.auditLogs.some((log) => log.action === "mark_read"));
    assert.ok(!JSON.stringify(auditPayload).includes("passwordHash"));
    assert.ok(!JSON.stringify(auditPayload).includes(directorLogin.token));
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

test("backend CORS can be restricted to configured web origins", async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = "https://tea.example.com";
  try {
    await withServer(async (baseUrl) => {
      const allowedResponse = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://tea.example.com" }
      });
      assert.equal(allowedResponse.headers.get("access-control-allow-origin"), "https://tea.example.com");

      const blockedResponse = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://other.example.com" }
      });
      assert.equal(blockedResponse.headers.get("access-control-allow-origin"), null);
    });
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
  }
});
