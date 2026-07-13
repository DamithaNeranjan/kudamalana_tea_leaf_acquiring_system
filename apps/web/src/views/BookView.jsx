import { useMemo, useState } from "react";
import { request } from "../api/client.js";
import { formatOptionalDecimal, localMonthValue, sumNumbers } from "../../../../packages/shared/src/format.mjs";

function poyaDaysForMonth(month) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return new Set();
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
    if (sriLankaDate.getUTCFullYear() === year && sriLankaDate.getUTCMonth() + 1 === monthNumber) {
      days.add(sriLankaDate.getUTCDate());
    }
  }

  return days;
}

function greenLeafBookTotals(rows, dayCount) {
  const total = (field) => sumNumbers(rows.map((row) => row[field]));
  return {
    dailyKg: Array.from({ length: dayCount }, (_, index) => sumNumbers(rows.map((row) => row.dailyKg[index]))),
    totalKg: total("totalKg"),
    deductionKg: total("deductionKg"),
    finalKg: total("finalKg"),
    ownTransportAddition: total("ownTransportAddition"),
    totalAdvances: total("totalAdvances"),
    fertilizerDeduction: total("fertilizerDeduction"),
    teaPacketDeduction: total("teaPacketDeduction"),
    factoryTransportDeduction: total("factoryTransportDeduction"),
    arrearsCarriedForward: total("arrearsCarriedForward"),
    totalAdditions: sumNumbers(rows.map((row) => row.totalAdditions ?? row.ownTransportAddition)),
    totalDeductions: total("totalDeductions"),
    positiveBalanceToPay: sumNumbers(rows.map((row) => Math.max(0, Number(row.balanceToPay || 0)))),
    negativeBalanceToPay: sumNumbers(rows.map((row) => Math.min(0, Number(row.balanceToPay || 0))))
  };
}

