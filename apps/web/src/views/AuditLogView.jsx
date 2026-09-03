import { useEffect, useMemo, useState } from "react";
import { ButtonSpinner } from "../components/LoadingSpinner.jsx";
import { request } from "../api/client.js";
import { parseDateTime } from "../../../../packages/shared/src/format.mjs";
import { paginateWebRows } from "../utils/signalLogic.js";

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

function compactJson(value) {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function labelForField(path) {
  const labels = {
    active: "Active",
    amount: "Amount",
    comment: "Comment",
    createdAt: "Created at",
    dateGiven: "Date given",
    displayName: "Display name",
    effectiveMonth: "Effective month",
    entityId: "Record ID",
    id: "ID",
    markedAt: "Signalled at",
    markedByDisplayName: "Signalled by",
    markedByUserId: "Signalled by user ID",
    month: "Month",
    paymentDoneDate: "Payment done date",
    readAt: "Read at",
    readByDisplayName: "Read by",
    role: "Role",
    scope: "Advance type",
    section: "Balance type",
    suggestedAmount: "Suggested amount",
    targetId: "Target ID",
    targetLabel: "Supplier / Line",
    username: "Username"
  };
  const parts = path.split(".");
  const last = parts[parts.length - 1];
  const label = labels[last] || last.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueText(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isPlainObject(value)) return compactJson(value);
  return String(value);
}

function flattenSnapshot(value, prefix = "") {
  if (!isPlainObject(value)) return prefix ? [[prefix, value]] : [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) return flattenSnapshot(child, path);
    return [[path, child]];
  });
}

function snapshotRows(before, after) {
  const beforeMap = new Map(flattenSnapshot(before));
  const afterMap = new Map(flattenSnapshot(after));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => labelForField(a).localeCompare(labelForField(b)));
  return keys
    .map((key) => ({
      key,
      field: labelForField(key),
      before: beforeMap.has(key) ? beforeMap.get(key) : undefined,
      after: afterMap.has(key) ? afterMap.get(key) : undefined
    }))
    .filter((row) => valueText(row.before) !== valueText(row.after));
}

function AuditSnapshot({ before, after }) {
  const rows = snapshotRows(before, after);
  if (!rows.length) return "-";
  return (
    <details className="audit-snapshot">
      <summary>View changes</summary>
      <div className="audit-snapshot-panel">
        <table className="audit-change-table">
          <thead>
            <tr><th>Field</th><th>Before</th><th>After</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.field}</td>
                <td>{valueText(row.before)}</td>
                <td>{valueText(row.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AuditLogView({ showToast }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function loadAuditLogs() {
    setLoading(true);
    try {
      const payload = await request("/web-audit-log");
      setAuditLogs(payload.auditLogs || []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const visibleLogs = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return auditLogs.filter((log) =>
      ["username", "displayName", "role", "action", "entityType", "entityLabel", "summary"].some((field) =>
        String(log[field] || "").toLowerCase().includes(needle)
      )
    );
  }, [auditLogs, filter]);

  const pagedLogs = useMemo(() => paginateWebRows(visibleLogs, page), [page, visibleLogs]);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  return (
    <section className="view active-view audit-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Admin only</span>
          <h2>Audit Trail</h2>
          <p>Review web app actions performed by signed-in users.</p>
        </div>
      </div>

      <section className="panel balance-section">
        <div className="toolbar">
          <input placeholder="Filter user, action, record, or summary" value={filter} onChange={(event) => setFilter(event.target.value)} />
          <button type="button" onClick={loadAuditLogs} disabled={loading}>
            {loading && <ButtonSpinner label="Loading audit trail" />}
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table audit-table">
            <thead>
              <tr>
                <th>Date</th><th>User</th><th>Role</th><th>Action</th><th>Record</th><th>Summary</th><th>Snapshots</th>
              </tr>
            </thead>
            <tbody>
              {pagedLogs.rows.map((log) => (
                <tr key={log.id}>
                  <td>{dateTime(log.createdAt)}</td>
                  <td>{log.displayName || log.username}</td>
                  <td>{log.role}</td>
                  <td>{log.action}</td>
                  <td>{log.entityLabel || log.entityId || log.entityType}</td>
                  <td>{log.summary || "-"}</td>
                  <td><AuditSnapshot before={log.before} after={log.after} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>{visibleLogs.length ? `Page ${pagedLogs.page} of ${pagedLogs.totalPages} (${visibleLogs.length} audit logs)` : "No audit logs"}</span>
          <div className="pagination-actions">
            <button type="button" onClick={() => setPage(Math.max(1, pagedLogs.page - 1))} disabled={pagedLogs.page <= 1}>Previous</button>
            <button type="button" onClick={() => setPage(Math.min(pagedLogs.totalPages, pagedLogs.page + 1))} disabled={pagedLogs.page >= pagedLogs.totalPages}>Next</button>
          </div>
        </div>
      </section>
    </section>
  );
}
