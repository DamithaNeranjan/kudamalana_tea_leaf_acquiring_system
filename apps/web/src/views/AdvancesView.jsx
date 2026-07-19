import { useEffect, useMemo, useState } from "react";
import { request } from "../api/client.js";
import {
  formatAmountInput,
  formatCurrency,
  localDateValue,
  localMonthValue,
  parseAmountInput,
  parseDateTime
} from "../../../../packages/shared/src/format.mjs";
import { paginateWebRows, targetLabel, visibleAdvanceSignals } from "../utils/signalLogic.js";

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

function paginate(rows, page) {
  return paginateWebRows(rows, page);
}

export function AdvancesView({ currentUser, showToast }) {
  const [data, setData] = useState({ suppliers: [], teaLines: [], signals: [] });
  const [scope, setScope] = useState("supplier");
  const [targetText, setTargetText] = useState("");
  const [effectiveMonth, setEffectiveMonth] = useState(localMonthValue);
  const [dateGiven, setDateGiven] = useState(localDateValue);
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
    return visibleAdvanceSignals(data.signals, { supplierFilter, monthFilter, typeFilter, showRead });
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
        amount: parseAmountInput(amount),
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
            <strong>Suggested amount: Rs. {formatCurrency(suggestion?.suggestedAmount)}</strong>
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
                      <td>{formatCurrency(item.leafValue)}</td>
                      <td>{formatCurrency(item.arrearsCarriedForward)}</td>
                      <td>{formatCurrency(item.totalAdvances)}</td>
                      <td>{formatCurrency(item.suggestedAmount)}</td>
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
                  <td>{formatCurrency(signal.suggestedAmount)}</td>
                  <td>{formatCurrency(signal.amount)}</td>
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
