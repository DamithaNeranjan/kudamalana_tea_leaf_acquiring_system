import { createApi } from "./modules/api.js";
import { formatAuditAction, formatAuditDetails, formatAuditEntity, summarizeCounts, summarizeReceived } from "./modules/auditCloud.js";
import { formatAdvanceAmounts, formatAdvanceDates, greenLeafBookTotals, poyaDaysForMonth } from "./modules/book.js";
import { escapeAttribute, escapeHtml } from "./modules/html.js";
import { compareNewestFirst, pagedItems } from "./modules/listing.js";
import { collectionRecordPage, collectionRecordRows, postAllStagingMessage, stagingRows } from "./modules/records.js";
import {
  formatBillCurrency,
  formatBookNumber,
  formatDateTime,
  localDateValue,
  localMonthValue,
  sumNumbers
} from "./modules/format.js";
import {
  currentSupplierPriceOverride,
  lineOverrideFromForm,
  renderLineUserEditForm,
  renderOfficeUserEditForm,
  renderSupplierEditForm,
  renderTeaLineEditForm,
  supplierOverrideFromForm
} from "./modules/registration.js";

let officeToken = "";
let officeUser = null;
let latestState = null;
let latestBook = null;
let latestMonthEndSummary = null;
let latestAuditLogs = [];
let activeBillSummaryScope = "all";
let activeBillSummarySupplier = "";
let activeBillSummaryLine = "";
let advanceSupplierChoices = [];
let fertilizerSupplierChoices = [];
let fertilizerStockTypeChoices = [];
let fertilizerIssueStockChoices = [];
let teaPacketSupplierChoices = [];
let teaPacketTypeChoices = [];
let paymentSupplierChoices = [];
let pendingSupplierBillPrintAudit = null;
let pendingBookAction = null;
const filters = {
  officeUserName: "",
  teaLineName: "",
  lineUserName: "",
  supplierName: "",
  supplierLine: "",
  fertilizerType: "",
  fertilizerReceived: "",
  fertilizerIssue: "",
  fertilizerStockBalance: "",
  teaPacketType: "",
  recordSupplier: "",
  recordLine: "",
  recordDateFrom: "",
  recordDateTo: "",
  recordPostedBy: "",
  recordCollector: "",
  paymentSupplier: "",
  paymentLine: "",
  paymentMonth: "",
  paymentScope: "",
  stagingSupplier: "",
  stagingLine: "",
  stagingDate: "",
  cloudSyncStatus: "",
  cloudSyncMode: "",
  auditUser: "",
  auditAction: "",
  auditEntity: "",
  auditDateFrom: "",
  auditDateTo: ""
};
let recordsPage = 1;
const recordsPageSize = 10;
const listPageSize = 10;
const listPages = {
  officeUsers: 1,
  teaLines: 1,
  lineUsers: 1,
  suppliers: 1,
  monthlySettings: 1,
  advances: 1,
  fertilizerTypes: 1,
  fertilizerStocks: 1,
  fertilizer: 1,
  fertilizerStockBalances: 1,
  teaPacketTypes: 1,
  teaPackets: 1,
  staging: 1,
  payments: 1,
  cloudSync: 1,
  audit: 1
};
const api = createApi({
  baseUrl: window.teaDesktop?.apiBaseUrl || "http://127.0.0.1:7070",
  getOfficeToken: () => officeToken
});

function setLoggedInSession(login) {
  officeToken = login.token;
  officeUser = login.user;
  document.querySelector("#sessionStatus").textContent = `Logged in: ${officeUser.displayName}`;
  document.querySelector("#profileInitial").textContent = userInitial(officeUser.displayName || officeUser.username);
  document.querySelector("#profileButton").classList.remove("hidden");
  document.querySelector("#logoutButton").classList.remove("hidden");
  document.querySelector('#profileForm input[name="username"]').value = officeUser.username;
  document.querySelector('#profileForm input[name="displayName"]').value = officeUser.displayName;
  document.querySelector("#loginView").classList.add("hidden");
  document.querySelector("#appView").classList.remove("hidden");
  showView("dashboardView");
}

function clearSession() {
  officeToken = "";
  officeUser = null;
  document.querySelector("#sessionStatus").textContent = "Not logged in";
  document.querySelector("#profileButton").classList.add("hidden");
  document.querySelector("#logoutButton").classList.add("hidden");
  document.querySelector("#appView").classList.add("hidden");
  document.querySelector("#loginView").classList.remove("hidden");
  document.querySelector("#bookTable").innerHTML = "";
  document.querySelector("#bookSupplierFilter").value = "";
  document.querySelector("#bookLineFilter").value = "";
  document.querySelector("#paymentSupplierFilter").value = "";
  document.querySelector("#paymentLineFilter").value = "";
  document.querySelector("#paymentMonthFilter").value = "";
  document.querySelector("#paymentScopeFilter").value = "";
  document.querySelector("#auditUserFilter").value = "";
  document.querySelector("#auditActionFilter").value = "";
  document.querySelector("#auditEntityFilter").value = "";
  document.querySelector("#auditDateFromFilter").value = "";
  document.querySelector("#auditDateToFilter").value = "";
  document.querySelector("#cloudSyncRunsTable tbody").innerHTML = "";
  document.querySelector("#cloudSyncLastSuccess").textContent = "No successful sync yet";
  document.querySelector("#cloudSyncCursor").textContent = "";
  document.querySelector("#cloudSyncMessage").textContent = "";
  document.querySelector("#cloudSyncBackendUrl").textContent = "Backend URL not configured";
  document.querySelector("#cloudSyncTokenStatus").textContent = "Cloud sync token not configured";
  document.querySelector("#cloudSyncConfigMessage").textContent = "";
  document.querySelector("#cloudSyncConfigForm").reset();
  document.querySelector("#cloudSyncConfigCard").classList.add("hidden");
  document.querySelector("#cloudSyncConfigSummary").classList.add("hidden");
  document.querySelector("#monthEndSummary").classList.add("hidden");
  document.querySelector("#monthEndSummary").innerHTML = "";
  latestBook = null;
  latestMonthEndSummary = null;
  latestAuditLogs = [];
  document.querySelector("#stagingTable tbody").innerHTML = "";
  document.querySelector("#recordsTable tbody").innerHTML = "";
  document.querySelector("#auditTable tbody").innerHTML = "";
  document.querySelector("#profileForm").reset();
  showView("dashboardView");
  window.scrollTo({ top: 0, left: 0 });
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.querySelector("#toastHost").appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function userInitial(name) {
  return String(name || "U").trim().charAt(0).toUpperCase() || "U";
}

function isDesktopAdmin() {
  return officeUser?.role === "admin";
}

function showView(viewId) {
  for (const view of document.querySelectorAll(".view")) {
    view.classList.toggle("active-view", view.id === viewId);
  }
  for (const item of document.querySelectorAll(".menu-item")) {
    item.classList.toggle("active", item.dataset.view === viewId);
  }
  if (viewId === "pairingView" && officeToken) refreshPairingQr();
  if (viewId === "stagingView" && officeToken) refreshState();
  if (viewId === "recordsView" && officeToken) refreshState();
  if (viewId === "supplierBillsView" && officeToken) {
    loadBillSelectorOptions().catch((error) => showToast(error.message, "error"));
  }
  if (viewId === "paymentRecordsView" && officeToken) {
    refreshState();
    loadPaymentBalances().catch((error) => showToast(error.message, "error"));
  }
  if (viewId === "auditReportsView" && officeToken) {
    loadAuditLogs().catch((error) => showToast(error.message, "error"));
  }
  if (viewId === "cloudSyncView" && officeToken) {
    loadCloudSyncStatus().catch((error) => showToast(error.message, "error"));
  }
}

function formJson(form) {
  const result = formPayload(form);
  if (!result.id) delete result.id;
  if (!result.password) delete result.password;
  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    result[checkbox.name] = checkbox.checked;
  }
  if (!("active" in result)) result.active = true;
  return result;
}

function formPayload(form) {
  trimFormInputs(form);
  return Object.fromEntries(new FormData(form).entries());
}

function trimFormInputs(form) {
  for (const field of form.querySelectorAll("input, textarea")) {
    trimInputValue(field);
  }
}

function trimInputValue(field) {
  if (!field || typeof field.value !== "string") return;
  if (["checkbox", "radio", "file"].includes(field.type)) return;
  field.value = field.value.trim();
}

function isRegisteredTeaLine(lineName) {
  const normalized = String(lineName || "").trim().toLowerCase();
  return latestState?.teaLines.some((line) => line.active && line.name.toLowerCase() === normalized);
}

function paymentModeLabel(mode) {
  return mode === "bank_transfer" ? "Bank transfer" : "Cash";
}

function sinhalaPaymentModeLabel(mode) {
  return mode === "bank_transfer" ? "බැංකු ගිනුමට" : "අතට";
}

function effectiveFertilizerKg(items = []) {
  return sumNumbers(
    items.map((item) => {
      const kgGiven = Number(item.kgGiven || 0);
      const totalAmount = Number(item.totalAmount || 0);
      const effectiveAmount = Number(item.effectiveAmount || 0);
      if (kgGiven <= 0) return 0;
      if (totalAmount > 0 && effectiveAmount > 0) return (kgGiven * effectiveAmount) / totalAmount;
      return kgGiven / Math.max(1, Number(item.splitMonths || 1));
    })
  );
}

function effectiveTeaPacketCount(items = []) {
  return sumNumbers(items.map((item) => item.packetCount));
}

function validateSupplierTeaLine(form) {
  trimFormInputs(form);
  const lineName = form.elements.lineName?.value;
  if (!lineName || !isRegisteredTeaLine(lineName)) {
    showToast("Please select a registered active tea line.", "error");
    form.elements.lineName?.focus();
    return false;
  }
  return true;
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  const message = document.querySelector("#loginMessage");
  message.textContent = "Checking login...";
  try {
    const login = await api("/office/login", { method: "POST", body: JSON.stringify(payload) });
    setLoggedInSession(login);
    form.reset();
    message.textContent = "";
    await refreshState();
  } catch (error) {
    message.textContent = error.message;
  }
});

document.addEventListener(
  "blur",
  (event) => {
    if (event.target.matches?.("input, textarea")) trimInputValue(event.target);
  },
  true
);

document.addEventListener("click", (event) => {
  const passwordInputId = event.target.dataset.togglePassword;
  if (!passwordInputId && event.target.id !== "toggleLoginPassword") return;
  const passwordInput = document.querySelector(`#${passwordInputId || "loginPassword"}`);
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  event.target.textContent = shouldShow ? "Hide" : "Show";
  event.target.setAttribute("aria-pressed", String(shouldShow));
});

document.querySelector(".menu").addEventListener("click", (event) => {
  const viewId = event.target.dataset.view;
  if (viewId) showView(viewId);
});

document.querySelector(".dashboard-sections").addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-view-shortcut]");
  if (shortcut) showView(shortcut.dataset.viewShortcut);
});

document.addEventListener("click", (event) => {
  const clearFormId = event.target.dataset.clearForm;
  if (clearFormId) {
    document.querySelector(`#${clearFormId}`).reset();
    const idInput = document.querySelector(`#${clearFormId} input[name="id"]`);
    if (idInput) idInput.value = "";
    if (clearFormId === "monthlySettingsForm") populateMonthlySettingsForm();
    if (clearFormId === "advanceForm") populateAdvanceForm();
    if (clearFormId === "fertilizerTypeForm") populateFertilizerTypeForm();
    if (clearFormId === "fertilizerStockForm") populateFertilizerStockForm();
    if (clearFormId === "fertilizerForm") populateFertilizerForm();
    if (clearFormId === "teaPacketTypeForm") populateTeaPacketTypeForm();
    if (clearFormId === "teaPacketForm") populateTeaPacketForm();
  }
});

for (const [selector, key, pageKey] of [
  ["#officeUserFilter", "officeUserName", "officeUsers"],
  ["#teaLineFilter", "teaLineName", "teaLines"],
  ["#lineUserFilter", "lineUserName", "lineUsers"],
  ["#supplierNameFilter", "supplierName", "suppliers"],
  ["#supplierLineFilter", "supplierLine", "suppliers"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    listPages[pageKey] = 1;
    if (latestState) renderRegistrationTables(latestState);
  });
}

for (const [selector, key, pageKey] of [
  ["#fertilizerTypeFilter", "fertilizerType", "fertilizerTypes"],
  ["#fertilizerReceivedFilter", "fertilizerReceived", "fertilizerStocks"],
  ["#fertilizerIssueFilter", "fertilizerIssue", "fertilizer"],
  ["#fertilizerStockBalanceFilter", "fertilizerStockBalance", "fertilizerStockBalances"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    listPages[pageKey] = 1;
    if (latestState) renderFertilizer(latestState);
  });
}

