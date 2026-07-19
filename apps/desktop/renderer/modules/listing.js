export function compareNewestFirst(a, b, ...fields) {
  const aValue = latestComparableValue(a, fields);
  const bValue = latestComparableValue(b, fields);
  if (aValue !== bValue) return bValue - aValue;
  return String(b.id || "").localeCompare(String(a.id || ""));
}

export function latestComparableValue(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

export function pagedItems(items, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page || 1), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    start,
    rows: items.slice(start, start + pageSize)
  };
}