export function BookView() {
  const [month, setMonth] = useState(localMonthValue);
  const [book, setBook] = useState(null);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [excludeFactorySuppliersFromTotals, setExcludeFactorySuppliersFromTotals] = useState(true);

  async function loadBook() {
    setBook(await request(`/green-leaf-book?month=${month}`));
  }

  const poyaDays = useMemo(() => poyaDaysForMonth(book?.month), [book]);
  const dayHeaders = useMemo(() => Array.from({ length: book?.dayCount || 0 }, (_, index) => index + 1), [book]);
  const visibleRows = useMemo(() => {
    const supplier = supplierFilter.trim().toLowerCase();
    const line = lineFilter.trim().toLowerCase();
    return (book?.rows || [])
      .filter((row) => String(row.supplierName || "").toLowerCase().includes(supplier))
      .filter((row) => String(row.lineName || "").toLowerCase().includes(line));
  }, [book, lineFilter, supplierFilter]);
  const totalRows = useMemo(
    () => (excludeFactorySuppliersFromTotals ? visibleRows.filter((row) => !row.balanceExcluded) : visibleRows),
    [excludeFactorySuppliersFromTotals, visibleRows]
  );
  const totals = useMemo(() => greenLeafBookTotals(totalRows, book?.dayCount || 0), [book, totalRows]);

  return (
    <section className="view active-view book-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Monthly view</span>
          <h2>Green Leaf Book</h2>
          <p>Load a month to view supplier-wise intake and payment totals.</p>
        </div>
      </div>
      <section className="panel book-panel">
        <div className="toolbar">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          <input
            placeholder="Filter supplier name"
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
          />
          <input
            placeholder="Filter line name"
            value={lineFilter}
            onChange={(event) => setLineFilter(event.target.value)}
          />
          <label className="switch-row compact-switch">
            <input
              type="checkbox"
              checked={excludeFactorySuppliersFromTotals}
              onChange={(event) => setExcludeFactorySuppliersFromTotals(event.target.checked)}
            />
            Exclude factory-owned from totals
          </label>
          <button type="button" onClick={loadBook}>Load</button>
        </div>
        <div className="book-legend" aria-label="Green Leaf Book color legend">
          <span><i className="legend-swatch poya"></i>Poya day</span>
          <span><i className="legend-swatch paid"></i>Paid supplier</span>
          <span><i className="legend-swatch factory"></i>Factory-owned</span>
          <span><i className="legend-text addition">Green values</i>additions</span>
          <span><i className="legend-text deduction">Red values</i>deductions</span>
          <span><i className="legend-text balance">Bold values</i>balance</span>
        </div>
        {book?.closed && (
          <div className="book-closed-notice">
            This month Green Leaf Book is closed. Closed by {book.closure?.closedByOfficeUserName || "office user"}.
          </div>
        )}
        <div className="book-wrap book-table-wrap">
          <table>
            {book && (
              <>
                <thead>
                  <tr>
                    <th>No</th><th>Supplier</th><th>Line</th>
                    {dayHeaders.map((day) => <th key={day} className={poyaDays.has(day) ? "poya-day" : ""}>{day}</th>)}
                    <th>Total (Kg)</th><th>2% Deduction (Kg)</th><th>Final Kg (Kg)</th><th>Transport Add (Rs.)</th>
                    <th>Advance Date</th><th>Advance Amount (Rs.)</th><th>Total Advance (Rs.)</th>
                    <th>Fertilizer (Rs.)</th><th>Made Tea Packets (Rs.)</th><th>Transport Deduct (Rs.)</th><th>Arrears (Rs.)</th>
                    <th>Price (Rs.)</th><th>Total Additions (Rs.)</th><th>Total Deductions (Rs.)</th><th>Balance (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={row.supplierId}
                      className={`${row.payment ? "paid-book-row" : ""} ${row.balanceExcluded ? "factory-owned-row" : ""}`}
                    >
                      <td>{row.rowNumber}</td>
                      <td>{row.supplierName}</td>
                      <td>{row.lineName || ""}</td>
                      {row.dailyKg.map((value, index) => (
                        <td key={index} className={poyaDays.has(index + 1) ? "poya-day" : ""}>
                          {formatOptionalDecimal(value, { blankZero: true })}
                        </td>
                      ))}
                      <td>{formatOptionalDecimal(row.totalKg)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.deductionKg)}</td>
                      <td className="addition-value">{formatOptionalDecimal(row.finalKg)}</td>
                      <td className="addition-value">{formatOptionalDecimal(row.ownTransportAddition)}</td>
                      <td className="advance-breakdown">
                        {(row.advancePayments || []).map((advance, index) => <span key={`${advance.date}-${index}`}>{advance.date}</span>)}
                      </td>
                      <td className="advance-breakdown deduction-value">
                        {(row.advancePayments || []).map((advance, index) => <span key={`${advance.date}-${index}`}>{formatOptionalDecimal(advance.amount)}</span>)}
                      </td>
                      <td className="deduction-value">{formatOptionalDecimal(row.totalAdvances)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.fertilizerDeduction)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.teaPacketDeduction)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.factoryTransportDeduction)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.arrearsCarriedForward)}</td>
                      <td className="addition-value">{formatOptionalDecimal(row.pricePerKg)}</td>
                      <td className="addition-value">{formatOptionalDecimal(row.totalAdditions ?? row.ownTransportAddition)}</td>
                      <td className="deduction-value">{formatOptionalDecimal(row.totalDeductions)}</td>
                      <td className="balance-value">{row.balanceExcluded ? "" : formatOptionalDecimal(row.balanceToPay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td><td className="book-total-label">Total</td><td></td>
                    {totals.dailyKg.map((value, index) => (
                      <td key={index} className={poyaDays.has(index + 1) ? "poya-day" : ""}>{formatOptionalDecimal(value)}</td>
                    ))}
                    <td>{formatOptionalDecimal(totals.totalKg)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.deductionKg)}</td>
                    <td className="addition-value">{formatOptionalDecimal(totals.finalKg)}</td>
                    <td className="addition-value">{formatOptionalDecimal(totals.ownTransportAddition)}</td>
                    <td></td>
                    <td></td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.totalAdvances)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.fertilizerDeduction)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.teaPacketDeduction)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.factoryTransportDeduction)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.arrearsCarriedForward)}</td>
                    <td></td>
                    <td className="addition-value">{formatOptionalDecimal(totals.totalAdditions)}</td>
                    <td className="deduction-value">{formatOptionalDecimal(totals.totalDeductions)}</td>
                    <td className="balance-value balance-total-cell">
                      <span className="positive-balance-total">{formatOptionalDecimal(totals.positiveBalanceToPay)}</span>
                      <span className="negative-balance-total">{formatOptionalDecimal(totals.negativeBalanceToPay)}</span>
                    </td>
                  </tr>
                </tfoot>
              </>
            )}
          </table>
        </div>
      </section>
    </section>
  );
}
