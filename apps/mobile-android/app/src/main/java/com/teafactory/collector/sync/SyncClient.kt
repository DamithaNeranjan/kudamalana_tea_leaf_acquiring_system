package com.teafactory.collector.sync

import com.teafactory.collector.data.CollectionRecordEntity
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class SyncClient(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun login(username: String, password: String): String {
        val payload = """{"username":"${escapeJson(username)}","password":"${escapeJson(password)}"}"""
        val request = Request.Builder()
            .url("$baseUrl/sync/login")
            .post(payload.toRequestBody(jsonType))
            .build()
        client.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val errorMessage = runCatching { JSONObject(responseBody).optString("error") }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: "Login failed: ${response.code}"
                error(errorMessage)
            }
            return responseBody
        }
    }

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
              "tabletSavedAt":"${escapeJson(record.tabletSavedAt)}",
              "printedAt":${record.printedAt?.let { "\"${escapeJson(it)}\"" } ?: "null"},
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

    private fun escapeJson(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
}
