import { useMemo, useState } from "react";
import { request } from "../api/client.js";

export function BookView() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [book, setBook] = useState(null);

  async function loadBook() {
    setBook(await request(`/green-leaf-book?month=${month}`));
  }

  const dayHeaders = useMemo(
    () => Array.from({ length: book?.dayCount || 0 }, (_, index) => index + 1),
    [book]
  );

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
          <button type="button" onClick={loadBook}>Load</button>
        </div>
        <div className="table-wrap book-table-wrap">
          <table>
            {book && (
              <>
                <thead>
                  <tr>
                    <th>No</th><th>Supplier</th><th>Line</th>
                    {dayHeaders.map((day) => <th key={day}>{day}</th>)}
                    <th>Total</th><th>Deduct Kg</th><th>Final Kg</th><th>Transport Add</th>
                    <th>Advances</th><th>Fertilizer</th><th>Transport Deduct</th><th>Arrears</th>
                    <th>Price</th><th>Total Deductions</th><th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {book.rows.map((row) => (
                    <tr key={row.supplierId}>
                      <td>{row.rowNumber}</td>
                      <td>{row.supplierName}</td>
                      <td>{row.lineName || ""}</td>
                      {row.dailyKg.map((value, index) => <td key={index}>{value || ""}</td>)}
                      <td>{row.totalKg}</td>
                      <td>{row.deductionKg}</td>
                      <td>{row.finalKg}</td>
                      <td>{row.ownTransportAddition}</td>
                      <td>{row.totalAdvances}</td>
                      <td>{row.fertilizerDeduction}</td>
                      <td>{row.factoryTransportDeduction}</td>
                      <td>{row.arrearsCarriedForward}</td>
                      <td>{row.pricePerKg}</td>
                      <td>{row.totalDeductions}</td>
                      <td>{row.balanceToPay}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </section>
    </section>
  );
}
