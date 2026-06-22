const apiBaseUrl = window.teaDesktop?.apiBaseUrl || "http://127.0.0.1:7070";
let officeToken = "";
let officeUser = null;
let latestState = null;
const filters = {
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
  document.querySelector("#logoutButton").classList.remove("hidden");
  document.querySelector('#profileForm input[name="displayName"]').value = officeUser.displayName;
  document.querySelector("#loginView").classList.add("hidden");
  document.querySelector("#appView").classList.remove("hidden");
  showView("dashboardView");
}

function clearSession() {
  officeToken = "";
  officeUser = null;
  document.querySelector("#sessionStatus").textContent = "Not logged in";
  document.querySelector("#logoutButton").classList.add("hidden");
  document.querySelector("#appView").classList.add("hidden");
  document.querySelector("#loginView").classList.remove("hidden");
  document.querySelector("#bookTable").innerHTML = "";
  document.querySelector("#stagingTable tbody").innerHTML = "";
  document.querySelector("#recordsTable tbody").innerHTML = "";
  document.querySelector("#profileForm").reset();
  showView("dashboardView");
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.querySelector("#toastHost").appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
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
    document.querySelector(`#${clearFormId} input[name="id"]`).value = "";
  }
});

for (const [selector, key] of [
  ["#teaLineFilter", "teaLineName"],
  ["#lineUserFilter", "lineUserName"],
  ["#supplierNameFilter", "supplierName"],
  ["#supplierLineFilter", "supplierLine"]
]) {
  document.querySelector(selector).addEventListener("input", (event) => {
    filters[key] = event.target.value.trim().toLowerCase();
    if (latestState) renderRegistrationTables(latestState);
  });
}

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
  renderRegistrationTables(state);
  renderCollectionRecords(state.collectionEntries);
  document.querySelector("#stagingTable tbody").innerHTML = state.collectionStaging
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
    .sort((a, b) => `${b.collectionDate} ${b.collectionTime || ""}`.localeCompare(`${a.collectionDate} ${a.collectionTime || ""}`));
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

  document.querySelector("#teaLinesTable tbody").innerHTML = state.teaLines
    .filter((line) => line.name.toLowerCase().includes(filters.teaLineName))
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

  document.querySelector("#lineUsersTable tbody").innerHTML = state.lineUsers
    .filter((user) => user.displayName.toLowerCase().includes(filters.lineUserName))
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

  document.querySelector("#suppliersTable tbody").innerHTML = state.suppliers
    .filter((supplier) => supplier.name.toLowerCase().includes(filters.supplierName))
    .filter((supplier) => supplier.lineName.toLowerCase().includes(filters.supplierLine))
    .map((supplier) => {
      const flags = [
        supplier.deductionEnabled ? "2% deduct" : "",
        supplier.ownTransportAdditionEnabled ? "Own transport" : "",
        supplier.factoryTransportDeductionEnabled ? "Factory transport" : ""
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
}

document.addEventListener("click", (event) => {
  if (!latestState) return;
  const lineId = event.target.dataset.editLine;
  const lineUserId = event.target.dataset.editLineUser;
  const supplierId = event.target.dataset.editSupplier;
  const toggleLineId = event.target.dataset.toggleLine;
  const toggleLineUserId = event.target.dataset.toggleLineUser;
  const toggleSupplierId = event.target.dataset.toggleSupplier;

  if (lineId) {
    const line = latestState.teaLines.find((item) => item.id === lineId);
    openEditModal("Edit Tea Line", "Field route", renderTeaLineEditForm(line));
  }

  if (lineUserId) {
    const user = latestState.lineUsers.find((item) => item.id === lineUserId);
    openEditModal("Edit Line User", "Tablet access", renderLineUserEditForm(user));
  }

  if (supplierId) {
    const supplier = latestState.suppliers.find((item) => item.id === supplierId);
    openEditModal("Edit Supplier", "Supplier master data", renderSupplierEditForm(supplier));
  }

  if (toggleLineId) toggleActive("teaLines", toggleLineId, "/office/tea-lines", "Tea line");
  if (toggleLineUserId) toggleActive("lineUsers", toggleLineUserId, "/office/line-users", "Line user");
  if (toggleSupplierId) toggleActive("suppliers", toggleSupplierId, "/office/suppliers", "Supplier");
});

async function saveForm(form, path) {
  if (form.id === "supplierForm" && !validateSupplierTeaLine(form)) return;
  await api(path, { method: "POST", body: JSON.stringify(formJson(form)) });
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
  await api(path, { method: "POST", body: JSON.stringify(formJson(form)) });
  closeEditModal();
  await refreshState();
  showToast(`${label} updated successfully.`);
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
      <label class="switch-row"><input name="active" type="checkbox" ${checked(supplier.active)} /> Active</label>
      <button type="submit">Update supplier</button>
    </form>`;
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

document.querySelector("#lineUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/line-users");
});

document.querySelector("#supplierForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveForm(event.currentTarget, "/office/suppliers");
});

document.querySelector("#closeEditModal").addEventListener("click", closeEditModal);
document.querySelector("#editModal").addEventListener("click", (event) => {
  if (event.target.id === "editModal") closeEditModal();
});

document.querySelector("#editModalBody").addEventListener("submit", async (event) => {
  event.preventDefault();
  const kind = event.target.dataset.kind;
  if (kind === "tea-line") await updateFromModal(event.target, "/office/tea-lines", "Tea line");
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
  const book = await api(`/office/green-leaf-book?month=${month}`);
  const dayHeaders = Array.from({ length: book.dayCount }, (_, index) => `<th>${index + 1}</th>`).join("");
  const rows = book.rows
    .map(
      (row) => `
      <tr>
        <td>${row.rowNumber}</td>
        <td>${row.supplierName}</td>
        <td>${row.lineName || ""}</td>
        ${row.dailyKg.map((value) => `<td>${value || ""}</td>`).join("")}
        <td>${row.totalKg}</td>
        <td>${row.deductionKg}</td>
        <td>${row.finalKg}</td>
        <td>${row.ownTransportAddition}</td>
        <td>${row.totalAdvances}</td>
        <td>${row.fertilizerDeduction}</td>
        <td>${row.factoryTransportDeduction}</td>
        <td>${row.arrearsCarriedForward}</td>
        <td>${row.pricePerKg}</td>
        <td>${row.totalDeductions}</td>
        <td>${row.balanceToPay}</td>
      </tr>`
    )
    .join("");
  document.querySelector("#bookTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th><th>Supplier</th><th>Line</th>${dayHeaders}
        <th>Total</th><th>Deduct Kg</th><th>Final Kg</th><th>Transport Add</th>
        <th>Advances</th><th>Fertilizer</th><th>Transport Deduct</th><th>Arrears</th>
        <th>Price</th><th>Total Deductions</th><th>Balance</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>`;
});

document.querySelector("#refreshPairingQr").addEventListener("click", refreshPairingQr);

document.querySelector("#bookMonth").value = localMonthValue();
