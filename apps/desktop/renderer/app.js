const apiBaseUrl = window.teaDesktop?.apiBaseUrl || "http://127.0.0.1:7070";
let officeToken = "";
let officeUser = null;
let latestState = null;
let latestBook = null;
const filters = {
  officeUserName: "",
  teaLineName: "",
  lineUserName: "",
  supplierName: "",
  supplierLine: "",
  recordSupplier: "",
  recordLine: "",
  recordDateFrom: "",
  recordDateTo: "",
  recordPostedBy: "",
  recordCollector: ""
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
  fertilizer: 1,
  teaPackets: 1,
  staging: 1
};

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(officeToken ? { authorization: `Bearer ${officeToken}` } : {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

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
  latestBook = null;
  document.querySelector("#stagingTable tbody").innerHTML = "";
  document.querySelector("#recordsTable tbody").innerHTML = "";
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
}

function formJson(form) {
  const data = new FormData(form);
  const result = Object.fromEntries(data.entries());
  if (!result.id) delete result.id;
  if (!result.password) delete result.password;
  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    result[checkbox.name] = checkbox.checked;
  }
  if (!("active" in result)) result.active = true;
  return result;
}

function isRegisteredTeaLine(lineName) {
  const normalized = String(lineName || "").trim().toLowerCase();
  return latestState?.teaLines.some((line) => line.active && line.name.toLowerCase() === normalized);
}