document.querySelector("#teaPacketTypeFilter").addEventListener("input", (event) => {
  filters.teaPacketType = event.target.value.trim().toLowerCase();
  listPages.teaPacketTypes = 1;
  if (latestState) renderTeaPackets(latestState);
});

document.addEventListener("click", (event) => {
  const pageKey = event.target.dataset.pageKey;
  const pageDir = event.target.dataset.pageDir;
  if (!pageKey || !pageDir) return;
  listPages[pageKey] = Math.max(1, (listPages[pageKey] || 1) + Number(pageDir));
  if (pageKey === "audit") {
    renderAuditLogs();
    return;
  }
  if (pageKey === "cloudSync") {
    loadCloudSyncStatus().catch((error) => showToast(error.message, "error"));
    return;
  }
  if (!latestState) return;
  renderStateTables(latestState);
});

for (const [selector, key] of [
  ["#recordSupplierFilter", "recordSupplier"],
  ["#recordLineFilter", "recordLine"],
  ["#recordDateFromFilter", "recordDateFrom"],
  ["#recordDateToFilter", "recordDateTo"],
  ["#recordPostedByFilter", "recordPostedBy"],
  ["#recordCollectorFilter", "recordCollector"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    recordsPage = 1;
    if (latestState) renderCollectionRecords(latestState.collectionEntries);
  });
}

for (const [selector, key] of [
  ["#stagingSupplierFilter", "stagingSupplier"],
  ["#stagingLineFilter", "stagingLine"],
  ["#stagingDateFilter", "stagingDate"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    listPages.staging = 1;
    if (latestState) renderStaging(latestState);
  });
}

for (const [selector, key] of [
  ["#cloudSyncStatusFilter", "cloudSyncStatus"],
  ["#cloudSyncModeFilter", "cloudSyncMode"]
]) {
  document.querySelector(selector).addEventListener("change", (event) => {
    filters[key] = event.target.value;
    listPages.cloudSync = 1;
    loadCloudSyncStatus().catch((error) => showToast(error.message, "error"));
  });
}

for (const [selector, key] of [
  ["#paymentSupplierFilter", "paymentSupplier"],
  ["#paymentLineFilter", "paymentLine"],
  ["#paymentMonthFilter", "paymentMonth"],
  ["#paymentScopeFilter", "paymentScope"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    listPages.payments = 1;
    if (latestState) renderPayments(latestState);
  });
}

for (const [selector, key] of [
  ["#auditUserFilter", "auditUser"],
  ["#auditActionFilter", "auditAction"],
  ["#auditEntityFilter", "auditEntity"],
  ["#auditDateFromFilter", "auditDateFrom"],
  ["#auditDateToFilter", "auditDateTo"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    listPages.audit = 1;
    renderAuditLogs();
  });
}

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    if (officeToken) await api("/office/logout", { method: "POST" });
  } finally {
    clearSession();
  }
});

document.querySelector("#profileButton").addEventListener("click", () => {
  showView("profileView");
});

document.querySelector("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  const message = document.querySelector("#profileMessage");
  if (!payload.password) delete payload.password;
  message.textContent = "Saving profile...";
  try {
    const updatedUser = await api("/office/profile", { method: "PUT", body: JSON.stringify(payload) });
    officeUser = updatedUser;
    document.querySelector("#sessionStatus").textContent = `Logged in: ${officeUser.displayName}`;
    document.querySelector("#profileInitial").textContent = userInitial(officeUser.displayName || officeUser.username);
    form.elements.username.value = officeUser.username;
    form.elements.password.value = "";
    message.textContent = "Profile saved.";
  } catch (error) {
    message.textContent = error.message;
  }
});

async function refreshState() {
  if (!officeToken) return;
  const state = await api("/office/state");
  latestState = state;
  renderStateTables(state);
}

function renderStateTables(state) {
  renderOfficeUsers(state);
  renderRegistrationTables(state);
  renderAdvances(state);
  renderFertilizer(state);
  renderTeaPackets(state);
  renderStaging(state);
  renderCollectionRecords(state.collectionEntries);
  renderPayments(state);
}

function renderOfficeUsers(state) {
  const canManage = isDesktopAdmin();
  document.querySelector("#officeUserFormIntro").classList.toggle("hidden", !canManage);
  document.querySelector("#officeUserForm").classList.toggle("hidden", !canManage);
  const officeUsers = paginateList(
    "officeUsers",
    state.officeUsers
      .filter((user) => user.displayName.toLowerCase().includes(filters.officeUserName))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "createdAt")),
    "officeUsersTable"
  );
  document.querySelector("#officeUsersTable tbody").innerHTML = officeUsers
    .map((user) => {
      const actions =
        canManage && user.role !== "admin"
          ? `<button class="table-action" type="button" data-edit-office-user="${user.id}">Edit</button>
             <button class="table-action" type="button" data-toggle-office-user="${user.id}">${user.active ? "Deactivate" : "Activate"}</button>`
          : "-";
      return `
      <tr>
        <td>${escapeHtml(user.displayName)}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.role === "admin" ? "Admin" : "Office user")}</td>
        <td>${user.active ? "Active" : "Inactive"}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join("");
}

function renderStaging(state) {
  const pageRows = paginateList(
    "staging",
    stagingRows(state.collectionStaging, filters),
    "stagingTable"
  );
  document.querySelector("#stagingTable tbody").innerHTML = pageRows
    .map(
      (row) => `
      <tr>
        <td>${row.supplierName}</td>
        <td>${row.collectionDate}</td>
        <td>${row.bagCount}</td>
        <td>${row.grossWeightKg}</td>
        <td><input data-net="${row.id}" value="${row.netWeightKg}" /></td>
        <td>${row.printStatus}</td>
        <td><button data-post="${row.id}">Post</button></td>
      </tr>`
    )
    .join("");
}

function paginateList(pageKey, items, tableId) {
  const page = pagedItems(items, listPages[pageKey], listPageSize);
  listPages[pageKey] = page.page;
  renderListPagination(pageKey, tableId, items.length, page.start, page.rows.length, page.pageCount);
  return page.rows;
}

function renderListPagination(pageKey, tableId, total, start, shownCount, pageCount) {
  const table = document.querySelector(`#${tableId}`);
  let pagination = document.querySelector(`[data-pagination-for="${tableId}"]`);
  if (!pagination) {
    pagination = document.createElement("div");
    pagination.className = "pagination-bar";
    pagination.dataset.paginationFor = tableId;
    pagination.innerHTML = `
      <span></span>
      <div class="pagination-actions">
        <button class="ghost-button" type="button" data-page-key="${pageKey}" data-page-dir="-1">Previous</button>
        <button class="ghost-button" type="button" data-page-key="${pageKey}" data-page-dir="1">Next</button>
      </div>`;
    table.insertAdjacentElement("afterend", pagination);
  }
  const shownEnd = Math.min(start + shownCount, total);
  pagination.querySelector("span").textContent = total ? `Showing ${start + 1}-${shownEnd} of ${total}` : "No records";
  const [previous, next] = pagination.querySelectorAll("button");
  previous.disabled = listPages[pageKey] <= 1;
  next.disabled = listPages[pageKey] >= pageCount;
}

function renderAdvances(state) {
  const form = document.querySelector("#advanceForm");
  const selectedSupplier = form.elements.supplierId.value;
  const selectedSupplierLabel = document.querySelector("#advanceSupplierSearch").value;
  advanceSupplierChoices = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => ({
      id: supplier.id,
      label: `${supplier.name} (${supplier.code})`
    }));
  document.querySelector("#advanceSupplierOptions").innerHTML = advanceSupplierChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (advanceSupplierChoices.some((choice) => choice.id === selectedSupplier)) {
    document.querySelector("#advanceSupplierSearch").value =
      selectedSupplierLabel || advanceSupplierChoices.find((choice) => choice.id === selectedSupplier)?.label || "";
  } else {
    form.elements.supplierId.value = "";
  }

  const pageRows = paginateList(
    "advances",
    state.advances.slice().sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date", "effectiveMonth")),
    "advancesTable"
  );
  document.querySelector("#advancesTable tbody").innerHTML = pageRows
    .slice()
    .map((advance) => {
      const supplier = state.suppliers.find((item) => item.id === advance.supplierId);
      return `
      <tr>
        <td>${escapeHtml(supplier?.name || advance.supplierId)}</td>
        <td>${escapeHtml(advance.effectiveMonth)}</td>
        <td>${escapeHtml(advance.date)}</td>
        <td>${advance.amount}</td>
      </tr>`;
    })
    .join("");
}

function fertilizerTypeLabel(type) {
  if (!type) return "Unknown fertilizer";
  return `${type.name || ""} - ${type.type || ""} - ${formatBookNumber(type.bagWeightKg)} kg`.replace(/\s+-\s+$/g, "");
}

function fertilizerStockRows(state) {
  const typeById = new Map((state.fertilizerTypes || []).map((type) => [type.id, type]));
  const issuedByStock = new Map();
  for (const issue of state.fertilizerIssues || []) {
    if (!issue.fertilizerStockId) continue;
    issuedByStock.set(issue.fertilizerStockId, (issuedByStock.get(issue.fertilizerStockId) || 0) + Number(issue.bagsIssued || 0));
  }
  return (state.fertilizerStocks || []).map((stock) => {
    const type = typeById.get(stock.fertilizerTypeId);
    const bagsReceived = Number(stock.bagsReceived || 0);
    const bagsIssued = issuedByStock.get(stock.id) || 0;
    const balanceBags = Math.max(0, bagsReceived - bagsIssued);
    const bagWeightKg = Number(type?.bagWeightKg || stock.bagWeightKg || 0);
    const perBagPrice = Number(stock.perBagPrice || 0);
    return {
      ...stock,
      type,
      label: fertilizerTypeLabel(type),
      bagsReceived,
      bagsIssued,
      balanceBags,
      balanceKg: balanceBags * bagWeightKg,
      stockValue: balanceBags * perBagPrice
    };
  });
}

