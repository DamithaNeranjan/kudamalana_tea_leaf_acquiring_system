import { effectiveCollectionDate } from "../../../../packages/shared/src/collectionDates.mjs";

// Drafts live outside the paginated DOM so refreshes cannot discard office edits.
export class StagingEdits {
  constructor(saveDate) {
    this.saveDate = saveDate;
    this.weights = new Map();
    this.dates = new Map();
    this.pending = Promise.resolve();
  }

  netWeight(record) {
    return this.weights.get(record.id) ?? record.netWeightKg;
  }

  effectiveDate(record) {
    return this.dates.get(record.id)?.value ?? effectiveCollectionDate(record);
  }

  saveEffectiveDate(id, value) {
    const draft = { value, error: null };
    this.dates.set(id, draft);
    const task = this.pending.then(async () => {
      try {
        const saved = await this.saveDate(id, value);
        if (this.dates.get(id) === draft) this.dates.delete(id);
        return saved;
      } catch (error) {
        if (this.dates.get(id) === draft) draft.error = error;
        throw error;
      }
    });
    this.pending = task.catch(() => {});
    return task;
  }

  async waitForDates(ids) {
    await this.pending;
    for (const id of ids) {
      const error = this.dates.get(id)?.error;
      if (error) throw new Error(`Save the effective date before posting: ${error.message}`);
    }
  }

  clear(ids) {
    for (const id of ids) {
      this.weights.delete(id);
      this.dates.delete(id);
    }
  }

  retain(records) {
    const ids = new Set(records.map((record) => record.id));
    for (const id of this.weights.keys()) if (!ids.has(id)) this.weights.delete(id);
    for (const id of this.dates.keys()) if (!ids.has(id)) this.dates.delete(id);
  }
}
