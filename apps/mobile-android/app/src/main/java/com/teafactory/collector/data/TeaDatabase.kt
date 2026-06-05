package com.teafactory.collector.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        LineUserEntity::class,
        TeaLineEntity::class,
        SupplierEntity::class,
        AppSettingEntity::class,
        CollectionRecordEntity::class,
        SyncLogEntity::class
    ],
    version = 1
)
abstract class TeaDatabase : RoomDatabase() {
    abstract fun teaDao(): TeaDao
}