function fertilizerIssueSearchText(issue, state) {
  const supplier = state.suppliers.find((item) => item.id === issue.supplierId);
  const stock = (state.fertilizerStocks || []).find((item) => item.id === issue.fertilizerStockId);
  const type = (state.fertilizerTypes || []).find((item) => item.id === (issue.fertilizerTypeId || stock?.fertilizerTypeId));
  return [
    supplier?.name,
    supplier?.code,
    issue.date,
    fertilizerTypeLabel(type),
    issue.bagsIssued,
    issue.kgGiven,
    issue.totalAmount,
    stock?.perBagPrice
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();
}

function renderFertilizer(state) {
  const stockForm = document.querySelector("#fertilizerStockForm");
  const selectedStockType = stockForm.elements.fertilizerTypeId.value;
  const selectedStockTypeLabel = document.querySelector("#fertilizerStockTypeSearch").value;
  fertilizerStockTypeChoices = (state.fertilizerTypes || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((type) => ({
      id: type.id,
      label: fertilizerTypeLabel(type)
    }));
  document.querySelector("#fertilizerStockTypeOptions").innerHTML = fertilizerStockTypeChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (fertilizerStockTypeChoices.some((choice) => choice.id === selectedStockType)) {
    document.querySelector("#fertilizerStockTypeSearch").value =
      selectedStockTypeLabel || fertilizerStockTypeChoices.find((choice) => choice.id === selectedStockType)?.label || "";
  } else {
    stockForm.elements.fertilizerTypeId.value = "";
  }

  const fertilizerForm = document.querySelector("#fertilizerForm");
  const selectedSupplier = fertilizerForm.elements.supplierId.value;
  const selectedSupplierLabel = document.querySelector("#fertilizerSupplierSearch").value;
  fertilizerSupplierChoices = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => ({
      id: supplier.id,
      label: `${supplier.name} (${supplier.code})`
    }));
  document.querySelector("#fertilizerSupplierOptions").innerHTML = fertilizerSupplierChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (fertilizerSupplierChoices.some((choice) => choice.id === selectedSupplier)) {
    document.querySelector("#fertilizerSupplierSearch").value =
      selectedSupplierLabel || fertilizerSupplierChoices.find((choice) => choice.id === selectedSupplier)?.label || "";
  } else {
    fertilizerForm.elements.supplierId.value = "";
  }

  const stockRows = fertilizerStockRows(state);
  const selectedIssueStock = fertilizerForm.elements.fertilizerStockId.value;
  const selectedIssueStockLabel = document.querySelector("#fertilizerIssueStockSearch").value;
  fertilizerIssueStockChoices = stockRows
    .filter((stock) => stock.balanceBags > 0 || stock.id === selectedIssueStock)
    .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date"))
    .map((stock) => {
      const label = `${stock.label} - Rs. ${formatBookNumber(stock.perBagPrice)} - ${formatBookNumber(stock.balanceBags)} bags available`;
      return { id: stock.id, label };
    });
  document.querySelector("#fertilizerIssueStockOptions").innerHTML = fertilizerIssueStockChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (fertilizerIssueStockChoices.some((choice) => choice.id === selectedIssueStock)) {
    document.querySelector("#fertilizerIssueStockSearch").value =
      selectedIssueStockLabel || fertilizerIssueStockChoices.find((choice) => choice.id === selectedIssueStock)?.label || "";
  } else {
    fertilizerForm.elements.fertilizerStockId.value = "";
  }
  updateFertilizerIssueTotals();

  const typeRows = paginateList(
    "fertilizerTypes",
    (state.fertilizerTypes || [])
      .filter((type) => fertilizerTypeLabel(type).toLowerCase().includes(filters.fertilizerType))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "name")),
    "fertilizerTypesTable"
  );
  document.querySelector("#fertilizerTypesTable tbody").innerHTML = typeRows
    .map(
      (type) => `
      <tr>
        <td>${escapeHtml(type.name)}</td>
        <td>${escapeHtml(type.type)}</td>
        <td>${formatBookNumber(type.bagWeightKg)} kg</td>
      </tr>`
    )
    .join("");

  const receivedRows = paginateList(
    "fertilizerStocks",
    stockRows
      .filter((stock) => [stock.date, stock.label, stock.perBagPrice, stock.bagsReceived].join(" ").toLowerCase().includes(filters.fertilizerReceived))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date")),
    "fertilizerStocksTable"
  );
  document.querySelector("#fertilizerStocksTable tbody").innerHTML = receivedRows
    .map(
      (stock) => `
      <tr>
        <td>${escapeHtml(stock.date)}</td>
        <td>${escapeHtml(stock.label)}</td>
        <td>${formatBookNumber(stock.perBagPrice)}</td>
        <td>${formatBookNumber(stock.bagsReceived)}</td>
      </tr>`
    )
    .join("");

  const pageRows = paginateList(
    "fertilizer",
    (state.fertilizerIssues || [])
      .filter((issue) => fertilizerIssueSearchText(issue, state).includes(filters.fertilizerIssue))
      .slice()
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date")),
    "fertilizerTable"
  );
  document.querySelector("#fertilizerTable tbody").innerHTML = pageRows
    .map((issue) => {
      const supplier = state.suppliers.find((item) => item.id === issue.supplierId);
      const stock = (state.fertilizerStocks || []).find((item) => item.id === issue.fertilizerStockId);
      const type = (state.fertilizerTypes || []).find((item) => item.id === (issue.fertilizerTypeId || stock?.fertilizerTypeId));
      const months = [issue.effectiveMonth1, issue.effectiveMonth2].filter(Boolean).join(", ");
      return `
      <tr>
        <td>${escapeHtml(supplier?.name || issue.supplierId)}</td>
        <td>${escapeHtml(issue.date)}</td>
        <td>${escapeHtml(type ? fertilizerTypeLabel(type) : "Legacy fertilizer")}</td>
        <td>${issue.bagsIssued ? formatBookNumber(issue.bagsIssued) : "-"}</td>
        <td>${formatBookNumber(issue.kgGiven)}</td>
        <td>${formatBookNumber(issue.totalAmount)}</td>
        <td>${issue.splitMonths} month${Number(issue.splitMonths) === 1 ? "" : "s"}</td>
        <td>${escapeHtml(months)}</td>
      </tr>`;
    })
    .join("");

  const balanceRows = paginateList(
    "fertilizerStockBalances",
    stockRows
      .filter((stock) => stock.balanceBags > 0)
      .filter((stock) =>
        [stock.label, stock.perBagPrice, stock.bagsReceived, stock.bagsIssued, stock.balanceBags].join(" ").toLowerCase().includes(filters.fertilizerStockBalance)
      )
      .sort((a, b) => String(a.label).localeCompare(String(b.label)) || Number(a.perBagPrice) - Number(b.perBagPrice)),
    "fertilizerStockBalanceTable"
  );
  document.querySelector("#fertilizerStockBalanceTable tbody").innerHTML = balanceRows
    .map(
      (stock) => `
      <tr>
        <td>${escapeHtml(stock.label)}</td>
        <td>${formatBookNumber(stock.perBagPrice)}</td>
        <td>${formatBookNumber(stock.bagsReceived)}</td>
        <td>${formatBookNumber(stock.bagsIssued)}</td>
        <td>${formatBookNumber(stock.balanceBags)}</td>
        <td>${formatBookNumber(stock.balanceKg)}</td>
        <td>${formatBookNumber(stock.stockValue)}</td>
      </tr>`
    )
    .join("");
}

function teaPacketTypeLabel(type) {
  if (!type) return "Unknown packet";
  return `${type.name || ""} - ${type.weight || ""} - Rs. ${formatBookNumber(type.price)}`.replace(/\s+-\s+Rs\.\s+$/g, "");
}

function teaPacketIssueTypeLabel(packet, state) {
  if (packet.packetName) {
    return `${packet.packetName} - ${packet.packetWeight || ""} - Rs. ${formatBookNumber(packet.perPacketPrice)}`.replace(/\s+-\s+Rs\.\s+$/g, "");
  }
  const type = (state.teaPacketTypes || []).find((item) => item.id === packet.teaPacketTypeId);
  return type ? teaPacketTypeLabel(type) : "Legacy packet";
}

function renderTeaPacketTypeEditForm(type) {
  return `
    <form class="modal-form" data-kind="tea-packet-type">
      <input name="id" type="hidden" value="${escapeAttribute(type.id)}" />
      <label>
        Name
        <input name="name" required value="${escapeAttribute(type.name)}" />
      </label>
      <label>
        Weight
        <input name="weight" required value="${escapeAttribute(type.weight)}" />
      </label>
      <label>
        Price
        <input name="price" type="number" step="0.01" min="0" required value="${escapeAttribute(type.price)}" />
      </label>
      <div class="form-actions">
        <button type="submit">Save changes</button>
      </div>
    </form>`;
}

function renderTeaPackets(state) {
  const teaPacketForm = document.querySelector("#teaPacketForm");
  const selectedType = teaPacketForm.elements.teaPacketTypeId.value;
  const selectedTypeLabel = document.querySelector("#teaPacketTypeSearch").value;
  teaPacketTypeChoices = (state.teaPacketTypes || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((type) => ({
      id: type.id,
      label: teaPacketTypeLabel(type)
    }));
  document.querySelector("#teaPacketTypeOptions").innerHTML = teaPacketTypeChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (teaPacketTypeChoices.some((choice) => choice.id === selectedType)) {
    document.querySelector("#teaPacketTypeSearch").value =
      selectedTypeLabel || teaPacketTypeChoices.find((choice) => choice.id === selectedType)?.label || "";
  } else {
    teaPacketForm.elements.teaPacketTypeId.value = "";
  }
  updateTeaPacketTotal();

  const typeRows = paginateList(
    "teaPacketTypes",
    (state.teaPacketTypes || [])
      .filter((type) => teaPacketTypeLabel(type).toLowerCase().includes(filters.teaPacketType))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt", "name")),
    "teaPacketTypesTable"
  );
  document.querySelector("#teaPacketTypesTable tbody").innerHTML = typeRows
    .map(
      (type) => `
      <tr>
        <td>${escapeHtml(type.name)}</td>
        <td>${escapeHtml(type.weight)}</td>
        <td>${formatBookNumber(type.price)}</td>
        <td><button class="table-action" type="button" data-edit-tea-packet-type="${escapeAttribute(type.id)}">Edit</button></td>
      </tr>`
    )
    .join("");

  const selectedSupplier = teaPacketForm.elements.supplierId.value;
  const selectedSupplierLabel = document.querySelector("#teaPacketSupplierSearch").value;
  teaPacketSupplierChoices = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => ({
      id: supplier.id,
      label: `${supplier.name} (${supplier.code})`
    }));
  document.querySelector("#teaPacketSupplierOptions").innerHTML = teaPacketSupplierChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  if (teaPacketSupplierChoices.some((choice) => choice.id === selectedSupplier)) {
    document.querySelector("#teaPacketSupplierSearch").value =
      selectedSupplierLabel || teaPacketSupplierChoices.find((choice) => choice.id === selectedSupplier)?.label || "";
  } else {
    teaPacketForm.elements.supplierId.value = "";
  }

  const pageRows = paginateList(
    "teaPackets",
    (state.teaPackets || []).slice().sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date", "effectiveMonth")),
    "teaPacketsTable"
  );
  document.querySelector("#teaPacketsTable tbody").innerHTML = pageRows
    .map((packet) => {
      const supplier = state.suppliers.find((item) => item.id === packet.supplierId);
      return `
      <tr>
        <td>${escapeHtml(supplier?.name || packet.supplierId)}</td>
        <td>${escapeHtml(packet.date)}</td>
        <td>${escapeHtml(teaPacketIssueTypeLabel(packet, state))}</td>
        <td>${formatBookNumber(packet.packetCount)}</td>
        <td>${formatBookNumber(packet.perPacketPrice)}</td>
        <td>${formatBookNumber(packet.totalAmount)}</td>
        <td>${escapeHtml(packet.effectiveMonth)}</td>
      </tr>`;
    })
    .join("");
}

function updateTeaPacketTotal() {
  const form = document.querySelector("#teaPacketForm");
  if (!form || !latestState) return;
  const type = (latestState.teaPacketTypes || []).find((item) => item.id === form.elements.teaPacketTypeId.value);
  const packetCount = Number(form.elements.packetCount.value);
  const price = Number(type?.price || 0);
  form.elements.totalAmount.value = type && packetCount > 0 ? Math.round((packetCount * price + Number.EPSILON) * 100) / 100 : "";
}

function renderCollectionRecords(records = []) {
  const filtered = collectionRecordRows(records, filters);
  const page = collectionRecordPage(filtered, recordsPage, recordsPageSize);
  recordsPage = page.page;
  document.querySelector("#recordsTable tbody").innerHTML = page.pageRecords
    .map(
      (record) => `
      <tr>
        <td>${escapeHtml(formatDateTime(record.tabletSavedAt || `${record.collectionDate} ${record.collectionTime || ""}`))}</td>
        <td>${escapeHtml(record.supplierName)}</td>
        <td>${escapeHtml(record.lineName || "")}</td>
        <td>${record.bagCount}</td>
        <td>${record.originalGrossWeightKg}</td>
        <td>${record.netWeightKg}</td>
        <td>${escapeHtml(record.printStatus || "-")}</td>
        <td>${escapeHtml(record.tabletPrintedAt ? formatDateTime(record.tabletPrintedAt) : "-")}</td>
        <td>${escapeHtml(record.lineUserName)}</td>
        <td>${escapeHtml(record.postedByOfficeUserName || "-")}</td>
        <td>${escapeHtml(formatDateTime(record.postedAt))}</td>
      </tr>`
    )
    .join("");
  document.querySelector("#recordsPageInfo").textContent = filtered.length
    ? `Showing ${page.start + 1}-${page.shownEnd} of ${filtered.length}`
    : "No records";
  document.querySelector("#recordsPrevPage").disabled = recordsPage <= 1;
  document.querySelector("#recordsNextPage").disabled = recordsPage >= page.pageCount;
}

function renderPayments(state) {
  const supplierById = new Map(state.suppliers.map((supplier) => [supplier.id, supplier]));
  const payments = paginateList(
    "payments",
    (state.supplierPayments || [])
      .filter((payment) => {
        const supplier = supplierById.get(payment.supplierId);
        const supplierName = String(supplier?.name || payment.supplierId || "").toLowerCase();
        const lineName = String(payment.lineName || supplier?.lineName || "").toLowerCase();
        return (
          supplierName.includes(filters.paymentSupplier) &&
          lineName.includes(filters.paymentLine) &&
          (!filters.paymentMonth || payment.month === filters.paymentMonth) &&
          (!filters.paymentScope || payment.scope === filters.paymentScope)
        );
      })
      .sort((a, b) => compareNewestFirst(a, b, "paidAt")),
    "paymentsTable"
  );
  document.querySelector("#paymentsTable tbody").innerHTML = payments
    .map((payment) => {
      const supplier = supplierById.get(payment.supplierId);
      return `
      <tr>
        <td>${escapeHtml(formatDateTime(payment.paidAt))}</td>
        <td>${escapeHtml(supplier?.name || payment.supplierId)}</td>
        <td>${escapeHtml(payment.lineName || supplier?.lineName || "")}</td>
        <td>${escapeHtml(payment.month)}</td>
        <td>${escapeHtml(payment.scope === "line" ? "Line" : "Supplier")}</td>
        <td>${formatBookNumber(payment.amount)}</td>
        <td>${formatBookNumber(payment.balanceAmount)}</td>
        <td>${escapeHtml(payment.paidByOfficeUserName || "-")}</td>
        <td>${escapeHtml(payment.note || "-")}</td>
      </tr>`;
    })
    .join("");
}

