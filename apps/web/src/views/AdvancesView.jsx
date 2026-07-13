import { useEffect, useMemo, useState } from "react";
import { request } from "../api/client.js";

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function parseDateTime(value) {
  if (!value) return "";
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return new Date(normalized);
}

function targetLabel(scope, target) {
  if (!target) return "";
  return scope === "line" ? target.name : `${target.code || ""} - ${target.name || ""}`.trim();
}

const PAGE_SIZE = 10;

function paginate(rows, page) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    rows: rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    page: safePage,
    totalPages
  };
}

export function AdvancesView({ currentUser, showToast }) {
  const [data, setData] = useState({ suppliers: [], teaLines: [], signals: [] });
  const [scope, setScope] = useState("supplier");
  const [targetText, setTargetText] = useState("");
  const [effectiveMonth, setEffectiveMonth] = useState(currentMonth);
  const [dateGiven, setDateGiven] = useState(currentDate);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showRead, setShowRead] = useState(true);
  const [signalsPage, setSignalsPage] = useState(1);
  const canManage = ["super_admin", "director"].includes(currentUser?.role);
  const canMarkRead = ["super_admin", "office_user"].includes(currentUser?.role);

  const targets = scope === "line" ? data.teaLines : data.suppliers;
  const selectedTarget = useMemo(
    () => targets.find((target) => targetLabel(scope, target) === targetText || target.id === targetText),
    [scope, targetText, targets]
  );
  const visibleSignals = useMemo(() => {
    const supplierText = supplierFilter.trim().toLowerCase();
  return data.signals
      .filter((signal) => String(signal.targetLabel || "").toLowerCase().includes(supplierText))
      .filter((signal) => !monthFilter || signal.effectiveMonth === monthFilter)
      .filter((signal) => !typeFilter || signal.scope === typeFilter)
      .filter((signal) => showRead || !signal.readAt)
      .sort((a, b) => parseDateTime(b.markedAt) - parseDateTime(a.markedAt));
  }, [data.signals, monthFilter, showRead, supplierFilter, typeFilter]);
  const pagedSignals = useMemo(() => paginate(visibleSignals, signalsPage), [signalsPage, visibleSignals]);

  async function markRead(signal) {
    await request("/signals/mark-read", {
      method: "POST",
      body: JSON.stringify({ type: "advance", id: signal.id })
    });
    showToast("Signal marked as read.");
    await loadSignals();
  }

  async function loadSignals() {
    setData(await request("/advance-signals"));
  }

  async function loadSuggestion() {
    if (!selectedTarget?.id || !effectiveMonth) {
      setSuggestion(null);
      return;
    }
    const payload = await request(
      `/advance-signals/suggestion?scope=${encodeURIComponent(scope)}&targetId=${encodeURIComponent(selectedTarget.id)}&month=${encodeURIComponent(effectiveMonth)}`
    );
    setSuggestion(payload);
    if (!amount) setAmount(formatAmountInput(payload.suggestedAmount || ""));
  }

  async function submitSignal(event) {
    event.preventDefault();
    if (!selectedTarget?.id) {
      showToast("Select a supplier or line.", "error");
      return;
    }
    await request("/advance-signals", {
      method: "POST",
      body: JSON.stringify({
        scope,
        targetId: selectedTarget.id,
        effectiveMonth,
        dateGiven,
        amount: parseAmount(amount),
        comment
      })
    });
    setAmount("");
    setComment("");
    showToast("Advance signal saved.");
    await loadSignals();
    await loadSuggestion();
  }

  useEffect(() => {
    loadSignals();
  }, []);

  useEffect(() => {
    setTargetText("");
    setSuggestion(null);
    setAmount("");
  }, [scope]);

  useEffect(() => {
    loadSuggestion();
  }, [selectedTarget?.id, effectiveMonth, scope]);

  useEffect(() => {
    setSignalsPage(1);
  }, [supplierFilter, monthFilter, typeFilter, showRead]);

  return (
    <section className="view active-view advances-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Director signals</span>
          <h2>Advances</h2>
          <p>Signal supplier or line advances for the office team to record manually in the desktop app.</p>
        </div>
      </div>

      {canManage && (
        <section className="panel advance-signal-panel">
          <form className="advance-signal-form" onSubmit={submitSignal}>
            <label>
              Advance type
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="supplier">Supplier advance</option>
                <option value="line">Line advance</option>
              </select>
            </label>
            <label>
              {scope === "line" ? "Tea line" : "Supplier"}
              <input
                list="advanceTargetOptions"
                value={targetText}
                onChange={(event) => setTargetText(event.target.value)}
                placeholder={scope === "line" ? "Filter line" : "Filter supplier"}
                required
              />
            </label>
            <datalist id="advanceTargetOptions">
              {targets.map((target) => (
                <option key={target.id} value={targetLabel(scope, target)} />
              ))}
            </datalist>
            <label>
              Effective month
              <input type="month" value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} required />
            </label>
            <label>
              Date given
              <input type="date" value={dateGiven} onChange={(event) => setDateGiven(event.target.value)} required />
            </label>
            <label>
              Amount given
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(formatAmountInput(event.target.value))}
                required
              />
            </label>
            <label>
              Comment
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional comment" />
            </label>
            <button type="submit">Save signal</button>
          </form>

          <div className="advance-suggestion">
            <strong>Suggested amount: Rs. {money(suggestion?.suggestedAmount)}</strong>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Supplier</th><th>Line</th><th>Leaf value</th><th>Arrears</th><th>Existing advances</th><th>Suggested</th></tr>
                </thead>
                <tbody>
                  {(suggestion?.breakdown || []).map((item) => (
                    <tr key={item.supplierId}>
                      <td>{item.supplierCode} - {item.supplierName}</td>
                      <td>{item.lineName}</td>
                      <td>{money(item.leafValue)}</td>
                      <td>{money(item.arrearsCarriedForward)}</td>
                      <td>{money(item.totalAdvances)}</td>
                      <td>{money(item.suggestedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="panel balance-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Advance signals</span>
            <h3>Latest Signals</h3>
          </div>
        </div>
        <div className="toolbar">
          <input placeholder="Filter supplier or line" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} />
          <input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            <option value="supplier">Supplier</option>
            <option value="line">Line</option>
          </select>
          <label className="switch-row compact-switch">
            <input type="checkbox" checked={showRead} onChange={(event) => setShowRead(event.target.checked)} />
            Show read signals
          </label>
          <button type="button" onClick={loadSignals}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th><th>Supplier / Line</th><th>Effective month</th><th>Date given</th>
                <th>Suggested</th><th>Amount</th><th>Comment</th><th>Signalled at</th><th>By</th><th>Read status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedSignals.rows.map((signal) => (
                <tr key={signal.id}>
                  <td>{signal.scope === "line" ? "Line" : "Supplier"}</td>
                  <td>{signal.targetLabel}</td>
                  <td>{signal.effectiveMonth}</td>
                  <td>{signal.dateGiven}</td>
                  <td>{money(signal.suggestedAmount)}</td>
                  <td>{money(signal.amount)}</td>
                  <td>{signal.comment || "-"}</td>
                  <td>{dateTime(signal.markedAt)}</td>
                  <td>{signal.markedByDisplayName || ""}</td>
                  <td>
                    {signal.readAt ? (
                      <div className="signal-cell">
                        <span className="status-pill inactive">Read</span>
                        <small>{dateTime(signal.readAt)}</small>
                        <small>{signal.readByDisplayName || ""}</small>
                      </div>
                    ) : (
                      <span className="status-pill active">Unread</span>
                    )}
                  </td>
                  <td>
                    {canMarkRead && !signal.readAt ? (
                      <button type="button" onClick={() => markRead(signal)}>Mark read</button>
                    ) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>{visibleSignals.length ? `Page ${pagedSignals.page} of ${pagedSignals.totalPages} (${visibleSignals.length} signals)` : "No signals"}</span>
          <div className="pagination-actions">
            <button type="button" onClick={() => setSignalsPage(Math.max(1, pagedSignals.page - 1))} disabled={pagedSignals.page <= 1}>Previous</button>
            <button type="button" onClick={() => setSignalsPage(Math.min(pagedSignals.totalPages, pagedSignals.page + 1))} disabled={pagedSignals.page >= pagedSignals.totalPages}>Next</button>
          </div>
        </div>
      </section>
    </section>
  );
}
