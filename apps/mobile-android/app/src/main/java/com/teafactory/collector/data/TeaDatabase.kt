package com.teafactory.collector.data

import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        LineUserEntity::class,
        TeaLineEntity::class,
        SupplierEntity::class,
        AppSettingEntity::class,
        CollectionRecordEntity::class,
        SyncLogEntity::class
    ],
    version = 2
)
abstract class TeaDatabase : RoomDatabase() {
    abstract fun teaDao(): TeaDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE collection_records ADD COLUMN tabletSavedAt TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE collection_records ADD COLUMN printedAt TEXT")
            }
        }
    }
}