async function loadAuditLogs() {
  const payload = await api("/office/audit-log");
  latestAuditLogs = payload.auditLogs || [];
  renderAuditLogs();
}

function renderAuditLogs() {
  const rows = paginateList(
    "audit",
    latestAuditLogs
      .filter((log) => {
        const user = String(log.displayName || log.username || "").toLowerCase();
        const entity = `${log.entityType || ""} ${log.entityLabel || ""} ${log.summary || ""}`.toLowerCase();
        const date = String(log.createdAt || "").slice(0, 10);
        return (
          user.includes(filters.auditUser) &&
          (!filters.auditAction || log.action === filters.auditAction) &&
          entity.includes(filters.auditEntity) &&
          (!filters.auditDateFrom || date >= filters.auditDateFrom) &&
          (!filters.auditDateTo || date <= filters.auditDateTo)
        );
      })
      .sort((a, b) => compareNewestFirst(a, b, "createdAt")),
    "auditTable"
  );
  document.querySelector("#auditTable tbody").innerHTML = rows
    .map(
      (log) => `
      <tr>
        <td>${escapeHtml(formatDateTime(log.createdAt))}</td>
        <td>${escapeHtml(log.displayName || log.username || "-")}</td>
        <td>${escapeHtml(formatAuditAction(log.action))}</td>
        <td>${escapeHtml(formatAuditEntity(log))}</td>
        <td>${escapeHtml(log.summary || "-")}</td>
        <td class="audit-details">${escapeHtml(formatAuditDetails(log))}</td>
      </tr>`
    )
    .join("");
}

async function refreshPairingQr() {
  const message = document.querySelector("#pairingMessage");
  const qrImage = document.querySelector("#pairingQr");
  const urlText = document.querySelector("#pairingUrl");
  message.textContent = "Preparing QR code...";
  try {
    const pairing = await api("/office/pairing-info");
    const qrPayload = pairing.pairingPayload || pairing.primaryUrl;
    qrImage.src = pairing.qrDataUrl || (await window.teaDesktop?.createQrDataUrl(qrPayload));
    urlText.textContent = pairing.primaryUrl;
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
    qrImage.removeAttribute("src");
    urlText.textContent = "";
  }
}

function renderCloudSyncStatus(status) {
  renderCloudSyncConfig(status.config || {});
  const last = status.lastSuccessfulSync;
  document.querySelector("#cloudSyncLastSuccess").textContent = last
    ? `${formatDateTime(last.completedAt || last.startedAt)} (${last.mode})`
    : "No successful sync yet";
  document.querySelector("#cloudSyncCursor").textContent = last?.cursorTo ? `Next incremental sync starts after ${formatDateTime(last.cursorTo)}` : "";
  document.querySelector("#cloudSyncRunsTable tbody").innerHTML = (status.recentRuns || [])
    .map(
      (run) => `
      <tr>
        <td>${escapeHtml(formatDateTime(run.startedAt))}</td>
        <td><span class="status-pill ${run.status === "success" ? "active" : "inactive"}">${escapeHtml(run.status)}</span></td>
        <td>${escapeHtml(run.mode)}</td>
        <td>${escapeHtml(summarizeCounts(run.sent))}</td>
        <td>${escapeHtml(summarizeReceived(run.received))}</td>
        <td>${escapeHtml(run.error || "")}</td>
      </tr>`
    )
    .join("");
  const pagination = status.pagination || { page: 1, totalPages: 1, totalRows: (status.recentRuns || []).length };
  document.querySelector("#cloudSyncPageInfo").textContent =
    pagination.totalRows ? `Page ${pagination.page} of ${pagination.totalPages} (${pagination.totalRows} runs)` : "No sync runs";
}

function renderCloudSyncConfig(config) {
  const backendUrl = String(config.backendUrl || "");
  const backendUrlConfigured = config.backendUrlConfigured === true;
  const tokenConfigured = config.tokenConfigured === true;
  const canManage = config.canManage === true;
  const card = document.querySelector("#cloudSyncConfigCard");
  const summary = document.querySelector("#cloudSyncConfigSummary");
  const form = document.querySelector("#cloudSyncConfigForm");
  const message = document.querySelector("#cloudSyncConfigMessage");

  document.querySelector("#cloudSyncBackendUrl").textContent = backendUrlConfigured ? backendUrl || "Backend URL configured" : "Backend URL not configured";
  document.querySelector("#cloudSyncTokenStatus").textContent = tokenConfigured ? "Cloud sync token configured" : "Cloud sync token not configured";
  card.classList.toggle("hidden", !canManage);
  summary.classList.toggle("hidden", !canManage);
  form.elements.backendUrl.value = backendUrl;
  form.elements.backendToken.value = "";
  if (!message.textContent) message.className = "message";
}

async function loadCloudSyncStatus() {
  const params = new URLSearchParams({
    page: String(listPages.cloudSync || 1),
    pageSize: String(listPageSize)
  });
  if (filters.cloudSyncStatus) params.set("status", filters.cloudSyncStatus);
  if (filters.cloudSyncMode) params.set("mode", filters.cloudSyncMode);
  const status = await api(`/office/cloud-sync/status?${params.toString()}`);
  renderCloudSyncStatus(status);
}

async function saveCloudSyncConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    backendUrl: form.elements.backendUrl.value,
    backendToken: form.elements.backendToken.value
  };
  const message = document.querySelector("#cloudSyncConfigMessage");
  const button = form.querySelector('button[type="submit"]');
  message.className = "message info";
  message.textContent = "Saving cloud sync settings...";
  button.disabled = true;
  try {
    const result = await api("/office/cloud-sync/config", { method: "PUT", body: JSON.stringify(payload) });
    renderCloudSyncConfig(result);
    message.className = "message success";
    message.textContent = "Cloud sync settings saved.";
    showToast("Cloud sync settings saved.");
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function runCloudSync(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    fullSync: form.elements.fullSync.checked,
    syncOfficeUsers: !form.elements.greenLeafOnly.checked
  };
  const message = document.querySelector("#cloudSyncMessage");
  const button = form.querySelector('button[type="submit"]');
  message.className = "message info";
  message.textContent = payload.fullSync ? "Running full cloud sync..." : "Running incremental cloud sync...";
  button.disabled = true;
  try {
    const result = await api("/office/cloud-sync", { method: "POST", body: JSON.stringify(payload) });
    const sent = summarizeCounts(result.sentCounts);
    const imported = result.importedOfficeUsers?.importedCount || 0;
    message.className = "message success";
    message.textContent = `Sync completed. Sent ${sent}. Imported ${imported} office user records from web.`;
    showToast("Cloud sync completed.");
    await loadCloudSyncStatus();
    await refreshState();
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message;
    showToast(error.message, "error");
    await loadCloudSyncStatus().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

function renderRegistrationTables(state) {
  document.querySelector("#teaLineOptions").innerHTML = state.teaLines
    .filter((line) => line.active)
    .map((line) => `<option value="${escapeAttribute(line.name)}"></option>`)
    .join("");

  const teaLines = paginateList(
    "teaLines",
    state.teaLines
      .filter((line) => line.name.toLowerCase().includes(filters.teaLineName))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt")),
    "teaLinesTable"
  );
  document.querySelector("#teaLinesTable tbody").innerHTML = teaLines
    .map(
      (line) => `
      <tr>
        <td>${line.name}</td>
        <td>${line.wholeLineBankTransfer ? "Whole line bank transfer" : "-"}</td>
        <td>${line.active ? "Active" : "Inactive"}</td>
        <td>
          <button class="table-action" type="button" data-edit-line="${line.id}">Edit</button>
          <button class="table-action" type="button" data-toggle-line="${line.id}">${line.active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>`
    )
    .join("");

  const lineUsers = paginateList(
    "lineUsers",
    state.lineUsers
      .filter((user) => user.displayName.toLowerCase().includes(filters.lineUserName))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt")),
    "lineUsersTable"
  );
  document.querySelector("#lineUsersTable tbody").innerHTML = lineUsers
    .map(
      (user) => `
      <tr>
        <td>${user.displayName}</td>
        <td>${user.username}</td>
        <td>${user.active ? "Active" : "Inactive"}</td>
        <td>
          <button class="table-action" type="button" data-edit-line-user="${user.id}">Edit</button>
          <button class="table-action" type="button" data-toggle-line-user="${user.id}">${user.active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>`
    )
    .join("");

  const suppliers = paginateList(
    "suppliers",
    state.suppliers
      .filter((supplier) => supplier.name.toLowerCase().includes(filters.supplierName))
      .filter((supplier) => supplier.lineName.toLowerCase().includes(filters.supplierLine))
      .sort((a, b) => compareNewestFirst(a, b, "updatedAt")),
    "suppliersTable"
  );
  document.querySelector("#suppliersTable tbody").innerHTML = suppliers
    .map((supplier) => {
      const flags = [
        supplier.deductionEnabled ? "2% deduct" : "",
        supplier.ownTransportAdditionEnabled ? "Own transport" : "",
        supplier.factoryTransportDeductionEnabled ? "Factory transport" : "",
        supplier.excludeFromBalance ? "Factory-owned" : "",
        paymentModeLabel(supplier.paymentMode),
        currentSupplierPriceOverride(latestState, supplier.id) ? `Special ${currentSupplierPriceOverride(latestState, supplier.id).teaPricePerKg}` : ""
      ]
        .filter(Boolean)
        .join(", ");
      return `
      <tr>
        <td>${supplier.code}</td>
        <td>${supplier.name}</td>
        <td>${supplier.lineName}</td>
        <td>${flags || "-"}</td>
        <td>${supplier.active ? "Active" : "Inactive"}</td>
        <td>
          <button class="table-action" type="button" data-edit-supplier="${supplier.id}">Edit</button>
          <button class="table-action" type="button" data-toggle-supplier="${supplier.id}">${supplier.active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>`;
    })
    .join("");

  const monthlySettings = paginateList(
    "monthlySettings",
    state.monthlySettings.slice().sort((a, b) => compareNewestFirst(a, b, "updatedAt", "month")),
    "monthlySettingsTable"
  );
  document.querySelector("#monthlySettingsTable tbody").innerHTML = monthlySettings
    .map(
      (setting) => `
      <tr>
        <td>${escapeHtml(setting.month)}</td>
        <td>${setting.teaPricePerKg}</td>
        <td>${setting.deductionPercent}</td>
        <td>${setting.ownTransportAdditionPerKg}</td>
        <td>${setting.factoryTransportDeductionPerKg}</td>
        <td><button class="table-action" type="button" data-edit-monthly-setting="${setting.id}">Edit</button></td>
      </tr>`
    )
    .join("");
}

document.addEventListener("click", (event) => {
  if (!latestState) return;
  const lineId = event.target.dataset.editLine;
  const officeUserId = event.target.dataset.editOfficeUser;
  const lineUserId = event.target.dataset.editLineUser;
  const supplierId = event.target.dataset.editSupplier;
  const monthlySettingId = event.target.dataset.editMonthlySetting;
  const teaPacketTypeId = event.target.dataset.editTeaPacketType;
  const toggleLineId = event.target.dataset.toggleLine;
  const toggleOfficeUserId = event.target.dataset.toggleOfficeUser;
  const toggleLineUserId = event.target.dataset.toggleLineUser;
  const toggleSupplierId = event.target.dataset.toggleSupplier;

  if (lineId) {
    const line = latestState.teaLines.find((item) => item.id === lineId);
    openEditModal("Edit Tea Line", "Field route", renderTeaLineEditForm(line));
  }

  if (officeUserId) {
    if (!isDesktopAdmin()) {
      showToast("Only admin users can edit office users.", "error");
      return;
    }
    const user = latestState.officeUsers.find((item) => item.id === officeUserId);
    openEditModal("Edit Office User", "Office access", renderOfficeUserEditForm(user));
  }

  if (lineUserId) {
    const user = latestState.lineUsers.find((item) => item.id === lineUserId);
    openEditModal("Edit Line User", "Tablet access", renderLineUserEditForm(user));
  }

  if (supplierId) {
    const supplier = latestState.suppliers.find((item) => item.id === supplierId);
    openEditModal("Edit Supplier", "Supplier master data", renderSupplierEditForm(supplier, latestState));
  }

  if (monthlySettingId) {
    const setting = latestState.monthlySettings.find((item) => item.id === monthlySettingId);
    populateMonthlySettingsForm(setting);
    showView("monthlySettingsView");
  }

  if (teaPacketTypeId) {
    const type = latestState.teaPacketTypes.find((item) => item.id === teaPacketTypeId);
    openEditModal("Edit Made Tea Packet", "Packet product", renderTeaPacketTypeEditForm(type));
  }

  if (toggleLineId) toggleActive("teaLines", toggleLineId, "/office/tea-lines", "Tea line");
  if (toggleOfficeUserId) {
    if (!isDesktopAdmin()) {
      showToast("Only admin users can change office user status.", "error");
      return;
    }
    toggleActive("officeUsers", toggleOfficeUserId, "/office/office-users", "Office user");
  }
  if (toggleLineUserId) toggleActive("lineUsers", toggleLineUserId, "/office/line-users", "Line user");
  if (toggleSupplierId) toggleActive("suppliers", toggleSupplierId, "/office/suppliers", "Supplier");
});

async function saveForm(form, path) {
  if (form.id === "supplierForm" && !validateSupplierTeaLine(form)) return;
  await api(path, { method: "POST", body: JSON.stringify(formJson(form)) });
  resetPageForForm(form.id);
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.textContent = "Saved";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
  form.reset();
  await refreshState();
  showToast("Saved successfully.");
}

function resetPageForForm(formId) {
  const pageKeyByForm = {
    lineForm: "teaLines",
    officeUserForm: "officeUsers",
    lineUserForm: "lineUsers",
    supplierForm: "suppliers",
    monthlySettingsForm: "monthlySettings",
    advanceForm: "advances",
    fertilizerTypeForm: "fertilizerTypes",
    fertilizerStockForm: "fertilizerStocks",
    fertilizerForm: "fertilizer",
    teaPacketTypeForm: "teaPacketTypes",
    teaPacketForm: "teaPackets"
  };
  const pageKey = pageKeyByForm[formId];
  if (pageKey) listPages[pageKey] = 1;
}

function openEditModal(title, eyebrow, formHtml) {
  document.querySelector("#editModalTitle").textContent = title;
  document.querySelector("#editModalEyebrow").textContent = eyebrow;
  document.querySelector("#editModalBody").innerHTML = formHtml;
  document.querySelector("#editModal").classList.remove("hidden");
}

function closeEditModal() {
  document.querySelector("#editModal").classList.add("hidden");
  document.querySelector("#editModalBody").innerHTML = "";
}

async function updateFromModal(form, path, label) {
  if (form.dataset.kind === "supplier" && !validateSupplierTeaLine(form)) return;
  const payload = formJson(form);
  const overridePayload = supplierOverrideFromForm(payload);
  const lineOverridePayload = lineOverrideFromForm(payload);
  await api(path, { method: "POST", body: JSON.stringify(payload) });
  if (form.dataset.kind === "supplier" && overridePayload) {
    await api("/office/supplier-month-overrides", { method: "POST", body: JSON.stringify(overridePayload) });
  }
  if (form.dataset.kind === "tea-line" && lineOverridePayload) {
    const result = await api("/office/line-supplier-price-overrides", { method: "POST", body: JSON.stringify(lineOverridePayload) });
    showToast(`Applied special price to ${result.updatedCount} active suppliers.`);
  }
  closeEditModal();
  await refreshState();
  showToast(`${label} updated successfully.`);
}

async function toggleActive(collection, id, path, label) {
  const record = latestState[collection].find((item) => item.id === id);
  const next = { ...record, active: !record.active };
  await api(path, { method: "POST", body: JSON.stringify(next) });
  await refreshState();
  showToast(`${label} ${next.active ? "activated" : "deactivated"}.`);
}

document.querySelector("#lineForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/tea-lines");
});

