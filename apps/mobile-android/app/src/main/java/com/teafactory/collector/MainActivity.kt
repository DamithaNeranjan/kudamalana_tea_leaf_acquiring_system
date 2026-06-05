package com.teafactory.collector

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val supplierCode = remember { mutableStateOf("") }
                val bags = remember { mutableStateOf("") }
                val grossKg = remember { mutableStateOf("") }

                Row(Modifier.fillMaxSize().padding(20.dp)) {
                    Column(Modifier.weight(1f).padding(end = 16.dp)) {
                        Text("Tea Collector", style = MaterialTheme.typography.headlineMedium)
                        Text("Offline field collection")
                        OutlinedTextField(supplierCode.value, { supplierCode.value = it }, label = { Text("Supplier code") })
                        OutlinedTextField(bags.value, { bags.value = it }, label = { Text("Bags") })
                        OutlinedTextField(grossKg.value, { grossKg.value = it }, label = { Text("Gross weight kg") })
                        Button(onClick = { }) {
                            Text("Save and print receipt")
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Sync", style = MaterialTheme.typography.headlineSmall)
                        Button(onClick = { }) { Text("Download master data") }
                        Button(onClick = { }) { Text("Upload unsynced collections") }
                    }
                }
            }
        }
    }
}
