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
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function targetLabel(scope, target) {
  if (!target) return "";
  return scope === "line" ? target.name : `${target.code || ""} - ${target.name || ""}`.trim();
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
  const canManage = ["super_admin", "director"].includes(currentUser?.role);

  const targets = scope === "line" ? data.teaLines : data.suppliers;
  const selectedTarget = useMemo(
    () => targets.find((target) => targetLabel(scope, target) === targetText || target.id === targetText),
    [scope, targetText, targets]
  );
  const visibleSignals = useMemo(() => {
    const supplierText = supplierFilter.trim().toLowerCase();
    return data.signals
      .filter((signal) => String(signal.targetLabel || "").toLowerCase().includes(supplierText))
      .filter((signal) => !monthFilter || signal.effectiveMonth === monthFilter);
  }, [data.signals, monthFilter, supplierFilter]);

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
          <button type="button" onClick={loadSignals}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th><th>Supplier / Line</th><th>Effective month</th><th>Date given</th>
                <th>Suggested</th><th>Amount</th><th>Comment</th><th>Signalled at</th><th>By</th>
              </tr>
            </thead>
            <tbody>
              {visibleSignals.map((signal) => (
                <tr key={signal.id}>
                  <td>{signal.scope === "line" ? "Line" : "Supplier"}</td>
                  <td>{signal.targetLabel}</td>
                  <td>{signal.effectiveMonth}</td>
                  <td>{signal.dateGiven}</td>
                  <td>{money(signal.suggestedAmount)}</td>
                  <td>{money(signal.amount)}</td>
                  <td>{signal.comment || ""}</td>
                  <td>{dateTime(signal.markedAt)}</td>
                  <td>{signal.markedByDisplayName || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
