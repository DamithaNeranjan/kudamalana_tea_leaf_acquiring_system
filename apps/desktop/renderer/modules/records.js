import { compareNewestFirst } from "./listing.js";
import { effectiveCollectionDate } from "../../../../packages/shared/src/collectionDates.mjs";

export function bulkStagingRows(records = [], filters = {}, scope = "all") {
  return scope === "filtered" ? stagingRows(records, filters) : records.slice();
}

export function stagingRows(records = [], filters = {}) {
  const supplier = filters.stagingSupplier || "";
  const line = filters.stagingLine || "";
  const date = filters.stagingDate || "";
  return records
    .filter((row) => `${row.supplierName || ""} ${row.supplierCode || ""}`.toLowerCase().includes(supplier))
    .filter((row) => String(row.lineName || "").toLowerCase().includes(line))
    .filter((row) => !date || row.collectionDate === date)
    .slice()
    .sort((a, b) => compareNewestFirst(a, b, "importedAt"));
}

export function collectionRecordRows(records = [], filters = {}) {
  return records
    .filter((record) => {
      const supplier = String(record.supplierName || "").toLowerCase();
      const line = String(record.lineName || "").toLowerCase();
      const postedBy = String(record.postedByOfficeUserName || "").toLowerCase();
      const collector = String(record.lineUserName || "").toLowerCase();
      return (
        supplier.includes(filters.recordSupplier || "") &&
        line.includes(filters.recordLine || "") &&
        postedBy.includes(filters.recordPostedBy || "") &&
        collector.includes(filters.recordCollector || "") &&
        (!filters.recordDateFrom || effectiveCollectionDate(record) >= filters.recordDateFrom) &&
        (!filters.recordDateTo || effectiveCollectionDate(record) <= filters.recordDateTo)
      );
    })
    .sort((a, b) => compareNewestFirst(a, b, "postedAt", "effectiveDate", "collectionDate"));
}

export function collectionRecordPage(records = [], requestedPage = 1, pageSize = 20) {
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const pageRecords = records.slice(start, start + pageSize);
  return {
    page,
    pageCount,
    start,
    pageRecords,
    shownEnd: Math.min(start + pageRecords.length, records.length)
  };
}

export function postAllStagingMessage(count) {
  return `This will permanently post ${count} staged tablet record${count === 1 ? "" : "s"} using their saved effective dates and reviewed net weights, including records on other pages.`;
}
