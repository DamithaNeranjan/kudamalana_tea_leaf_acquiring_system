package com.teafactory.collector.sync

import com.teafactory.collector.data.CollectionRecordEntity
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class SyncClient(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun fetchMasterData(): String {
        val request = Request.Builder()
            .url("$baseUrl/sync/master-data")
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Master data sync failed: ${response.code}")
            return response.body?.string().orEmpty()
        }
    }

    fun uploadCollections(deviceId: String, records: List<CollectionRecordEntity>): String {
        val recordsJson = records.joinToString(",") { record ->
            """
            {
              "id":"${record.id}",
              "collectionDate":"${record.collectionDate}",
              "collectionTime":"${record.collectionTime}",
              "lineId":"${record.lineId.orEmpty()}",
              "lineName":"${record.lineName}",
              "supplierId":"${record.supplierId}",
              "supplierCode":"${record.supplierCode}",
              "supplierName":"${record.supplierName}",
              "bagCount":${record.bagCount},
              "grossWeightKg":${record.grossWeightKg},
              "lineUserName":"${record.lineUserName}",
              "printStatus":"${record.printStatus}"
            }
            """.trimIndent()
        }
        val payload = """{"deviceId":"$deviceId","records":[$recordsJson]}"""
        val request = Request.Builder()
            .url("$baseUrl/sync/collections")
            .post(payload.toRequestBody(jsonType))
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Collection upload failed: ${response.code}")
            return response.body?.string().orEmpty()
        }
    }
}
