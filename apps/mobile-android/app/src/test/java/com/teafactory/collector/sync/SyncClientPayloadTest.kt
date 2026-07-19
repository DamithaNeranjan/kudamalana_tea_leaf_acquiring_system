package com.teafactory.collector.sync

import com.teafactory.collector.data.CollectionRecordEntity
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncClientPayloadTest {
    @Test
    fun loginPayloadEscapesCredentials() {
        val payload = JSONObject(loginPayload("line\"user", "pa\nssසිංහල"))

        assertEquals("line\"user", payload.getString("username"))
        assertEquals("pa\nssසිංහල", payload.getString("password"))
    }

    @Test
    fun uploadCollectionsPayloadPreservesExpectedDesktopShape() {
        val payload = JSONObject(
            uploadCollectionsPayload(
                deviceId = "tablet-සිංහල",
                records = listOf(
                    CollectionRecordEntity(
                        id = "mobile_1",
                        collectionDate = "2026-07-19",
                        collectionTime = "08:30",
                        lineId = null,
                        lineName = "Line \"A\"",
                        supplierId = "sup_1",
                        supplierCode = "S001",
                        supplierName = "Nimal\nසිංහල",
                        bagCount = 3,
                        grossWeightKg = 42.75,
                        lineUserName = "Sunil & Sons",
                        printStatus = "printed",
                        tabletSavedAt = "2026-07-19T03:00:00.000Z",
                        printedAt = null,
                        synced = false
                    )
                )
            )
        )

        assertEquals("tablet-සිංහල", payload.getString("deviceId"))
        val records = payload.getJSONArray("records")
        assertEquals(1, records.length())
        val record = records.getJSONObject(0)
        assertEquals("mobile_1", record.getString("id"))
        assertEquals("2026-07-19", record.getString("collectionDate"))
        assertEquals("08:30", record.getString("collectionTime"))
        assertEquals("", record.getString("lineId"))
        assertEquals("Line \"A\"", record.getString("lineName"))
        assertEquals("sup_1", record.getString("supplierId"))
        assertEquals("S001", record.getString("supplierCode"))
        assertEquals("Nimal\nසිංහල", record.getString("supplierName"))
        assertEquals(3, record.getInt("bagCount"))
        assertEquals(42.75, record.getDouble("grossWeightKg"), 0.0)
        assertEquals("Sunil & Sons", record.getString("lineUserName"))
        assertEquals("printed", record.getString("printStatus"))
        assertEquals("2026-07-19T03:00:00.000Z", record.getString("tabletSavedAt"))
        assertTrue(record.isNull("printedAt"))
    }
}
