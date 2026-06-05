let apiUrl = "http://localhost:8080";
let token = "";
let currentUser = null;

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  apiUrl = form.get("apiUrl");
  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: form.get("username"),
      password: form.get("password")
    })
  });
  token = login.token;
  currentUser = login.user;
  document.querySelector("#session").textContent = `${currentUser.displayName} (${currentUser.role})`;
  document.querySelector("#bookPanel").classList.remove("hidden");
  document.querySelector("#adminPanel").classList.toggle("hidden", currentUser.role !== "super_admin");
});

document.querySelector("#directorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await request("/admin/directors", {
    method: "POST",
    body: JSON.stringify({
      displayName: form.get("displayName"),
      username: form.get("username"),
      password: form.get("password")
    })
  });
  event.currentTarget.reset();
});

document.querySelector("#loadBook").addEventListener("click", async () => {
  const month = document.querySelector("#month").value;
  const book = await request(`/green-leaf-book?month=${month}`);
  const dayHeaders = Array.from({ length: book.dayCount }, (_, index) => `<th>${index + 1}</th>`).join("");
  document.querySelector("#book").innerHTML = `
    <thead>
      <tr>
        <th>No</th><th>Supplier</th><th>Line</th>${dayHeaders}
        <th>Total</th><th>Deduct Kg</th><th>Final Kg</th><th>Transport Add</th>
        <th>Advances</th><th>Fertilizer</th><th>Transport Deduct</th><th>Arrears</th>
        <th>Price</th><th>Total Deductions</th><th>Balance</th>
      </tr>
    </thead>
    <tbody>
      ${book.rows
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
        .join("")}
    </tbody>
  `;
});

document.querySelector("#month").value = new Date().toISOString().slice(0, 7);
