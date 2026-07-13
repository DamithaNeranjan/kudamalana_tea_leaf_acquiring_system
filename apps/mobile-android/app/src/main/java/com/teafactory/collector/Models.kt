package com.teafactory.collector

data class MobileSession(
    val username: String,
    val displayName: String,
    val syncUrl: String
)

data class SupplierOption(
    val id: String,
    val code: String,
    val name: String,
    val lineId: String?,
    val lineName: String
)

data class TeaLineOption(
    val id: String,
    val name: String
)
