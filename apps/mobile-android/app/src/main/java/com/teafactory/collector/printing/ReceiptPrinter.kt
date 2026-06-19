package com.teafactory.collector.printing

import com.teafactory.collector.data.CollectionRecordEntity
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

interface ReceiptPrinter {
    suspend fun printCollectionReceipt(record: CollectionRecordEntity): PrintResult
}

data class PrintResult(
    val successful: Boolean,
    val message: String
)

class EscPosReceiptFormatter {
    fun format(record: CollectionRecordEntity): ByteArray {
        val printedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
        val text = receiptLines(record, printedAt).joinToString("\r\n", postfix = "\r\n\r\n\r\n\r\n")
        return text.toByteArray(Charsets.UTF_8)
    }

    private fun receiptLines(record: CollectionRecordEntity, printedAt: String): List<String> {
        val lines = mutableListOf<String>()
        lines += "-----------------------------"
        lines += centered("Kudamalana Tea Factory")
        lines += centered("Green Leaf Collection")
        lines += "-----------------------------"
        lines += "Receipt: ${shortReceiptId(record.id)}"
        lines += "Saved: ${record.collectionDate} ${record.collectionTime}"
        lines += "Printed: $printedAt"
        lines += "Line: ${record.lineName}"
        lines += wrapped("Supplier", record.supplierName)
        lines += "Bag count: ${record.bagCount}"
        lines += "Gross KG: ${record.grossWeightKg}"
        lines += wrapped("Collected by", record.lineUserName)
        lines += "-----------------------------"
        lines += "Keep this receipt for payment"
        return lines
    }

    private fun shortReceiptId(id: String): String =
        id.removePrefix("mobile_").take(8).uppercase()

    private fun centered(value: String, width: Int = 29): String {
        if (value.length >= width) return value
        val leftPadding = (width - value.length) / 2
        return " ".repeat(leftPadding) + value
    }

    private fun wrapped(label: String, value: String, width: Int = 29): List<String> {
        val prefix = "$label: "
        val firstWidth = width - prefix.length
        if (value.length <= firstWidth) return listOf(prefix + value)
        val first = value.take(firstWidth)
        val rest = value.drop(firstWidth).chunked(width - 2)
        return listOf(prefix + first) + rest.map { "  $it" }
    }
}
