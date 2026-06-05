package com.teafactory.collector.printing

import com.teafactory.collector.data.CollectionRecordEntity

interface ReceiptPrinter {
    suspend fun printCollectionReceipt(record: CollectionRecordEntity): PrintResult
}

data class PrintResult(
    val successful: Boolean,
    val message: String
)

class EscPosReceiptFormatter {
    fun format(record: CollectionRecordEntity): ByteArray {
        val text = buildString {
            appendLine("TEA LEAF COLLECTION")
            appendLine("-----------------------------")
            appendLine("Receipt: ${record.id}")
            appendLine("Date: ${record.collectionDate} ${record.collectionTime}")
            appendLine("Line: ${record.lineName}")
            appendLine("Supplier: ${record.supplierCode} ${record.supplierName}")
            appendLine("Bags: ${record.bagCount}")
            appendLine("Gross kg: ${record.grossWeightKg}")
            appendLine("Collected by: ${record.lineUserName}")
            appendLine("-----------------------------")
            appendLine("Keep this receipt for payment")
            appendLine()
            appendLine()
        }
        return text.toByteArray(Charsets.UTF_8)
    }
}