function validateSupplierTeaLine(form) {
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
  const payload = Object.fromEntries(new FormData(form).entries());
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

document.querySelector(".summary-grid").addEventListener("click", (event) => {
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
    if (clearFormId === "fertilizerForm") populateFertilizerForm();
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

document.addEventListener("click", (event) => {
  const pageKey = event.target.dataset.pageKey;
  const pageDir = event.target.dataset.pageDir;
  if (!pageKey || !pageDir || !latestState) return;
  listPages[pageKey] = Math.max(1, (listPages[pageKey] || 1) + Number(pageDir));
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
  const payload = Object.fromEntries(new FormData(form).entries());
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
    state.collectionStaging.slice().sort((a, b) => compareNewestFirst(a, b, "importedAt")),
    "stagingTable"
  );
  document.querySelector("#stagingTable tbody").innerHTML = pageRows
    .map(
      (row) => `
      <tr>
        <td>${row.supplierCode} ${row.supplierName}</td>
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

function compareNewestFirst(a, b, ...fields) {
  const aValue = latestComparableValue(a, fields);
  const bValue = latestComparableValue(b, fields);
  if (aValue !== bValue) return bValue - aValue;
  return String(b.id || "").localeCompare(String(a.id || ""));
}

function latestComparableValue(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function paginateList(pageKey, items, tableId) {
  const pageCount = Math.max(1, Math.ceil(items.length / listPageSize));
  listPages[pageKey] = Math.min(Math.max(1, listPages[pageKey] || 1), pageCount);
  const start = (listPages[pageKey] - 1) * listPageSize;
  const pageItems = items.slice(start, start + listPageSize);
  renderListPagination(pageKey, tableId, items.length, start, pageItems.length, pageCount);
  return pageItems;
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
  const supplierOptions = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => `<option value="${escapeAttribute(supplier.id)}">${escapeHtml(supplier.name)} (${escapeHtml(supplier.code)})</option>`)
    .join("");
  const supplierSelect = document.querySelector('#advanceForm select[name="supplierId"]');
  const selectedSupplier = supplierSelect.value;
  supplierSelect.innerHTML = `<option value="">Select supplier</option>${supplierOptions}`;
  supplierSelect.value = selectedSupplier;

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

function renderFertilizer(state) {
  const supplierOptions = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => `<option value="${escapeAttribute(supplier.id)}">${escapeHtml(supplier.name)} (${escapeHtml(supplier.code)})</option>`)
    .join("");
  const supplierSelect = document.querySelector('#fertilizerForm select[name="supplierId"]');
  const selectedSupplier = supplierSelect.value;
  supplierSelect.innerHTML = `<option value="">Select supplier</option>${supplierOptions}`;
  supplierSelect.value = selectedSupplier;

  const pageRows = paginateList(
    "fertilizer",
    (state.fertilizerIssues || []).slice().sort((a, b) => compareNewestFirst(a, b, "updatedAt", "date")),
    "fertilizerTable"
  );
  document.querySelector("#fertilizerTable tbody").innerHTML = pageRows
    .map((issue) => {
      const supplier = state.suppliers.find((item) => item.id === issue.supplierId);
      const months = [issue.effectiveMonth1, issue.effectiveMonth2].filter(Boolean).join(", ");
      return `
      <tr>
        <td>${escapeHtml(supplier?.name || issue.supplierId)}</td>
        <td>${escapeHtml(issue.date)}</td>
        <td>${issue.kgGiven}</td>
        <td>${issue.totalAmount}</td>
        <td>${issue.splitMonths} month${Number(issue.splitMonths) === 1 ? "" : "s"}</td>
        <td>${escapeHtml(months)}</td>
      </tr>`;
    })
    .join("");
}

function renderTeaPackets(state) {
  const supplierOptions = state.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => `<option value="${escapeAttribute(supplier.id)}">${escapeHtml(supplier.name)} (${escapeHtml(supplier.code)})</option>`)
    .join("");
  const supplierSelect = document.querySelector('#teaPacketForm select[name="supplierId"]');
  const selectedSupplier = supplierSelect.value;
  supplierSelect.innerHTML = `<option value="">Select supplier</option>${supplierOptions}`;
  supplierSelect.value = selectedSupplier;

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
        <td>${packet.packetCount}</td>
        <td>${packet.perPacketPrice}</td>
        <td>${packet.totalAmount}</td>
        <td>${escapeHtml(packet.effectiveMonth)}</td>
      </tr>`;
    })
    .join("");
}

function updateTeaPacketTotal() {
  const form = document.querySelector("#teaPacketForm");
  const packetCount = Number(form.elements.packetCount.value);
  const perPacketPrice = Number(form.elements.perPacketPrice.value);
  if (Number.isFinite(packetCount) && Number.isFinite(perPacketPrice)) {
    form.elements.totalAmount.value = Math.round((packetCount * perPacketPrice + Number.EPSILON) * 100) / 100;
  }
}

function renderCollectionRecords(records = []) {
  const filtered = records
    .filter((record) => {
      const supplier = String(record.supplierName || "").toLowerCase();
      const line = String(record.lineName || "").toLowerCase();
      const postedBy = String(record.postedByOfficeUserName || "").toLowerCase();
      const collector = String(record.lineUserName || "").toLowerCase();
      return (
        supplier.includes(filters.recordSupplier) &&
        line.includes(filters.recordLine) &&
        postedBy.includes(filters.recordPostedBy) &&
        collector.includes(filters.recordCollector) &&
        (!filters.recordDateFrom || record.collectionDate >= filters.recordDateFrom) &&
        (!filters.recordDateTo || record.collectionDate <= filters.recordDateTo)
      );
    })
    .sort((a, b) => compareNewestFirst(a, b, "postedAt", "tabletSavedAt", "collectionDate"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / recordsPageSize));
  recordsPage = Math.min(recordsPage, pageCount);
  const start = (recordsPage - 1) * recordsPageSize;
  const pageRecords = filtered.slice(start, start + recordsPageSize);
  document.querySelector("#recordsTable tbody").innerHTML = pageRecords
    .map(
      (record) => `
      <tr>
        <td>${escapeHtml(record.tabletSavedAt || `${record.collectionDate} ${record.collectionTime || ""}`)}</td>
        <td>${escapeHtml(record.supplierName)}</td>
        <td>${escapeHtml(record.lineName || "")}</td>
        <td>${record.bagCount}</td>
        <td>${record.originalGrossWeightKg}</td>
        <td>${record.grossWeightKg}</td>
        <td>${record.netWeightKg}</td>
        <td>${escapeHtml(record.printStatus || "-")}</td>
        <td>${escapeHtml(record.tabletPrintedAt || "-")}</td>
        <td>${escapeHtml(record.lineUserName)}</td>
        <td>${escapeHtml(record.postedByOfficeUserName || "-")}</td>
        <td>${escapeHtml(formatDateTime(record.postedAt))}</td>
      </tr>`
    )
    .join("");
  const shownEnd = Math.min(start + pageRecords.length, filtered.length);
  document.querySelector("#recordsPageInfo").textContent = filtered.length
    ? `Showing ${start + 1}-${shownEnd} of ${filtered.length}`
    : "No records";
  document.querySelector("#recordsPrevPage").disabled = recordsPage <= 1;
  document.querySelector("#recordsNextPage").disabled = recordsPage >= pageCount;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function localMonthValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
        currentSupplierPriceOverride(supplier.id) ? `Special ${currentSupplierPriceOverride(supplier.id).teaPricePerKg}` : ""
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
    openEditModal("Edit Supplier", "Supplier master data", renderSupplierEditForm(supplier));
  }

  if (monthlySettingId) {
    const setting = latestState.monthlySettings.find((item) => item.id === monthlySettingId);
    populateMonthlySettingsForm(setting);
    showView("monthlySettingsView");
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
    fertilizerForm: "fertilizer",
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

function renderOfficeUserEditForm(user) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="office-user">
      <input name="id" type="hidden" value="${escapeAttribute(user.id)}" />
      <input name="role" type="hidden" value="${escapeAttribute(user.role)}" />
      <label>
        Username
        <input name="username" value="${escapeAttribute(user.username)}" required />
      </label>
      <label>
        Display name
        <input name="displayName" value="${escapeAttribute(user.displayName)}" required />
      </label>
      <label>
        New password
        <div class="password-field">
          <input id="editOfficeUserPassword" name="password" placeholder="Leave blank to keep current password" type="password" />
          <button class="password-toggle" type="button" data-toggle-password="editOfficeUserPassword" aria-controls="editOfficeUserPassword" aria-pressed="false">Show</button>
        </div>
      </label>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(user.active)} /> Active</label>
      <button type="submit">Update office user</button>
    </form>`;
}

function supplierOverrideFromForm(payload) {
  if (!payload.overrideTeaPricePerKg && !payload.overrideId) return null;
  if (!payload.overrideMonth || !payload.overrideSupplierId) return null;
  return {
    id: payload.overrideId || undefined,
    supplierId: payload.overrideSupplierId,
    month: payload.overrideMonth,
    teaPricePerKg: payload.overrideTeaPricePerKg
  };
}

function lineOverrideFromForm(payload) {
  if (!payload.overrideTeaPricePerKg) return null;
  if (!payload.overrideMonth || (!payload.overrideLineId && !payload.overrideLineName)) return null;
  return {
    lineId: payload.overrideLineId,
    lineName: payload.overrideLineName || payload.name,
    month: payload.overrideMonth,
    teaPricePerKg: payload.overrideTeaPricePerKg
  };
}

function escapeAttribute(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function checked(value) {
  return value ? "checked" : "";
}

function renderTeaLineEditForm(line) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="tea-line">
      <input name="id" type="hidden" value="${escapeAttribute(line.id)}" />
      <label>
        Line name
        <input name="name" value="${escapeAttribute(line.name)}" required />
      </label>
      <div class="check-list">
        <strong>Special price for suppliers in this tea line</strong>
        <input name="overrideLineId" type="hidden" value="${escapeAttribute(line.id)}" />
        <input name="overrideLineName" type="hidden" value="${escapeAttribute(line.name)}" />
        <label>
          Override month
          <input name="overrideMonth" type="month" value="${escapeAttribute(localMonthValue())}" />
        </label>
        <label>
          Special green leaf price per kg
          <input name="overrideTeaPricePerKg" type="number" step="0.01" min="0" placeholder="Leave blank to keep existing line prices" />
        </label>
      </div>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(line.active)} /> Active</label>
      <button type="submit">Update tea line</button>
    </form>`;
}

function renderLineUserEditForm(user) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="line-user">
      <input name="id" type="hidden" value="${escapeAttribute(user.id)}" />
      <label>
        Username
        <input name="username" value="${escapeAttribute(user.username)}" required />
      </label>
      <label>
        Display name
        <input name="displayName" value="${escapeAttribute(user.displayName)}" required />
      </label>
      <label>
        New password
        <div class="password-field">
          <input id="editLineUserPassword" name="password" placeholder="Leave blank to keep current password" type="password" />
          <button class="password-toggle" type="button" data-toggle-password="editLineUserPassword" aria-controls="editLineUserPassword" aria-pressed="false">Show</button>
        </div>
      </label>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(user.active)} /> Active</label>
      <button type="submit">Update line user</button>
    </form>`;
}

function renderSupplierEditForm(supplier) {
  const override = currentSupplierPriceOverride(supplier.id);
  return `
    <form id="editModalForm" class="modal-form" data-kind="supplier">
      <input name="id" type="hidden" value="${escapeAttribute(supplier.id)}" />
      <label>
        Supplier code
        <input name="code" value="${escapeAttribute(supplier.code)}" required />
      </label>
      <label>
        Supplier name
        <input name="name" value="${escapeAttribute(supplier.name)}" required />
      </label>
      <label>
        Tea line
        <input name="lineName" list="teaLineOptions" value="${escapeAttribute(supplier.lineName)}" required />
      </label>
      <div class="check-list">
        <label><input type="checkbox" name="deductionEnabled" ${checked(supplier.deductionEnabled)} /> 2% end-month deduction</label>
        <label><input type="checkbox" name="ownTransportAdditionEnabled" ${checked(supplier.ownTransportAdditionEnabled)} /> Own transport addition</label>
        <label><input type="checkbox" name="factoryTransportDeductionEnabled" ${checked(supplier.factoryTransportDeductionEnabled)} /> Factory transport deduction</label>
      </div>
      <div class="check-list">
        <strong>Special supplier price for a month</strong>
        <input name="overrideId" type="hidden" value="${escapeAttribute(override?.id || "")}" />
        <input name="overrideSupplierId" type="hidden" value="${escapeAttribute(supplier.id)}" />
        <label>
          Override month
          <input name="overrideMonth" type="month" value="${escapeAttribute(override?.month || localMonthValue())}" />
        </label>
        <label>
          Special green leaf price per kg
          <input name="overrideTeaPricePerKg" type="number" step="0.01" min="0" value="${escapeAttribute(override?.teaPricePerKg ?? "")}" placeholder="Leave blank to use monthly setting" />
        </label>
      </div>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(supplier.active)} /> Active</label>
      <button type="submit">Update supplier</button>
    </form>`;
}

function currentSupplierPriceOverride(supplierId) {
  return latestState?.supplierMonthOverrides.find(
    (override) => override.supplierId === supplierId && override.month === localMonthValue() && override.teaPricePerKg !== null
  );
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
  await saveForm(event.currentTarget, "/office/advances");
  populateAdvanceForm();
});

document.querySelector("#fertilizerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/fertilizer-issues");
  populateFertilizerForm();
});

document.querySelector("#teaPacketForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  updateTeaPacketTotal();
  await saveForm(event.currentTarget, "/office/tea-packets");
  populateTeaPacketForm();
});

document.querySelector('#fertilizerForm select[name="splitMonths"]').addEventListener("change", updateFertilizerMonthRequirement);
for (const selector of ['#teaPacketForm input[name="packetCount"]', '#teaPacketForm input[name="perPacketPrice"]']) {
  document.querySelector(selector).addEventListener("input", updateTeaPacketTotal);
}

document.querySelector("#suggestAdvance").addEventListener("click", async () => {
  const form = document.querySelector("#advanceForm");
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
  document.querySelector("#confirmPostAllMessage").textContent =
    `This will permanently post ${count} staged tablet record${count === 1 ? "" : "s"} using the net weights currently shown in the table.`;
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
  renderGreenLeafBook();
});

document.querySelector("#bookSupplierFilter").addEventListener("input", renderGreenLeafBook);

function renderGreenLeafBook() {
  const book = latestBook;
  if (!book) return;
  const supplierFilter = document.querySelector("#bookSupplierFilter").value.trim().toLowerCase();
  const poyaDays = poyaDaysForMonth(book.month);
  const dayHeaders = Array.from({ length: book.dayCount }, (_, index) => {
    const day = index + 1;
    return `<th class="${poyaDays.has(day) ? "poya-day" : ""}">${day}</th>`;
  }).join("");
  const rows = book.rows
    .filter((row) => String(row.supplierName || "").toLowerCase().includes(supplierFilter))
    .map(
      (row) => `
      <tr>
        <td>${row.rowNumber}</td>
        <td>${escapeHtml(row.supplierName)}</td>
        <td>${escapeHtml(row.lineName || "")}</td>
        ${row.dailyKg.map((value, index) => `<td class="${poyaDays.has(index + 1) ? "poya-day" : ""}">${value || ""}</td>`).join("")}
        <td>${row.totalKg}</td>
        <td class="deduction-value">${row.deductionKg}</td>
        <td class="addition-value">${row.finalKg}</td>
        <td class="addition-value">${row.ownTransportAddition}</td>
        <td class="advance-breakdown">${formatAdvanceDates(row)}</td>
        <td class="advance-breakdown deduction-value">${formatAdvanceAmounts(row)}</td>
        <td class="deduction-value">${row.totalAdvances}</td>
        <td class="deduction-value">${row.fertilizerDeduction}</td>
        <td class="deduction-value">${row.teaPacketDeduction}</td>
        <td class="deduction-value">${row.factoryTransportDeduction}</td>
        <td class="deduction-value">${row.arrearsCarriedForward}</td>
        <td class="addition-value">${row.pricePerKg}</td>
        <td class="addition-value">${row.totalAdditions ?? row.ownTransportAddition}</td>
        <td class="deduction-value">${row.totalDeductions}</td>
        <td class="balance-value">${row.balanceToPay}</td>
      </tr>`
    )
    .join("");
  document.querySelector("#bookTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th><th>Supplier</th><th>Line</th>${dayHeaders}
        <th>Total</th><th>2% Deduction</th><th>Final Kg</th><th>Transport Add</th>
        <th>Advance Date</th><th>Advance Amount</th><th>Total Advance</th><th>Fertilizer</th><th>Made Tea Packets</th><th>Transport Deduct</th><th>Arrears</th>
        <th>Price</th><th>Total Additions</th><th>Total Deductions</th><th>Balance</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>`;
}

function poyaDaysForMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = Date.UTC(year, monthNumber - 1, 1);
  const monthEnd = Date.UTC(year, monthNumber, 0, 23, 59, 59);
  const synodicMonthMs = 29.530588853 * 24 * 60 * 60 * 1000;
  const referenceFullMoonUtc = Date.UTC(2000, 0, 21, 4, 40);
  const firstCycle = Math.floor((monthStart - referenceFullMoonUtc) / synodicMonthMs) - 1;
  const days = new Set();

  for (let offset = 0; offset < 5; offset += 1) {
    const fullMoonUtc = referenceFullMoonUtc + (firstCycle + offset) * synodicMonthMs;
    if (fullMoonUtc < monthStart - synodicMonthMs || fullMoonUtc > monthEnd + synodicMonthMs) continue;
    const sriLankaDate = new Date(fullMoonUtc + 5.5 * 60 * 60 * 1000);
    const fullMoonYear = sriLankaDate.getUTCFullYear();
    const fullMoonMonth = sriLankaDate.getUTCMonth() + 1;
    if (fullMoonYear === year && fullMoonMonth === monthNumber) {
      days.add(sriLankaDate.getUTCDate());
    }
  }
  return days;
}

document.querySelector("#refreshPairingQr").addEventListener("click", refreshPairingQr);

