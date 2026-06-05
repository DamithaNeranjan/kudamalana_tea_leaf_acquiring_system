package com.teafactory.collector.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class LineUserEntity(
    @PrimaryKey val id: String,
    val username: String,
    val displayName: String,
    val passwordHash: String,
    val active: Boolean
)

@Entity(tableName = "tea_lines")
data class TeaLineEntity(
    @PrimaryKey val id: String,
    val name: String,
    val active: Boolean
)

@Entity(tableName = "suppliers")
data class SupplierEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val lineId: String?,
    val lineName: String,
    val deductionEnabled: Boolean,
    val ownTransportAdditionEnabled: Boolean,
    val factoryTransportDeductionEnabled: Boolean,
    val active: Boolean
)

@Entity(tableName = "app_settings")
data class AppSettingEntity(
    @PrimaryKey val key: String,
    val value: String
)

@Entity(tableName = "collection_records")
data class CollectionRecordEntity(
    @PrimaryKey val id: String,
    val collectionDate: String,
    val collectionTime: String,
    val lineId: String?,
    val lineName: String,
    val supplierId: String,
    val supplierCode: String,
    val supplierName: String,
    val bagCount: Int,
    val grossWeightKg: Double,
    val lineUserName: String,
    val printStatus: String,
    val synced: Boolean
)

@Entity(tableName = "sync_log")
data class SyncLogEntity(
    @PrimaryKey val id: String,
    val type: String,
    val message: String,
    val createdAt: String
)
