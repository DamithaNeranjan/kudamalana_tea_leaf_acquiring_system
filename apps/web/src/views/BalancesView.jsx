import { useEffect, useMemo, useState } from "react";
import { request } from "../api/client.js";

function previousMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthOptions() {
  const base = new Date();
  base.setDate(1);
  const options = [];
  for (let offset = -24; offset <= 2; offset += 1) {
    const date = new Date(base);
    date.setMonth(base.getMonth() + offset);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      value,
      label: date.toLocaleString("en-US", { month: "long", year: "numeric" })
    });
  }
  return options.reverse();
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseAmount(value) {
  return String(value || "").replace(/,/g, "");
}

function formatAmountInput(value) {
  const clean = parseAmount(value).replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = clean.split(".");
  const integer = integerPart ? Number(integerPart).toLocaleString("en-US") : "";
  const decimal = decimalParts.length ? `.${decimalParts.join("").slice(0, 2)}` : "";
  return `${integer}${decimal}`;
}

function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function PaidSignalCell({ signal }) {
  if (!signal) return <span className="muted-text">Not marked</span>;
  return (
    <div className="signal-cell">
      <span className="status-pill active">Paid signal</span>
      <small>{signal.comment || "No comment"}</small>
      <small>{signal.markedByDisplayName || ""}</small>
    </div>
  );
}

function MarkPaidForm({ row, section, canManage, onSubmit }) {
  const [comment, setComment] = useState("");
  if (!canManage) return null;
  return (
    <form
      className="inline-signal-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(row, section, comment);
        setComment("");
      }}
    >
      <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional comment" />
      <button type="submit">Mark paid</button>
    </form>
  );
}

export function BalancesView({ currentUser, showToast }) {
  const [month, setMonth] = useState(previousMonth);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false);
  const [factoryAmount, setFactoryAmount] = useState("");
  const [factoryComment, setFactoryComment] = useState("");
  const canManage = ["super_admin", "director"].includes(currentUser?.role);
  const months = useMemo(monthOptions, []);

  async function loadBalances(nextMonth = month) {
    setLoading(true);
    try {
      setBalances(await request(`/balances?month=${nextMonth}`));
    } finally {
      setLoading(false);
    }
  }

  async function markPaid(row, section, comment) {
    await request("/balances/mark-paid", {
      method: "POST",
      body: JSON.stringify({
        month,
        section,
        targetId: section === "line" ? row.lineId || row.lineName : row.supplierId,
        targetLabel: section === "line" ? row.lineName : row.supplierName,
        amount: row.positiveBalance,
        comment
      })
    });
    showToast("Paid signal saved.");
    await loadBalances();
  }

  async function addFactoryPayment(event) {
    event.preventDefault();
    await request("/balances/factory-officer-payments", {
      method: "POST",
      body: JSON.stringify({ month, amount: parseAmount(factoryAmount), comment: factoryComment })
    });
    setFactoryAmount("");
    setFactoryComment("");
    showToast("Factory officer transfer signal added.");
    await loadBalances();
  }

  useEffect(() => {
    loadBalances();
  }, []);

  return (
    <section className="view active-view balances-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Director signals</span>
          <h2>Balances</h2>
          <p>Review bank transfer totals and payment signals for the selected effective month.</p>
        </div>
      </div>

      <section className="panel balances-toolbar">
        <label>
          Effective month
          <select
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              loadBalances(event.target.value);
            }}
          >
            {months.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadBalances()} disabled={loading}>
          {loading ? "Loading..." : "Load balances"}
        </button>
      </section>

      <section className="panel balance-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Line wise bank transfers</span>
            <h3>Whole Tea Line Bank Transfer Lines</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Line</th><th>Suppliers</th><th>Positive balance</th><th>Signal</th><th>Marked at</th><th>Action</th></tr>
            </thead>
            <tbody>
              {(balances?.lineWiseBankTransfers || []).map((row) => (
                <tr key={row.lineId || row.lineName}>
                  <td>{row.lineName}</td>
                  <td>{row.supplierCount}</td>
                  <td>{money(row.positiveBalance)}</td>
                  <td><PaidSignalCell signal={row.signal} /></td>
                  <td>{dateTime(row.signal?.markedAt)}</td>
                  <td><MarkPaidForm row={row} section="line" canManage={canManage} onSubmit={markPaid} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel balance-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Supplier wise bank transfers</span>
            <h3>Bank Transfer Suppliers</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Supplier</th><th>Line</th><th>Balance</th><th>Signal</th><th>Marked at</th><th>Action</th></tr>
            </thead>
            <tbody>
              {(balances?.supplierWiseBankTransfers || []).map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.supplierCode}</td>
                  <td>{row.supplierName}</td>
                  <td>{row.lineName}</td>
                  <td>{money(row.positiveBalance)}</td>
                  <td><PaidSignalCell signal={row.signal} /></td>
                  <td>{dateTime(row.signal?.markedAt)}</td>
                  <td><MarkPaidForm row={row} section="supplier" canManage={canManage} onSubmit={markPaid} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel balance-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Bank transfers to factory officer</span>
            <h3>Cash Suppliers Outside Whole-Line Transfers</h3>
          </div>
        </div>
        <div className="balance-totals">
          <strong>Positive: Rs. {money(balances?.factoryOfficerTransfers?.positiveBalance)}</strong>
          <strong>Negative: Rs. {money(balances?.factoryOfficerTransfers?.negativeBalance)}</strong>
          <strong>Remaining: Rs. {money(balances?.factoryOfficerTransfers?.remainingPositiveBalance)}</strong>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Supplier</th><th>Line</th><th>Balance</th></tr>
            </thead>
            <tbody>
              {(balances?.factoryOfficerTransfers?.suppliers || []).map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.supplierCode}</td>
                  <td>{row.supplierName}</td>
                  <td>{row.lineName}</td>
                  <td>{money(row.balanceToPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <form className="factory-payment-form" onSubmit={addFactoryPayment}>
            <input
              type="text"
              inputMode="decimal"
              value={factoryAmount}
              onChange={(event) => setFactoryAmount(formatAmountInput(event.target.value))}
              placeholder="Amount paid"
              required
            />
            <input value={factoryComment} onChange={(event) => setFactoryComment(event.target.value)} placeholder="Optional comment" />
            <button type="submit">Add payment row</button>
          </form>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Amount</th><th>Comment</th><th>Added at</th><th>Added by</th><th>Remaining positive balance</th></tr>
            </thead>
            <tbody>
              {(balances?.factoryOfficerTransfers?.payments || []).map((payment) => (
                <tr key={payment.id}>
                  <td>{money(payment.amount)}</td>
                  <td>{payment.comment || ""}</td>
                  <td>{dateTime(payment.markedAt)}</td>
                  <td>{payment.markedByDisplayName || ""}</td>
                  <td>{money(payment.remainingPositiveBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
