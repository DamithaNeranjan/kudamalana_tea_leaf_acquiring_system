export function formatAuditAction(action) {
  return String(action || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAuditEntity(log) {
  return [formatAuditAction(log.entityType), log.entityLabel].filter(Boolean).join(" - ");
}

export function formatAuditDetails(log) {
  if (!log.before && log.after) return `Created ${compactAuditValue(log.after)}`;
  if (log.before && !log.after) return `Before: ${compactAuditValue(log.before)}`;
  if (!log.before && !log.after) return "-";
  const before = log.before || {};
  const after = log.after || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !["id", "updatedAt", "createdAt"].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
  if (!keys.length) return "-";
  return keys
    .slice(0, 5)
    .map((key) => `${auditFieldLabel(key)}: ${compactAuditValue(before[key])} -> ${compactAuditValue(after[key])}`)
    .join("; ");
}

export function auditFieldLabel(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function compactAuditValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => !["id", "updatedAt", "createdAt"].includes(key));
    return keys
      .slice(0, 3)
      .map((key) => `${auditFieldLabel(key)} ${compactAuditValue(value[key])}`)
      .join(", ");
  }
  return String(value);
}

export function summarizeCounts(counts = {}) {
  const entries = Object.entries(counts || {}).filter(([, value]) => Number(value || 0) > 0);
  if (!entries.length) return "No changed records";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

export function summarizeReceived(received = {}) {
  if (!received) return summarizeCounts();
  const counts = { ...(received.counts || {}) };
  if (received.importedOfficeUsers) {
    counts.importedOfficeUsers = received.importedOfficeUsers.importedCount || 0;
  }
  return summarizeCounts(counts);
}
