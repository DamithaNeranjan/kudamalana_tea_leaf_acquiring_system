import { useEffect, useMemo, useState } from "react";
import { request } from "../api/client.js";
import {
  formatAmountInput,
  formatCurrency,
  parseAmountInput,
  parseDateTime
} from "../../../../packages/shared/src/format.mjs";
import { filterBalanceSignalRows, filterFactoryPaymentRows, paginateWebRows } from "../utils/signalLogic.js";

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

function dateTime(value) {
  if (!value) return "";
  const date = parseDateTime(value);
  return (
    <span className="date-time-stack">
      <span>{date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit"
      })}</span>
      <span>{date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
      })}</span>
    </span>
  );
}

function PaidSignalCell({ signal }) {
  if (!signal) return <span className="muted-text">Not marked</span>;
  return (
    <div className="signal-cell">
      <span className="status-pill active">Paid signal</span>
      <small>{signal.markedByDisplayName || ""}</small>
    </div>
  );
}

function ReadStatusCell({ signal }) {
  if (!signal) return <span className="muted-text">-</span>;
  if (!signal.readAt) return <span className="status-pill active">Unread</span>;
  return (
    <div className="signal-cell">
      <span className="status-pill inactive">Read</span>
      <small>{dateTime(signal.readAt)}</small>
      <small>{signal.readByDisplayName || ""}</small>
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

function paginate(rows, page) {
  return paginateWebRows(rows, page);
}

function Pager({ page, totalPages, totalRows, label, onPage }) {
  return (
    <div className="pagination-bar">
      <span>{totalRows ? `Page ${page} of ${totalPages} (${totalRows} ${label})` : `No ${label}`}</span>
      <div className="pagination-actions">
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>Previous</button>
        <button type="button" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
  );
}

export function BalancesView({ currentUser, showToast }) {
  const [month, setMonth] = useState(previousMonth);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false);
  const [factoryAmount, setFactoryAmount] = useState("");
  const [factoryComment, setFactoryComment] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [factorySupplierFilter, setFactorySupplierFilter] = useState("");
  const [factoryPaymentFilter, setFactoryPaymentFilter] = useState("");
  const [showRead, setShowRead] = useState(true);
  const [linePage, setLinePage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);
  const [factorySupplierPage, setFactorySupplierPage] = useState(1);
  const [factoryPaymentPage, setFactoryPaymentPage] = useState(1);
  const canManage = ["super_admin", "director"].includes(currentUser?.role);
  const canMarkRead = ["super_admin", "office_user"].includes(currentUser?.role);
  const months = useMemo(monthOptions, []);

  const lineRows = useMemo(
    () => filterBalanceSignalRows(balances?.lineWiseBankTransfers || [], lineFilter, ["lineName"], { canManage, showRead }),
    [balances, canManage, lineFilter, showRead]
  );
  const supplierRows = useMemo(
    () =>
      filterBalanceSignalRows(balances?.supplierWiseBankTransfers || [], supplierFilter, ["supplierCode", "supplierName", "lineName"], {
        canManage,
        showRead
      }),
    [balances, canManage, showRead, supplierFilter]
  );
  const factorySupplierRows = useMemo(() => {
    const needle = factorySupplierFilter.trim().toLowerCase();
    return (balances?.factoryOfficerTransfers?.suppliers || []).filter((row) =>
      ["supplierCode", "supplierName", "lineName"].some((field) => String(row[field] || "").toLowerCase().includes(needle))
    );
  }, [balances, factorySupplierFilter]);
  const factoryPaymentRows = useMemo(() => {
    const needle = factoryPaymentFilter.trim().toLowerCase();
    return filterFactoryPaymentRows(balances?.factoryOfficerTransfers?.payments || [], needle, showRead);
  }, [balances, factoryPaymentFilter, showRead]);
  const pagedLines = useMemo(() => paginate(lineRows, linePage), [linePage, lineRows]);
  const pagedSuppliers = useMemo(() => paginate(supplierRows, supplierPage), [supplierPage, supplierRows]);
  const pagedFactorySuppliers = useMemo(() => paginate(factorySupplierRows, factorySupplierPage), [factorySupplierPage, factorySupplierRows]);
  const pagedFactoryPayments = useMemo(() => paginate(factoryPaymentRows, factoryPaymentPage), [factoryPaymentPage, factoryPaymentRows]);

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
      body: JSON.stringify({ month, amount: parseAmountInput(factoryAmount), comment: factoryComment })
    });
    setFactoryAmount("");
    setFactoryComment("");
    showToast("Factory officer transfer signal added.");
    await loadBalances();
  }

  async function markRead(type, signal) {
    await request("/signals/mark-read", {
      method: "POST",
      body: JSON.stringify({ type, id: signal.id })
    });
    showToast("Signal marked as read.");
    await loadBalances();
  }

  useEffect(() => {
    loadBalances();
  }, []);

  useEffect(() => {
    setLinePage(1);
    setSupplierPage(1);
    setFactorySupplierPage(1);
    setFactoryPaymentPage(1);
  }, [lineFilter, supplierFilter, factorySupplierFilter, factoryPaymentFilter, showRead, month]);

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
        <label className="switch-row compact-switch">
          <input type="checkbox" checked={showRead} onChange={(event) => setShowRead(event.target.checked)} />
          Show read signals
        </label>
      </section>

      <details className="panel balance-section">
        <summary className="collapsible-heading">
          <div>
            <span className="eyebrow">Line wise bank transfers</span>
            <h3>Whole Tea Line Bank Transfer Lines</h3>
          </div>
        </summary>
        <div className="toolbar">
          <input placeholder="Filter line" value={lineFilter} onChange={(event) => setLineFilter(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Line</th><th>Suppliers</th><th>Positive balance</th><th>Signal</th><th>Comment</th><th>Marked at</th><th>Read status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pagedLines.rows.map((row) => (
                <tr key={row.lineId || row.lineName}>
                  <td>{row.lineName}</td>
                  <td>{row.supplierCount}</td>
                  <td>{formatCurrency(row.positiveBalance)}</td>
                  <td><PaidSignalCell signal={row.signal} /></td>
                  <td>{row.signal?.comment || "-"}</td>
                  <td>{dateTime(row.signal?.markedAt)}</td>
                  <td><ReadStatusCell signal={row.signal} /></td>
                  <td>
                    <MarkPaidForm row={row} section="line" canManage={canManage} onSubmit={markPaid} />
                    {canMarkRead && row.signal && !row.signal.readAt && (
                      <button type="button" onClick={() => markRead("balance", row.signal)}>Mark read</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={pagedLines.page} totalPages={pagedLines.totalPages} totalRows={lineRows.length} label="rows" onPage={setLinePage} />
      </details>

      <details className="panel balance-section">
        <summary className="collapsible-heading">
          <div>
            <span className="eyebrow">Supplier wise bank transfers</span>
            <h3>Bank Transfer Suppliers</h3>
          </div>
        </summary>
        <div className="toolbar">
          <input placeholder="Filter supplier, code, or line" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Supplier</th><th>Line</th><th>Balance</th><th>Signal</th><th>Comment</th><th>Marked at</th><th>Read status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pagedSuppliers.rows.map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.supplierCode}</td>
                  <td>{row.supplierName}</td>
                  <td>{row.lineName}</td>
                  <td>{formatCurrency(row.positiveBalance)}</td>
                  <td><PaidSignalCell signal={row.signal} /></td>
                  <td>{row.signal?.comment || "-"}</td>
                  <td>{dateTime(row.signal?.markedAt)}</td>
                  <td><ReadStatusCell signal={row.signal} /></td>
                  <td>
                    <MarkPaidForm row={row} section="supplier" canManage={canManage} onSubmit={markPaid} />
                    {canMarkRead && row.signal && !row.signal.readAt && (
                      <button type="button" onClick={() => markRead("balance", row.signal)}>Mark read</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={pagedSuppliers.page} totalPages={pagedSuppliers.totalPages} totalRows={supplierRows.length} label="rows" onPage={setSupplierPage} />
      </details>

      <details className="panel balance-section">
        <summary className="collapsible-heading">
          <div>
            <span className="eyebrow">Bank transfers to factory officer</span>
            <h3>Cash Suppliers Outside Whole-Line Transfers</h3>
          </div>
        </summary>
        <div className="balance-totals">
          <strong>Positive: Rs. {formatCurrency(balances?.factoryOfficerTransfers?.positiveBalance)}</strong>
          <strong>Negative: Rs. {formatCurrency(balances?.factoryOfficerTransfers?.negativeBalance)}</strong>
          <strong>Remaining: Rs. {formatCurrency(balances?.factoryOfficerTransfers?.remainingPositiveBalance)}</strong>
        </div>
        <div className="toolbar">
          <input placeholder="Filter cash supplier, code, or line" value={factorySupplierFilter} onChange={(event) => setFactorySupplierFilter(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Supplier</th><th>Line</th><th>Balance</th></tr>
            </thead>
            <tbody>
              {pagedFactorySuppliers.rows.map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.supplierCode}</td>
                  <td>{row.supplierName}</td>
                  <td>{row.lineName}</td>
                  <td>{formatCurrency(row.balanceToPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={pagedFactorySuppliers.page} totalPages={pagedFactorySuppliers.totalPages} totalRows={factorySupplierRows.length} label="suppliers" onPage={setFactorySupplierPage} />

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

        <div className="toolbar">
          <input placeholder="Filter payment comment or user" value={factoryPaymentFilter} onChange={(event) => setFactoryPaymentFilter(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Amount</th><th>Comment</th><th>Added at</th><th>Added by</th><th>Remaining positive balance</th><th>Read status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pagedFactoryPayments.rows.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.comment || "-"}</td>
                  <td>{dateTime(payment.markedAt)}</td>
                  <td>{payment.markedByDisplayName || ""}</td>
                  <td>{formatCurrency(payment.remainingPositiveBalance)}</td>
                  <td><ReadStatusCell signal={payment} /></td>
                  <td>
                    {canMarkRead && !payment.readAt ? (
                      <button type="button" onClick={() => markRead("factory", payment)}>Mark read</button>
                    ) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={pagedFactoryPayments.page} totalPages={pagedFactoryPayments.totalPages} totalRows={factoryPaymentRows.length} label="signals" onPage={setFactoryPaymentPage} />
      </details>
    </section>
  );
}
