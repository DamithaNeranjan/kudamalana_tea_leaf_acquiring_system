import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopSyncServer } from "../src/server.mjs";
import { LocalStore } from "../src/localStore.mjs";

async function withDesktopServer(fn) {
  const dir = await mkdtemp(join(tmpdir(), "tea-desktop-"));
  const store = new LocalStore(join(dir, "tea-local-db.sqlite"));
  const server = await createDesktopSyncServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

test("desktop imports tablet records idempotently and posts reviewed entries", async () => {
  await withDesktopServer(async (baseUrl) => {
    await fetch(`${baseUrl}/office/suppliers`, {
      method: "POST",
      body: JSON.stringify({ id: "sup_1", code: "S001", name: "Nimal", lineName: "Line A", active: true })
    });

    const upload = await fetch(`${baseUrl}/sync/collections`, {
      method: "POST",
      body: JSON.stringify({
        deviceId: "tablet-1",
        records: [
          {
            id: "mobile_1",
            supplierId: "sup_1",
            supplierCode: "S001",
            supplierName: "Nimal",
            lineName: "Line A",
            collectionDate: "2026-05-01",
            collectionTime: "08:30",
            bagCount: 2,
            grossWeightKg: 12.5,
            lineUserName: "Sunil",
            printStatus: "printed"
          }
        ]
      })
    });
    const uploadResult = await upload.json();
    assert.match(uploadResult.imported[0], /^stage_/);
    assert.deepEqual(uploadResult.skipped, []);

    const duplicate = await fetch(`${baseUrl}/sync/collections`, {
      method: "POST",
      body: JSON.stringify({ deviceId: "tablet-1", records: [{ id: "mobile_1" }] })
    });
    assert.equal((await duplicate.json()).skipped[0], "mobile_1");

    const state = await (await fetch(`${baseUrl}/office/state`)).json();
    const stageId = state.collectionStaging[0].id;
    await fetch(`${baseUrl}/office/staging/${stageId}`, {
      method: "PUT",
      body: JSON.stringify({ netWeightKg: 12 })
    });
    await fetch(`${baseUrl}/office/staging/${stageId}/post`, { method: "POST" });

    const book = await (await fetch(`${baseUrl}/office/green-leaf-book?month=2026-05`)).json();
    assert.equal(book.rows[0].totalKg, 12);
    assert.equal(book.rows[0].balanceToPay, 2400);
  });
});
