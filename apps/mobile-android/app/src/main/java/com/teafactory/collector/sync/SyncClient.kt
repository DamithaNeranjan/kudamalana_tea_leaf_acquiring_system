package com.teafactory.collector.sync

import com.teafactory.collector.data.CollectionRecordEntity
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class SyncClient(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun login(username: String, password: String): String {
        val payload = loginPayload(username, password)
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
        val payload = uploadCollectionsPayload(deviceId, records)
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

internal fun loginPayload(username: String, password: String): String =
    JSONObject()
        .put("username", username)
        .put("password", password)
        .toString()

internal fun uploadCollectionsPayload(deviceId: String, records: List<CollectionRecordEntity>): String =
    JSONObject()
        .put("deviceId", deviceId)
        .put("records", JSONArray(records.map(::collectionRecordJson)))
        .toString()

private fun collectionRecordJson(record: CollectionRecordEntity): JSONObject =
    JSONObject()
        .put("id", record.id)
        .put("collectionDate", record.collectionDate)
        .put("collectionTime", record.collectionTime)
        .put("tabletSavedAt", record.tabletSavedAt)
        .put("printedAt", record.printedAt ?: JSONObject.NULL)
        .put("lineId", record.lineId.orEmpty())
        .put("lineName", record.lineName)
        .put("supplierId", record.supplierId)
        .put("supplierCode", record.supplierCode)
        .put("supplierName", record.supplierName)
        .put("bagCount", record.bagCount)
        .put("grossWeightKg", record.grossWeightKg)
        .put("lineUserName", record.lineUserName)
        .put("printStatus", record.printStatus)