document.querySelector("#officeUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isDesktopAdmin()) {
    showToast("Only admin users can create office users.", "error");
    return;
  }
  await saveForm(event.currentTarget, "/office/office-users");
});

document.querySelector("#lineUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/line-users");
});

document.querySelector("#supplierForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/suppliers");
});

document.querySelector("#monthlySettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/monthly-settings");
  populateMonthlySettingsForm();
});

document.querySelector("#advanceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!updateAdvanceSupplierSelection()) {
    showToast("Select a supplier from the suggestions.", "error");
    return;
  }
  await saveForm(event.currentTarget, "/office/advances");
  populateAdvanceForm();
});

document.querySelector("#fertilizerTypeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/fertilizer-types");
  populateFertilizerTypeForm();
});

document.querySelector("#fertilizerStockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!updateFertilizerStockTypeSelection()) {
    showToast("Select a fertilizer bag type from the suggestions.", "error");
    return;
  }
  await saveForm(event.currentTarget, "/office/fertilizer-stocks");
  populateFertilizerStockForm();
});

document.querySelector("#fertilizerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!updateFertilizerSupplierSelection()) {
    showToast("Select a supplier from the suggestions.", "error");
    return;
  }
  if (!updateFertilizerIssueStockSelection()) {
    showToast("Select a fertilizer stock from the suggestions.", "error");
    return;
  }
  updateFertilizerIssueTotals();
  await saveForm(event.currentTarget, "/office/fertilizer-issues");
  populateFertilizerForm();
});

document.querySelector("#teaPacketTypeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/tea-packet-types");
  populateTeaPacketTypeForm();
});

document.querySelector("#teaPacketForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!updateTeaPacketSupplierSelection()) {
    showToast("Select a supplier from the suggestions.", "error");
    return;
  }
  if (!updateTeaPacketTypeSelection()) {
    showToast("Select a made tea packet type from the suggestions.", "error");
    return;
  }
  updateTeaPacketTotal();
  await saveForm(event.currentTarget, "/office/tea-packets");
  populateTeaPacketForm();
});

document.querySelector('#fertilizerForm select[name="splitMonths"]').addEventListener("change", updateFertilizerMonthRequirement);
document.querySelector("#advanceSupplierSearch").addEventListener("input", updateAdvanceSupplierSelection);
document.querySelector("#advanceSupplierSearch").addEventListener("change", updateAdvanceSupplierSelection);
document.querySelector("#fertilizerSupplierSearch").addEventListener("input", updateFertilizerSupplierSelection);
document.querySelector("#fertilizerSupplierSearch").addEventListener("change", updateFertilizerSupplierSelection);
document.querySelector("#teaPacketSupplierSearch").addEventListener("input", updateTeaPacketSupplierSelection);
document.querySelector("#teaPacketSupplierSearch").addEventListener("change", updateTeaPacketSupplierSelection);
document.querySelector("#fertilizerStockTypeSearch").addEventListener("input", updateFertilizerStockTypeSelection);
document.querySelector("#fertilizerStockTypeSearch").addEventListener("change", updateFertilizerStockTypeSelection);
for (const eventName of ["input", "change"]) {
  document.querySelector("#fertilizerIssueStockSearch").addEventListener(eventName, () => {
    updateFertilizerIssueStockSelection();
    updateFertilizerIssueTotals();
  });
  document.querySelector("#teaPacketTypeSearch").addEventListener(eventName, () => {
    updateTeaPacketTypeSelection();
    updateTeaPacketTotal();
  });
}
document.querySelector('#fertilizerForm input[name="bagsIssued"]').addEventListener("input", updateFertilizerIssueTotals);
document.querySelector('#teaPacketForm input[name="packetCount"]').addEventListener("input", updateTeaPacketTotal);

