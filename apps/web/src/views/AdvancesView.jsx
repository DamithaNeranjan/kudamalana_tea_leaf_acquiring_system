import { useEffect, useMemo, useState } from "react";
import { ButtonSpinner } from "../components/LoadingSpinner.jsx";
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

function canChangeSignal(signal, currentUser) {
  return Boolean(signal && (currentUser?.role === "super_admin" || signal.markedByUserId === currentUser?.id));
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
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [savingSignal, setSavingSignal] = useState(false);
  const [readLoadingId, setReadLoadingId] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showRead, setShowRead] = useState(true);
  const [signalsPage, setSignalsPage] = useState(1);
  const [editingSignalId, setEditingSignalId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editEffectiveMonth, setEditEffectiveMonth] = useState("");
  const [editDateGiven, setEditDateGiven] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editComment, setEditComment] = useState("");
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
    setReadLoadingId(signal.id);
    try {
      await request("/signals/mark-read", {
        method: "POST",
        body: JSON.stringify({ type: "advance", id: signal.id })
      });
      showToast("Signal marked as read.");
      await loadSignals();
    } finally {
      setReadLoadingId("");
    }
  }

  async function loadSignals() {
    setLoadingSignals(true);
    try {
      setData(await request("/advance-signals"));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingSignals(false);
    }
  }

  async function loadSuggestion() {
    if (!selectedTarget?.id || !effectiveMonth) {
      setSuggestion(null);
      return;
    }
    setLoadingSuggestion(true);
    try {
      const payload = await request(
        `/advance-signals/suggestion?scope=${encodeURIComponent(scope)}&targetId=${encodeURIComponent(selectedTarget.id)}&month=${encodeURIComponent(effectiveMonth)}`
      );
      setSuggestion(payload);
      if (!amount) setAmount(formatAmountInput(payload.suggestedAmount || ""));
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function submitSignal(event) {
    event.preventDefault();
    if (!selectedTarget?.id) {
      showToast("Select a supplier or line.", "error");
      return;
    }
    setSavingSignal(true);
    try {
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
      setScope("supplier");
      setTargetText("");
      setEffectiveMonth(localMonthValue());
      setDateGiven(localDateValue());
      setAmount("");
      setComment("");
      setSuggestion(null);
      showToast("Advance signal saved.");
      await loadSignals();
    } finally {
      setSavingSignal(false);
    }
  }

  function startEditSignal(signal) {
    setEditingSignalId(signal.id);
    setEditEffectiveMonth(signal.effectiveMonth || "");
    setEditDateGiven(signal.dateGiven || "");
    setEditAmount(formatAmountInput(signal.amount));
    setEditComment(signal.comment || "");
  }

  async function updateSignal(event, signal) {
    event.preventDefault();
    setEditSaving(true);
    try {
      await request(`/advance-signals/${encodeURIComponent(signal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          effectiveMonth: editEffectiveMonth,
          dateGiven: editDateGiven,
          amount: parseAmountInput(editAmount),
          comment: editComment
        })
      });
      setEditingSignalId("");
      setEditEffectiveMonth("");
      setEditDateGiven("");
      setEditAmount("");
      setEditComment("");
      showToast("Advance signal updated.");
      await loadSignals();
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteSignal(signal) {
    if (!window.confirm("Delete this advance signal?")) return;
    await request(`/advance-signals/${encodeURIComponent(signal.id)}`, { method: "DELETE" });
    showToast("Advance signal deleted.");
    await loadSignals();
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
              <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={savingSignal}>
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
                disabled={savingSignal}
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
              <input type="month" value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} disabled={savingSignal} required />
            </label>
            <label>
              Date given
              <input type="date" value={dateGiven} onChange={(event) => setDateGiven(event.target.value)} disabled={savingSignal} required />
            </label>
            <label>
              Amount given
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(formatAmountInput(event.target.value))}
                disabled={savingSignal}
                required
              />
            </label>
            <label>
              Comment
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional comment" disabled={savingSignal} />
            </label>
            <button type="submit" disabled={savingSignal}>
              {savingSignal && <ButtonSpinner label="Saving advance signal" />}
              {savingSignal ? "Saving..." : "Save signal"}
            </button>
          </form>

          <div className="advance-suggestion">
            <strong>
              {loadingSuggestion && <ButtonSpinner label="Loading advance suggestion" />}
              Suggested amount: Rs. {formatCurrency(suggestion?.suggestedAmount)}
            </strong>
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
          <button type="button" onClick={loadSignals} disabled={loadingSignals}>
            {loadingSignals && <ButtonSpinner label="Refreshing advance signals" />}
            {loadingSignals ? "Refreshing..." : "Refresh"}
          </button>
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
                  <td className="signal-actions">
                    {canMarkRead && !signal.readAt ? (
                      <button
                        type="button"
                        className="table-button signal-action-button read-button"
                        onClick={() => markRead(signal)}
                        disabled={readLoadingId === signal.id}
                      >
                        {readLoadingId === signal.id && <ButtonSpinner label="Marking read" />}
                        {readLoadingId === signal.id ? "Saving..." : "Mark read"}
                      </button>
                    ) : ""}
                    {canChangeSignal(signal, currentUser) && editingSignalId !== signal.id && (
                      <>
                        <button type="button" className="table-button signal-action-button edit-button" onClick={() => startEditSignal(signal)}>Edit</button>
                        <button type="button" className="table-button signal-action-button danger-button" onClick={() => deleteSignal(signal)}>Delete</button>
                      </>
                    )}
                    {editingSignalId === signal.id && (
                      <form className="row-edit-form" onSubmit={(event) => updateSignal(event, signal)}>
                        <input type="month" value={editEffectiveMonth} onChange={(event) => setEditEffectiveMonth(event.target.value)} disabled={editSaving} required />
                        <input type="date" value={editDateGiven} onChange={(event) => setEditDateGiven(event.target.value)} disabled={editSaving} required />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editAmount}
                          onChange={(event) => setEditAmount(formatAmountInput(event.target.value))}
                          disabled={editSaving}
                          required
                        />
                        <input value={editComment} onChange={(event) => setEditComment(event.target.value)} placeholder="Comment" disabled={editSaving} />
                        <button type="submit" className="table-button signal-action-button save-button" disabled={editSaving}>
                          {editSaving && <ButtonSpinner label="Saving advance edit" />}
                          {editSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="table-button signal-action-button cancel-button"
                          onClick={() => setEditingSignalId("")}
                          disabled={editSaving}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
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
