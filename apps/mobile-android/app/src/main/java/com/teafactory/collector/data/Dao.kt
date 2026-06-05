package com.teafactory.collector.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface TeaDao {
    @Query("SELECT * FROM users WHERE username = :username AND active = 1 LIMIT 1")
    suspend fun findUser(username: String): LineUserEntity?

    @Query("SELECT * FROM suppliers WHERE active = 1 ORDER BY code")
    suspend fun suppliers(): List<SupplierEntity>

    @Query("SELECT * FROM tea_lines WHERE active = 1 ORDER BY name")
    suspend fun teaLines(): List<TeaLineEntity>

    @Query("SELECT * FROM collection_records WHERE synced = 0 ORDER BY collectionDate, collectionTime")
    suspend fun unsyncedCollections(): List<CollectionRecordEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertUsers(users: List<LineUserEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertTeaLines(lines: List<TeaLineEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSuppliers(suppliers: List<SupplierEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCollection(record: CollectionRecordEntity)

    @Update
    suspend fun updateCollection(record: CollectionRecordEntity)
}