document.querySelector("#suggestAdvance").addEventListener("click", async () => {
  const form = document.querySelector("#advanceForm");
  updateAdvanceSupplierSelection();
  const supplierId = form.elements.supplierId.value;
  const month = form.elements.effectiveMonth.value;
  const message = document.querySelector("#advanceSuggestionMessage");
  if (!supplierId || !month) {
    message.textContent = "Select a supplier and effective month first.";
    return;
  }
  try {
    const suggestion = await api(`/office/advance-suggestion?month=${month}&supplierId=${supplierId}`);
    form.elements.amount.value = suggestion.suggestedAmount;
    message.textContent = `Suggested advance: ${suggestion.suggestedAmount} (leaf value ${suggestion.leafValue} - arrears ${suggestion.arrearsCarriedForward} - advances already given ${suggestion.totalAdvances}).`;
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#closeEditModal").addEventListener("click", closeEditModal);
document.querySelector("#editModal").addEventListener("click", (event) => {
  if (event.target.id === "editModal") closeEditModal();
});

document.querySelector("#editModalBody").addEventListener("submit", async (event) => {
  event.preventDefault();
  const kind = event.target.dataset.kind;
  if (kind === "tea-line") await updateFromModal(event.target, "/office/tea-lines", "Tea line");
  if (kind === "office-user") await updateFromModal(event.target, "/office/office-users", "Office user");
  if (kind === "line-user") await updateFromModal(event.target, "/office/line-users", "Line user");
  if (kind === "supplier") await updateFromModal(event.target, "/office/suppliers", "Supplier");
  if (kind === "tea-packet-type") await updateFromModal(event.target, "/office/tea-packet-types", "Made tea packet");
});

document.querySelector("#stagingTable").addEventListener("click", async (event) => {
  const id = event.target.dataset.post;
  if (!id) return;
  const netWeightKg = Number(document.querySelector(`[data-net="${id}"]`).value);
  await api(`/office/staging/${id}`, { method: "PUT", body: JSON.stringify({ netWeightKg }) });
  await api(`/office/staging/${id}/post`, { method: "POST" });
  await refreshState();
});

document.querySelector("#refreshStaging").addEventListener("click", async () => {
  try {
    await refreshState();
    showToast("Staging imports refreshed.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

function openPostAllModal() {
  const count = latestState?.collectionStaging?.length || 0;
  if (!count) {
    showToast("There are no staged records to post.", "error");
    return;
  }
  document.querySelector("#confirmPostAllMessage").textContent = postAllStagingMessage(count);
  document.querySelector("#confirmPostAllModal").classList.remove("hidden");
}

function closePostAllModal() {
  document.querySelector("#confirmPostAllModal").classList.add("hidden");
}

async function postAllStagingRecords() {
  const records = latestState?.collectionStaging || [];
  closePostAllModal();
  if (!records.length) return;
  try {
    for (const record of records) {
      const netWeightKg = Number(document.querySelector(`[data-net="${record.id}"]`)?.value ?? record.netWeightKg);
      await api(`/office/staging/${record.id}`, { method: "PUT", body: JSON.stringify({ netWeightKg }) });
      await api(`/office/staging/${record.id}/post`, { method: "POST" });
    }
    await refreshState();
    showToast(`Posted ${records.length} staged record${records.length === 1 ? "" : "s"}.`);
  } catch (error) {
    await refreshState();
    showToast(error.message, "error");
  }
}

document.querySelector("#postAllStaging").addEventListener("click", openPostAllModal);
document.querySelector("#cancelPostAll").addEventListener("click", closePostAllModal);
document.querySelector("#cancelPostAllTop").addEventListener("click", closePostAllModal);
document.querySelector("#confirmPostAll").addEventListener("click", postAllStagingRecords);
document.querySelector("#confirmPostAllModal").addEventListener("click", (event) => {
  if (event.target.id === "confirmPostAllModal") closePostAllModal();
});
document.querySelector("#cancelBookAction").addEventListener("click", closeBookActionModal);
document.querySelector("#cancelBookActionTop").addEventListener("click", closeBookActionModal);
document.querySelector("#confirmBookAction").addEventListener("click", confirmBookAction);
document.querySelector("#bookActionModal").addEventListener("click", (event) => {
  if (event.target.id === "bookActionModal") closeBookActionModal();
});

document.querySelector("#recordsPrevPage").addEventListener("click", () => {
  recordsPage = Math.max(1, recordsPage - 1);
  renderCollectionRecords(latestState?.collectionEntries || []);
});

document.querySelector("#recordsNextPage").addEventListener("click", () => {
  recordsPage += 1;
  renderCollectionRecords(latestState?.collectionEntries || []);
});

document.querySelector("#loadBook").addEventListener("click", async () => {
  const month = document.querySelector("#bookMonth").value;
  latestBook = await api(`/office/green-leaf-book?month=${month}`);
  populateBookPaymentForm();
  renderGreenLeafBook();
});
document.querySelector("#closeBook").addEventListener("click", closeLoadedBook);
document.querySelector("#reopenBook").addEventListener("click", reopenLoadedBook);

document.querySelector("#bookSupplierFilter").addEventListener("input", renderGreenLeafBook);
document.querySelector("#bookLineFilter").addEventListener("input", renderGreenLeafBook);
document.querySelector("#excludeFactorySuppliersFromTotals").addEventListener("change", renderGreenLeafBook);
document.querySelector('#bookPaymentForm select[name="scope"]').addEventListener("change", updateBookPaymentScope);
document.querySelector("#paymentSupplierSearch").addEventListener("input", updatePaymentSupplierSelection);
document.querySelector("#paymentSupplierSearch").addEventListener("change", updatePaymentSupplierSelection);
document.querySelector('#bookPaymentForm select[name="lineName"]').addEventListener("change", updatePaymentAmountSuggestion);
document.querySelector("#bookPaymentForm").addEventListener("submit", recordBookPayment);
document.querySelector("#billSummaryScope").addEventListener("change", updateBillSummaryScope);
document.querySelector("#loadMonthEndSummary").addEventListener("click", loadMonthEndSummary);
document.querySelector("#printSupplierBills").addEventListener("click", printSupplierBills);
document.querySelector("#billMonth").addEventListener("change", loadBillSelectorOptions);
document.querySelector("#paymentRecordMonth").addEventListener("change", loadPaymentBalances);
window.addEventListener("afterprint", recordSupplierBillPrintAudit);

function renderGreenLeafBook() {
  const book = latestBook;
  if (!book) return;
  const notice = document.querySelector("#bookClosedNotice");
  notice.classList.toggle("hidden", !book.closed);
  notice.textContent = book.closed
    ? `This month Green Leaf Book is closed. Closed by ${book.closure?.closedByOfficeUserName || "office user"} on ${formatDateTime(book.closure?.closedAt)}.`
    : "";
  document.querySelector("#closeBook").classList.toggle("hidden", book.closed);
  document.querySelector("#reopenBook").classList.toggle("hidden", !book.closed || !isDesktopAdmin());
  const supplierFilter = document.querySelector("#bookSupplierFilter").value.trim().toLowerCase();
  const lineFilter = document.querySelector("#bookLineFilter").value.trim().toLowerCase();
  const excludeFactoryFromTotals = document.querySelector("#excludeFactorySuppliersFromTotals").checked;
  const poyaDays = poyaDaysForMonth(book.month);
  const dayHeaders = Array.from({ length: book.dayCount }, (_, index) => {
    const day = index + 1;
    return `<th class="${poyaDays.has(day) ? "poya-day" : ""}">${day}</th>`;
  }).join("");
  const visibleRows = book.rows
    .filter((row) => String(row.supplierName || "").toLowerCase().includes(supplierFilter))
    .filter((row) => String(row.lineName || "").toLowerCase().includes(lineFilter));
  const rows = visibleRows
    .map(
      (row) => `
      <tr class="${row.payment ? "paid-book-row" : ""} ${row.balanceExcluded ? "factory-owned-row" : ""}">
        <td>${row.rowNumber}</td>
        <td>${escapeHtml(row.supplierName)}</td>
        <td>${escapeHtml(row.lineName || "")}</td>
        ${row.dailyKg
          .map((value, index) => `<td class="${poyaDays.has(index + 1) ? "poya-day" : ""}">${formatBookNumber(value, { blankZero: true })}</td>`)
          .join("")}
        <td>${formatBookNumber(row.totalKg)}</td>
        <td class="deduction-value">${formatBookNumber(row.deductionKg)}</td>
        <td class="addition-value">${formatBookNumber(row.finalKg)}</td>
        <td class="addition-value">${formatBookNumber(row.ownTransportAddition)}</td>
        <td class="advance-breakdown">${formatAdvanceDates(row)}</td>
        <td class="advance-breakdown deduction-value">${formatAdvanceAmounts(row)}</td>
        <td class="deduction-value">${formatBookNumber(row.totalAdvances)}</td>
        <td class="deduction-value">${formatBookNumber(row.fertilizerDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(row.teaPacketDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(row.factoryTransportDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(row.arrearsCarriedForward)}</td>
        <td class="addition-value">${formatBookNumber(row.pricePerKg)}</td>
        <td class="addition-value">${formatBookNumber(row.totalAdditions ?? row.ownTransportAddition)}</td>
        <td class="deduction-value">${formatBookNumber(row.totalDeductions)}</td>
        <td class="balance-value">${row.balanceExcluded ? "" : formatBookNumber(row.balanceToPay)}</td>
      </tr>`
    )
    .join("");
  const totalRows = excludeFactoryFromTotals ? visibleRows.filter((row) => !row.balanceExcluded) : visibleRows;
  const totals = greenLeafBookTotals(totalRows, book.dayCount);
  const footerDailyTotals = totals.dailyKg
    .map((value, index) => `<td class="${poyaDays.has(index + 1) ? "poya-day" : ""}">${formatBookNumber(value)}</td>`)
    .join("");
  document.querySelector("#bookTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th><th>Supplier</th><th>Line</th>${dayHeaders}
        <th>Total (Kg)</th><th>2% Deduction (Kg)</th><th>Final Kg (Kg)</th><th>Transport Add (Rs.)</th>
        <th>Advance Date</th><th>Advance Amount (Rs.)</th><th>Total Advance (Rs.)</th><th>Fertilizer (Rs.)</th><th>Made Tea Packets (Rs.)</th><th>Transport Deduct (Rs.)</th><th>Arrears (Rs.)</th>
        <th>Price (Rs.)</th><th>Total Additions (Rs.)</th><th>Total Deductions (Rs.)</th><th>Balance (Rs.)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td></td><td class="book-total-label">Total</td><td></td>${footerDailyTotals}
        <td>${formatBookNumber(totals.totalKg)}</td>
        <td class="deduction-value">${formatBookNumber(totals.deductionKg)}</td>
        <td class="addition-value">${formatBookNumber(totals.finalKg)}</td>
        <td class="addition-value">${formatBookNumber(totals.ownTransportAddition)}</td>
        <td></td>
        <td></td>
        <td class="deduction-value">${formatBookNumber(totals.totalAdvances)}</td>
        <td class="deduction-value">${formatBookNumber(totals.fertilizerDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(totals.teaPacketDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(totals.factoryTransportDeduction)}</td>
        <td class="deduction-value">${formatBookNumber(totals.arrearsCarriedForward)}</td>
        <td></td>
        <td class="addition-value">${formatBookNumber(totals.totalAdditions)}</td>
        <td class="deduction-value">${formatBookNumber(totals.totalDeductions)}</td>
        <td class="balance-value balance-total-cell">
          <span class="positive-balance-total">${formatBookNumber(totals.positiveBalanceToPay)}</span>
          <span class="negative-balance-total">${formatBookNumber(totals.negativeBalanceToPay)}</span>
        </td>
      </tr>
    </tfoot>`;
}

function populateBookPaymentForm({ preservePaymentSelection = true } = {}) {
  const form = document.querySelector("#bookPaymentForm");
  const rows = latestBook?.rows || [];
  const paymentRows = rows.filter((row) => !row.balanceExcluded);
  const payableRows = paymentRows.filter((row) => Number(row.balanceToPay || 0) > 0);
  const selectedPaymentSupplier = preservePaymentSelection ? form.elements.supplierId.value : "";
  const selectedPaymentSupplierLabel = preservePaymentSelection ? document.querySelector("#paymentSupplierSearch").value : "";
  const selectedPaymentLine = preservePaymentSelection ? form.elements.lineName.value : "";
  const selectedSummarySupplier = document.querySelector("#billSummarySupplier").value;
  const selectedSummaryLine = document.querySelector("#billSummaryLine").value;
  if (!preservePaymentSelection) {
    form.elements.scope.value = "supplier";
    form.elements.amount.value = "";
    form.elements.note.value = "";
  }
  document.querySelector("#paymentRecordMonth").value = latestBook?.month || document.querySelector("#paymentRecordMonth").value;
  form.elements.paidAt.value = localDateValue();
  paymentSupplierChoices = paymentRows.map((row) => {
    const balance = Number(row.balanceToPay || 0);
    const inactiveLabel = balance <= 0 ? ` - inactive${balance < 0 ? ` debt ${formatBookNumber(balance)}` : ""}` : "";
    return {
      id: row.supplierId,
      label: `${row.supplierName} (${row.lineName || ""})${inactiveLabel}`,
      active: balance > 0,
      balance
    };
  });
  document.querySelector("#paymentSupplierOptions").innerHTML = paymentSupplierChoices
    .map((choice) => `<option value="${escapeAttribute(choice.label)}"></option>`)
    .join("");
  const lineNames = [...new Set(payableRows.map((row) => row.lineName).filter(Boolean))];
  form.elements.lineName.innerHTML = lineNames
    .map((lineName) => `<option value="${escapeAttribute(lineName)}">${escapeHtml(lineName)}</option>`)
    .join("");
  document.querySelector("#billSummarySupplier").innerHTML = rows
    .map((row) => `<option value="${escapeAttribute(row.supplierId)}">${escapeHtml(row.supplierName)} (${escapeHtml(row.lineName || "")})</option>`)
    .join("");
  document.querySelector("#billSummaryLine").innerHTML = lineNames
    .map((lineName) => `<option value="${escapeAttribute(lineName)}">${escapeHtml(lineName)}</option>`)
    .join("");
  if (payableRows.some((row) => row.supplierId === selectedPaymentSupplier)) {
    form.elements.supplierId.value = selectedPaymentSupplier;
    document.querySelector("#paymentSupplierSearch").value = selectedPaymentSupplierLabel || paymentSupplierChoices.find((choice) => choice.id === selectedPaymentSupplier)?.label || "";
  } else {
    form.elements.supplierId.value = "";
    document.querySelector("#paymentSupplierSearch").value = "";
  }
  if (lineNames.includes(selectedPaymentLine)) form.elements.lineName.value = selectedPaymentLine;
  if (rows.some((row) => row.supplierId === selectedSummarySupplier)) document.querySelector("#billSummarySupplier").value = selectedSummarySupplier;
  if (lineNames.includes(selectedSummaryLine)) document.querySelector("#billSummaryLine").value = selectedSummaryLine;
  updateBookPaymentScope();
  updateBillSummaryScope();
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = Boolean(latestBook?.closed);
  });
}

function openBookActionModal(action) {
  if (!latestBook) {
    showToast("Load a Green Leaf Book month first.", "error");
    return;
  }
  pendingBookAction = { action, month: latestBook.month };
  const isClose = action === "close";
  document.querySelector("#bookActionTitle").textContent = isClose ? `Close ${latestBook.month} Green Leaf Book?` : `Reopen ${latestBook.month} Green Leaf Book?`;
  document.querySelector("#bookActionMessage").textContent = isClose
    ? "Please confirm carefully. After this month is closed, regular office users cannot reopen it; only an admin can reopen it for corrections."
    : "Reopening allows changes to be made again for this month and will be recorded in the audit report.";
  document.querySelector("#bookActionNote").value = "";
  document.querySelector("#confirmBookAction").textContent = isClose ? "Close month" : "Reopen month";
  document.querySelector("#bookActionModal").classList.remove("hidden");
}

function closeBookActionModal() {
  pendingBookAction = null;
  document.querySelector("#bookActionModal").classList.add("hidden");
}

async function confirmBookAction() {
  if (!pendingBookAction) return;
  const { action, month } = pendingBookAction;
  const note = document.querySelector("#bookActionNote").value;
  const endpoint = action === "close" ? "/office/green-leaf-book/close" : "/office/green-leaf-book/reopen";
  try {
    await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ month, note })
    });
    latestBook = await api(`/office/green-leaf-book?month=${month}`);
    populateBookPaymentForm();
    renderGreenLeafBook();
    closeBookActionModal();
    showToast(action === "close" ? "Green Leaf Book closed." : "Green Leaf Book reopened.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function closeLoadedBook() {
  openBookActionModal("close");
}

function reopenLoadedBook() {
  openBookActionModal("reopen");
}

function updateBookPaymentScope() {
  const form = document.querySelector("#bookPaymentForm");
  const isLinePayment = form.elements.scope.value === "line";
  document.querySelector("#paymentSupplierSearch").classList.toggle("hidden", isLinePayment);
  form.elements.lineName.classList.toggle("hidden", !isLinePayment);
  updatePaymentAmountSuggestion();
}

function updatePaymentSupplierSelection() {
  const form = document.querySelector("#bookPaymentForm");
  const searchValue = document.querySelector("#paymentSupplierSearch").value;
  const choice = paymentSupplierChoices.find((item) => item.label === searchValue);
  form.elements.supplierId.value = choice?.active ? choice.id : "";
  updatePaymentAmountSuggestion();
}

function updatePaymentAmountSuggestion() {
  const form = document.querySelector("#bookPaymentForm");
  const isLinePayment = form.elements.scope.value === "line";
  const rows = (latestBook?.rows || []).filter((row) => !row.balanceExcluded);
  const amount = isLinePayment
    ? rows
        .filter((row) => row.lineName === form.elements.lineName.value)
        .reduce((total, row) => total + Math.max(0, Number(row.balanceToPay || 0)), 0)
    : Math.max(0, Number(rows.find((row) => row.supplierId === form.elements.supplierId.value)?.balanceToPay || 0));
  form.elements.amount.value = amount ? String(Math.round((amount + Number.EPSILON) * 100) / 100) : "";
}

function updateBillSummaryScope() {
  const scope = document.querySelector("#billSummaryScope").value;
  document.querySelector("#billSummarySupplier").classList.toggle("hidden", scope !== "supplier");
  document.querySelector("#billSummaryLine").classList.toggle("hidden", scope !== "line");
}

async function loadPaymentBalances() {
  const month = document.querySelector("#paymentRecordMonth").value;
  latestBook = await api(`/office/green-leaf-book?month=${month}`);
  populateBookPaymentForm();
}

async function loadBillSelectorOptions() {
  const month = document.querySelector("#billMonth").value;
  latestBook = await api(`/office/green-leaf-book?month=${month}`);
  populateBookPaymentForm();
}

async function recordBookPayment(event) {
  event.preventDefault();
  if (!latestBook) {
    showToast("Generate summaries first.", "error");
    return;
  }
  if (latestBook.closed) {
    showToast("This Green Leaf Book month is closed.", "error");
    return;
  }
  const form = event.currentTarget;
  const payload = formPayload(form);
  payload.month = latestBook.month;
  if (payload.scope === "supplier" && !payload.supplierId) {
    showToast("Select a supplier to record payment.", "error");
    return;
  }
  if (payload.scope === "line" && !payload.lineName) {
    showToast("Select a line to record payment.", "error");
    return;
  }
  await api("/office/supplier-payments", { method: "POST", body: JSON.stringify(payload) });
  latestBook = await api(`/office/green-leaf-book?month=${latestBook.month}`);
  latestMonthEndSummary = await api(`/office/month-end-summary?month=${latestBook.month}`);
  await refreshState();
  populateBookPaymentForm({ preservePaymentSelection: false });
  renderGreenLeafBook();
  renderMonthEndSummary();
  showToast("Payment recorded.");
}

async function loadMonthEndSummary() {
  const month = document.querySelector("#billMonth").value;
  latestBook = await api(`/office/green-leaf-book?month=${month}`);
  latestMonthEndSummary = await api(`/office/month-end-summary?month=${month}`);
  populateBookPaymentForm();
  activeBillSummaryScope = document.querySelector("#billSummaryScope").value;
  activeBillSummarySupplier = document.querySelector("#billSummarySupplier").value;
  activeBillSummaryLine = document.querySelector("#billSummaryLine").value;
  renderMonthEndSummary();
}

function renderMonthEndSummary() {
  const summary = latestMonthEndSummary;
  const host = document.querySelector("#monthEndSummary");
  if (!summary) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  const scope = activeBillSummaryScope;
  const selectedSupplierId = activeBillSummarySupplier;
  const selectedLineName = activeBillSummaryLine;
  const supplierBills = filteredSupplierBills(summary, scope, selectedSupplierId, selectedLineName);
  const lineSummaries = summary.lineSummaries.filter((line) => {
    if (scope === "line") return line.lineName === selectedLineName;
    if (scope === "supplier") return supplierBills.some((bill) => bill.lineName === line.lineName);
    return true;
  });
  const lineRows = lineSummaries
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.lineName || "")}</td>
        <td>${line.supplierCount}</td>
        <td>${formatBookNumber(line.totalKg)}</td>
        <td>${formatBookNumber(line.finalKg)}</td>
        <td>${formatBookNumber(line.leafValue)}</td>
        <td>${formatBookNumber(line.totalAdditions)}</td>
        <td>${formatBookNumber(line.totalDeductions)}</td>
        <td>${formatBookNumber(line.balanceToPay)}</td>
        <td>${line.paidCount}</td>
      </tr>`
    )
    .join("");
  const supplierCards = supplierBills
    .map((bill) => {
      const fertilizer = bill.fertilizer
        .map((item) => `${escapeHtml(item.date)}: ${formatBookNumber(item.effectiveAmount)} effective, ${formatBookNumber(item.carriedForwardAmount)} forward`)
        .join("<br>") || "-";
      const packets = bill.teaPackets
        .map((item) => `${escapeHtml(item.date)}: ${item.packetCount} x ${formatBookNumber(item.perPacketPrice)} = ${formatBookNumber(item.totalAmount)}`)
        .join("<br>") || "-";
      return `
        <article class="supplier-bill-card">
          <h4>${escapeHtml(bill.supplierName)} <span>${escapeHtml(bill.lineName || "")}</span></h4>
          <div class="bill-grid">
            <span>Total kg</span><strong>${formatBookNumber(bill.totalKg)}</strong>
            <span>Price per kg</span><strong>${formatBookNumber(bill.pricePerKg)}</strong>
            <span>Leaf value</span><strong>${formatBookNumber(bill.leafValue)}</strong>
            <span>Transport add</span><strong>${formatBookNumber(bill.ownTransportAddition)}</strong>
            <span>Transport deduct</span><strong>${formatBookNumber(bill.factoryTransportDeduction)}</strong>
            <span>Arrears</span><strong>${formatBookNumber(bill.arrearsCarriedForward)}</strong>
            <span>Total additions</span><strong>${formatBookNumber(bill.totalAdditions)}</strong>
            <span>Total deductions</span><strong>${formatBookNumber(bill.totalDeductions)}</strong>
            <span>Balance</span><strong>${bill.balanceExcluded ? "Factory-owned" : formatBookNumber(bill.balanceToPay)}</strong>
            <span>Payment</span><strong>${bill.payment ? `Recorded ${escapeHtml(bill.payment.paidAt.slice(0, 10))}` : "Pending"}</strong>
          </div>
          <p><strong>Fertilizer:</strong><br>${fertilizer}</p>
          <p><strong>Made tea packets:</strong><br>${packets}</p>
        </article>`;
    })
    .join("");
  const lineSection =
    scope === "supplier"
      ? ""
      : `<div class="summary-section">
      <h3>Line-wise Summary</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Line</th><th>Suppliers</th><th>Total Kg</th><th>Final Kg</th><th>Leaf Value</th><th>Additions</th><th>Deductions</th><th>Balance</th><th>Paid</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </div>
    </div>`;
  const supplierSection =
    scope === "line"
      ? ""
      : `<div class="summary-section">
      <h3>Supplier Bills</h3>
      <div class="supplier-bill-grid">${supplierCards}</div>
    </div>`;
  const printPreviewSection = `<div class="summary-section print-preview-section is-collapsed">
      <div class="print-preview-heading">
        <div>
          <h3>Supplier Bill Print Preview</h3>
          <p>${supplierBills.length} bill${supplierBills.length === 1 ? "" : "s"} ready. Default printing uses all bills, two per A4 sheet.</p>
        </div>
        <div class="print-preview-actions">
          <button id="toggleSupplierBillPreview" class="secondary-button" type="button" aria-expanded="false">Show preview</button>
          <button id="printSupplierBillsPreview" class="secondary-button" type="button">Print all bills</button>
        </div>
      </div>
      <div id="supplierBillPreviewContent" class="print-preview-content hidden">
        <div class="print-selection-toolbar">
          <span>Select suppliers to print only chosen bills.</span>
          <button id="selectAllSupplierBills" class="ghost-button" type="button">Select all</button>
          <button id="clearSupplierBills" class="ghost-button" type="button">Clear</button>
          <button id="printSelectedSupplierBills" class="secondary-button" type="button">Print selected bills</button>
        </div>
        <div class="supplier-print-preview-list">${supplierBills.map(renderSelectableSupplierBillPreview).join("")}</div>
      </div>
    </div>`;
  host.innerHTML = `${lineSection}${supplierSection}${printPreviewSection}`;
  document.querySelector("#printSupplierBillsPreview")?.addEventListener("click", printSupplierBills);
  document.querySelector("#printSelectedSupplierBills")?.addEventListener("click", () => printSupplierBills({ selectedOnly: true }));
  document.querySelector("#toggleSupplierBillPreview")?.addEventListener("click", toggleSupplierBillPreview);
  document.querySelector("#selectAllSupplierBills")?.addEventListener("click", () => setSupplierBillSelection(true));
  document.querySelector("#clearSupplierBills")?.addEventListener("click", () => setSupplierBillSelection(false));
  host.classList.remove("hidden");
}

function filteredSupplierBills(summary, scope, selectedSupplierId, selectedLineName) {
  return (summary?.supplierBills || []).filter((bill) => {
    if (scope === "supplier") return bill.supplierId === selectedSupplierId;
    if (scope === "line") return bill.lineName === selectedLineName;
    return true;
  });
}

async function printSupplierBills(options = {}) {
  try {
    const selectedOnly = options?.selectedOnly === true;
    const month = document.querySelector("#billMonth").value;
    if (!month) {
      showToast("Select a bill month before printing.", "error");
      return;
    }
    if (!latestMonthEndSummary || latestMonthEndSummary.month !== month) {
      latestBook = await api(`/office/green-leaf-book?month=${month}`);
      latestMonthEndSummary = await api(`/office/month-end-summary?month=${month}`);
      populateBookPaymentForm();
    }
    activeBillSummaryScope = document.querySelector("#billSummaryScope").value;
    activeBillSummarySupplier = document.querySelector("#billSummarySupplier").value;
    activeBillSummaryLine = document.querySelector("#billSummaryLine").value;
    let bills = filteredSupplierBills(latestMonthEndSummary, activeBillSummaryScope, activeBillSummarySupplier, activeBillSummaryLine);
    if (selectedOnly) {
      const selectedSupplierIds = selectedSupplierBillIds();
      bills = bills.filter((bill) => selectedSupplierIds.includes(bill.supplierId));
    }
    if (!bills.length) {
      showToast(selectedOnly ? "Select at least one supplier bill to print." : "No supplier bills found for the selected option.", "error");
      return;
    }
    document.querySelector("#supplierBillPrintArea").innerHTML = bills.map(renderSinhalaSupplierBill).join("");
    pendingSupplierBillPrintAudit = {
      month,
      suppliers: bills.map((bill) => ({
        id: bill.supplierId,
        code: bill.supplierCode,
        name: bill.supplierName
      }))
    };
    window.print();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function recordSupplierBillPrintAudit() {
  if (!pendingSupplierBillPrintAudit) return;
  const payload = pendingSupplierBillPrintAudit;
  pendingSupplierBillPrintAudit = null;
  try {
    await api("/office/supplier-bill-print-audit", { method: "POST", body: JSON.stringify(payload) });
    if (document.querySelector("#auditReportsView")?.classList.contains("active-view")) {
      await loadAuditLogs();
    }
  } catch (error) {
    showToast(`Could not record print audit: ${error.message}`, "error");
  }
}

function renderSelectableSupplierBillPreview(bill, index) {
  return `<article class="supplier-print-preview-item">
    <label class="supplier-print-selector">
      <input class="supplier-print-checkbox" type="checkbox" value="${escapeAttribute(bill.supplierId)}" checked />
      <span>${escapeHtml(bill.supplierName)}${bill.lineName ? ` - ${escapeHtml(bill.lineName)}` : ""}</span>
    </label>
    ${renderSinhalaSupplierBill(bill, index)}
  </article>`;
}

function toggleSupplierBillPreview() {
  const section = document.querySelector(".print-preview-section");
  const content = document.querySelector("#supplierBillPreviewContent");
  const button = document.querySelector("#toggleSupplierBillPreview");
  const willExpand = content?.classList.contains("hidden");
  content?.classList.toggle("hidden", !willExpand);
  section?.classList.toggle("is-collapsed", !willExpand);
  if (button) {
    button.textContent = willExpand ? "Hide preview" : "Show preview";
    button.setAttribute("aria-expanded", String(willExpand));
  }
}

function setSupplierBillSelection(checked) {
  for (const checkbox of document.querySelectorAll(".supplier-print-checkbox")) {
    checkbox.checked = checked;
  }
}

function selectedSupplierBillIds() {
  return [...document.querySelectorAll(".supplier-print-checkbox:checked")].map((checkbox) => checkbox.value);
}

function renderSinhalaSupplierBill(bill, index) {
  const advanceTotal = sumNumbers((bill.advances || []).map((item) => item.amount));
  const fertilizerTotal = sumNumbers((bill.fertilizer || []).map((item) => item.effectiveAmount));
  const teaPacketTotal = sumNumbers((bill.teaPackets || []).map((item) => item.totalAmount));
  const fertilizerKg = effectiveFertilizerKg(bill.fertilizer || []);
  const teaPacketCount = effectiveTeaPacketCount(bill.teaPackets || []);
  const topFields = [
    ["ගෙවිය යුතු දළු ප්‍රමාණය", `${formatBookNumber(bill.finalKg)} kg`],
    ["දළු කි.ග්‍රෑ. එකක මිල", `රු. ${formatBillCurrency(bill.pricePerKg)}`],
    ["දළු වටිනාකම", `රු. ${formatBillCurrency(bill.leafValue)}`]
  ];
  const rows = [
    ["ප්‍රවාහන එකතු කිරීම", "", formatBillCurrency(bill.ownTransportAddition)],
    ["දිරිගැන්වීම්", "", formatBillCurrency(0)],
    ["අත්තිකාරම්", "", formatBillCurrency(advanceTotal)],
    ["පොහොර අඩු කිරීම", formatBookNumber(fertilizerKg, { blankZero: true }), formatBillCurrency(fertilizerTotal)],
    ["තේ පැකට් අඩු කිරීම", formatBookNumber(teaPacketCount, { blankZero: true }), formatBillCurrency(teaPacketTotal)],
    ["ප්‍රවාහන අඩු කිරීම", "", formatBillCurrency(bill.factoryTransportDeduction)],
    ["පෙර හිඟ මුදල්", "", formatBillCurrency(bill.arrearsCarriedForward)],
    ["මුළු එකතු කිරීම්", "", formatBillCurrency(bill.totalAdditions)],
    ["මුළු අඩු කිරීම්", "", formatBillCurrency(bill.totalDeductions)]
  ];
  const dailyRows = dailyKgRows(bill.dailyKg || []);
  const paymentLabel = bill.balanceExcluded ? "කර්මාන්තශාලාව සතු" : sinhalaPaymentModeLabel(bill.paymentMode);
  const certificateKg = formatBookNumber(bill.finalKg);
  const certificateNote = `අධිකාරී 1951 අංක 51 දරන TC 19 ප්‍රකාශනය ආකෘති පත්‍රය ප්‍රකාරව ${escapeHtml(formatSinhalaMonth(bill.month))} මාසය සඳහා සැපයූ තේ දළු කිලෝ ${certificateKg} වෙනුවෙන් ඉහත ප්‍රකාරව මුදල් ලබාගත් බව මෙයින් සහතික කරමි.`;
  return `
    <section class="sinhala-bill-sheet">
      <div class="sinhala-bill">
        <header class="sinhala-bill-header">
          <img src="../../logo/KudamalanaLogo1.png" alt="" />
          <div>
            <p class="sinhala-bill-ref">MF-259</p>
            <h1>කුඩමලාන තේ කර්මාන්ත ශාලාව - තල්ගස්වල</h1>
            <h2>අමු දළු සැපයීමේ බිල්පත</h2>
            <p>www.web.kudamalana.lk</p>
          </div>
          <div class="sinhala-bill-date">
            <span>දිනය</span>
            <strong>${escapeHtml(localDateValue())}</strong>
          </div>
        </header>
        <div class="sinhala-bill-meta-values">
        <div class="sinhala-bill-meta">
          <span>අංකය: <strong>${escapeHtml(bill.supplierCode || bill.supplierId || "")}</strong></span>
          <span>නම: <strong>${escapeHtml(bill.supplierName)}</strong></span>
          <span>මාසය: <strong>${escapeHtml(formatSinhalaMonth(bill.month))}</strong></span>
          <span>මාර්ගය: <strong>${escapeHtml(bill.lineName || "")}</strong></span>
        </div>
        <div class="sinhala-bill-top-values">
          ${topFields
            .map(
              ([label, value]) => `
              <span><em>${label}</em><strong>${value}</strong></span>`
            )
            .join("")}
        </div>
        </div>
        <table class="sinhala-bill-table">
          <thead>
            <tr><th>විස්තරය</th><th>කි.ග්‍රෑ.</th><th>රු.</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                ([label, kg, amount]) => `
                <tr>
                  <td>${label}</td>
                  <td>${kg}</td>
                  <td>${amount}</td>
                </tr>`
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>ගෙවිය යුතු ශේෂය</td>
              <td>${paymentLabel}</td>
              <td>${bill.balanceExcluded ? "" : formatBillCurrency(bill.balanceToPay)}</td>
            </tr>
          </tfoot>
        </table>
        <table class="sinhala-daily-table">
          <tbody>${dailyRows}</tbody>
        </table>
        <p class="sinhala-bill-note">${certificateNote}</p>
        <div class="sinhala-bill-signatures">
          <span>දිනය ................................</span>
          <span>අත්සන ................................</span>
        </div>
      </div>
    </section>`;
}

function dailyKgRows(values) {
  const days = Array.from({ length: values.length || 31 }, (_, index) => index + 1);
  const chunks = [days.slice(0, 16), days.slice(16)];
  return chunks
    .map((chunk) => {
      const heads = chunk.map((day) => `<th>${day}</th>`).join("");
      const weights = chunk.map((day) => `<td>${formatBookNumber(values[day - 1])}</td>`).join("");
      return `<tr>${heads}</tr><tr>${weights}</tr>`;
    })
    .join("");
}

function formatSinhalaMonth(month) {
  const [year, monthNumber] = String(month || "").split("-");
  if (!year || !monthNumber) return month || "";
  const names = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];
  return `${names[Number(monthNumber) - 1] || monthNumber} ${year}`;
}

document.querySelector("#refreshPairingQr").addEventListener("click", refreshPairingQr);
document.querySelector("#cloudSyncConfigForm").addEventListener("submit", saveCloudSyncConfig);
document.querySelector("#cloudSyncForm").addEventListener("submit", runCloudSync);

document.querySelector("#bookMonth").value = localMonthValue();
document.querySelector("#billMonth").value = localMonthValue();
document.querySelector("#paymentRecordMonth").value = localMonthValue();
populateMonthlySettingsForm();
populateAdvanceForm();
populateFertilizerTypeForm();
populateFertilizerStockForm();
populateFertilizerForm();
populateTeaPacketTypeForm();
populateTeaPacketForm();

function populateMonthlySettingsForm(setting = null) {
  const form = document.querySelector("#monthlySettingsForm");
  const current =
    setting ||
    latestState?.monthlySettings.find((item) => item.month === localMonthValue()) || {
      id: "",
      month: localMonthValue(),
      teaPricePerKg: 200,
      deductionPercent: 2,
      ownTransportAdditionPerKg: 5,
      factoryTransportDeductionPerKg: 3
    };
  form.elements.id.value = current.id || "";
  form.elements.month.value = current.month || localMonthValue();
  form.elements.teaPricePerKg.value = current.teaPricePerKg ?? 200;
  form.elements.deductionPercent.value = current.deductionPercent ?? 2;
  form.elements.ownTransportAdditionPerKg.value = current.ownTransportAdditionPerKg ?? 5;
  form.elements.factoryTransportDeductionPerKg.value = current.factoryTransportDeductionPerKg ?? 3;
}

function populateAdvanceForm() {
  const form = document.querySelector("#advanceForm");
  form.elements.id.value = "";
  form.elements.supplierId.value = "";
  document.querySelector("#advanceSupplierSearch").value = "";
  form.elements.effectiveMonth.value = localMonthValue();
  form.elements.date.value = localDateValue();
  document.querySelector("#advanceSuggestionMessage").textContent = "";
}

function updateAdvanceSupplierSelection() {
  const form = document.querySelector("#advanceForm");
  const searchValue = document.querySelector("#advanceSupplierSearch").value;
  const choice = advanceSupplierChoices.find((item) => item.label === searchValue);
  form.elements.supplierId.value = choice?.id || "";
  return Boolean(choice);
}

function updateFertilizerSupplierSelection() {
  const form = document.querySelector("#fertilizerForm");
  const searchValue = document.querySelector("#fertilizerSupplierSearch").value;
  const choice = fertilizerSupplierChoices.find((item) => item.label === searchValue);
  form.elements.supplierId.value = choice?.id || "";
  return Boolean(choice);
}

function updateTeaPacketSupplierSelection() {
  const form = document.querySelector("#teaPacketForm");
  const searchValue = document.querySelector("#teaPacketSupplierSearch").value;
  const choice = teaPacketSupplierChoices.find((item) => item.label === searchValue);
  form.elements.supplierId.value = choice?.id || "";
  return Boolean(choice);
}

function updateFertilizerStockTypeSelection() {
  const form = document.querySelector("#fertilizerStockForm");
  const searchValue = document.querySelector("#fertilizerStockTypeSearch").value;
  const choice = fertilizerStockTypeChoices.find((item) => item.label === searchValue);
  form.elements.fertilizerTypeId.value = choice?.id || "";
  return Boolean(choice);
}

function updateFertilizerIssueStockSelection() {
  const form = document.querySelector("#fertilizerForm");
  const searchValue = document.querySelector("#fertilizerIssueStockSearch").value;
  const choice = fertilizerIssueStockChoices.find((item) => item.label === searchValue);
  form.elements.fertilizerStockId.value = choice?.id || "";
  return Boolean(choice);
}

function updateTeaPacketTypeSelection() {
  const form = document.querySelector("#teaPacketForm");
  const searchValue = document.querySelector("#teaPacketTypeSearch").value;
  const choice = teaPacketTypeChoices.find((item) => item.label === searchValue);
  form.elements.teaPacketTypeId.value = choice?.id || "";
  return Boolean(choice);
}

function populateFertilizerTypeForm() {
  const form = document.querySelector("#fertilizerTypeForm");
  form.elements.id.value = "";
}

function populateFertilizerStockForm() {
  const form = document.querySelector("#fertilizerStockForm");
  form.elements.id.value = "";
  form.elements.fertilizerTypeId.value = "";
  document.querySelector("#fertilizerStockTypeSearch").value = "";
  form.elements.date.value = localDateValue();
}

function populateFertilizerForm() {
  const form = document.querySelector("#fertilizerForm");
  form.elements.id.value = "";
  form.elements.supplierId.value = "";
  document.querySelector("#fertilizerSupplierSearch").value = "";
  form.elements.fertilizerStockId.value = "";
  document.querySelector("#fertilizerIssueStockSearch").value = "";
  form.elements.date.value = localDateValue();
  form.elements.bagsIssued.value = "";
  form.elements.kgGiven.value = "";
  form.elements.totalAmount.value = "";
  form.elements.splitMonths.value = "1";
  form.elements.effectiveMonth1.value = localMonthValue();
  form.elements.effectiveMonth2.value = "";
  updateFertilizerMonthRequirement();
  updateFertilizerIssueTotals();
}

function updateFertilizerMonthRequirement() {
  const form = document.querySelector("#fertilizerForm");
  const needsSecondMonth = form.elements.splitMonths.value === "2";
  form.elements.effectiveMonth2.required = needsSecondMonth;
  form.elements.effectiveMonth2.disabled = !needsSecondMonth;
  if (!needsSecondMonth) form.elements.effectiveMonth2.value = "";
}

function updateFertilizerIssueTotals() {
  const form = document.querySelector("#fertilizerForm");
  if (!form || !latestState) return;
  const stock = (latestState.fertilizerStocks || []).find((item) => item.id === form.elements.fertilizerStockId.value);
  const type = (latestState.fertilizerTypes || []).find((item) => item.id === stock?.fertilizerTypeId);
  const bagsIssued = Number(form.elements.bagsIssued.value || 0);
  const bagWeightKg = Number(type?.bagWeightKg || 0);
  const perBagPrice = Number(stock?.perBagPrice || 0);
  form.elements.kgGiven.value = stock && bagsIssued > 0 ? Math.round((bagsIssued * bagWeightKg + Number.EPSILON) * 100) / 100 : "";
  form.elements.totalAmount.value = stock && bagsIssued > 0 ? Math.round((bagsIssued * perBagPrice + Number.EPSILON) * 100) / 100 : "";
}

function populateTeaPacketForm() {
  const form = document.querySelector("#teaPacketForm");
  form.elements.id.value = "";
  form.elements.supplierId.value = "";
  document.querySelector("#teaPacketSupplierSearch").value = "";
  form.elements.teaPacketTypeId.value = "";
  document.querySelector("#teaPacketTypeSearch").value = "";
  form.elements.date.value = localDateValue();
  form.elements.packetCount.value = "";
  form.elements.effectiveMonth.value = localMonthValue();
  form.elements.totalAmount.value = "";
}

function populateTeaPacketTypeForm() {
  const form = document.querySelector("#teaPacketTypeForm");
  form.elements.id.value = "";
}