document.querySelector("#bookMonth").value = localMonthValue();
populateMonthlySettingsForm();
populateAdvanceForm();
populateFertilizerForm();
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
  form.elements.effectiveMonth.value = localMonthValue();
  form.elements.date.value = localDateValue();
  document.querySelector("#advanceSuggestionMessage").textContent = "";
}

function populateFertilizerForm() {
  const form = document.querySelector("#fertilizerForm");
  form.elements.id.value = "";
  form.elements.date.value = localDateValue();
  form.elements.splitMonths.value = "1";
  form.elements.effectiveMonth1.value = localMonthValue();
  form.elements.effectiveMonth2.value = "";
  updateFertilizerMonthRequirement();
}

function updateFertilizerMonthRequirement() {
  const form = document.querySelector("#fertilizerForm");
  const needsSecondMonth = form.elements.splitMonths.value === "2";
  form.elements.effectiveMonth2.required = needsSecondMonth;
  form.elements.effectiveMonth2.disabled = !needsSecondMonth;
  if (!needsSecondMonth) form.elements.effectiveMonth2.value = "";
}

function populateTeaPacketForm() {
  const form = document.querySelector("#teaPacketForm");
  form.elements.id.value = "";
  form.elements.date.value = localDateValue();
  form.elements.effectiveMonth.value = localMonthValue();
  form.elements.totalAmount.value = "";
}

function formatAdvanceDates(row) {
  const payments = row.advancePayments || [];
  if (!payments.length) return "";
  return payments.map((advance) => `<span>${escapeHtml(advance.date)}</span>`).join("");
}

function formatAdvanceAmounts(row) {
  const payments = row.advancePayments || [];
  if (!payments.length) return "";
  return payments.map((advance) => `<span>${advance.amount}</span>`).join("");
}
