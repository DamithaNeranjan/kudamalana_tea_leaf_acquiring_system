const apiBaseUrl = window.teaDesktop?.apiBaseUrl || "http://127.0.0.1:7070";

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function formJson(form) {
  const data = new FormData(form);
  const result = Object.fromEntries(data.entries());
  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    result[checkbox.name] = checkbox.checked;
  }
  result.active = true;
  return result;
}

async function refreshState() {
  const state = await api("/office/state");
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

async function saveForm(form, path) {
  await api(path, { method: "POST", body: JSON.stringify(formJson(form)) });
  form.reset();
  await refreshState();
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

document.querySelector("#stagingTable").addEventListener("click", async (event) => {
  const id = event.target.dataset.post;
  if (!id) return;
  const netWeightKg = Number(document.querySelector(`[data-net="${id}"]`).value);
  await api(`/office/staging/${id}`, { method: "PUT", body: JSON.stringify({ netWeightKg }) });
  await api(`/office/staging/${id}/post`, { method: "POST" });
  await refreshState();
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

document.querySelector("#bookMonth").value = new Date().toISOString().slice(0, 7);
api("/health")
  .then(() => (document.querySelector("#syncStatus").textContent = "Sync server: running on port 7070"))
  .catch(() => (document.querySelector("#syncStatus").textContent = "Sync server: unavailable"));
refreshState();
