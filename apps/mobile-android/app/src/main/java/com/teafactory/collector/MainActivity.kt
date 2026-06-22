package com.teafactory.collector

import android.app.Activity
import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.core.app.ActivityCompat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.room.Room
import com.teafactory.collector.data.CollectionRecordEntity
import com.teafactory.collector.data.SupplierEntity
import com.teafactory.collector.data.TeaDatabase
import com.teafactory.collector.data.TeaLineEntity
import com.teafactory.collector.printing.EscPosReceiptFormatter
import com.teafactory.collector.sync.SyncClient
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.concurrent.thread
import kotlinx.coroutines.runBlocking

private val SERIAL_PORT_PROFILE_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

private val Ink = Color(0xFF172116)
private val Muted = Color(0xFF62705F)
private val Line = Color(0xFFDCE3D8)
private val Panel = Color(0xFFFFFFFF)
private val Soft = Color(0xFFEEF3EB)
private val Page = Color(0xFFF6F7F4)
private val Brand = Color(0xFF1F5F36)
private val BrandStrong = Color(0xFF17351F)
private val Accent = Color(0xFFB9862C)
private val Success = Color(0xFF1F5F36)
private val Danger = Color(0xFF8A241F)
private const val DEFAULT_OFFICE_SYNC_URL = "http://192.168.1.125:7070"
private const val PREFS_NAME = "tea_collector_settings"
private const val PREF_SYNC_URL = "office_sync_url"
private const val PREF_CACHED_USERNAME = "cached_username"
private const val PREF_CACHED_PASSWORD = "cached_password"
private const val PREF_CACHED_DISPLAY_NAME = "cached_display_name"
private val RECEIPT_PRINTER_NAME_HINTS = listOf("MTP-2", "GOOJ", "PT-210", "PT210", "PRINTER")

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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            KudamalanaTheme {
                var session by remember { mutableStateOf<MobileSession?>(null) }
                Surface(Modifier.fillMaxSize(), color = Page) {
                    if (session == null) {
                        CollectorLoginScreen(onLoggedIn = { session = it })
                    } else {
                        CollectorWorkspace(
                            session = session!!,
                            onLogout = { session = null }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun KudamalanaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Brand,
            onPrimary = Color.White,
            secondary = Accent,
            background = Page,
            surface = Panel,
            onSurface = Ink,
            error = Danger
        ),
        content = content
    )
}

@Composable
fun CollectorLoginScreen(onLoggedIn: (MobileSession) -> Unit) {
    val context = LocalContext.current
    val activity = context as? Activity
    val focusManager = LocalFocusManager.current
    val passwordFocusRequester = remember { FocusRequester() }
    val scrollState = rememberScrollState()
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    var syncUrl by remember {
        mutableStateOf(prefs.getString(PREF_SYNC_URL, DEFAULT_OFFICE_SYNC_URL) ?: DEFAULT_OFFICE_SYNC_URL)
    }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var isErrorMessage by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val rawContent = result.contents
        if (rawContent.isNullOrBlank()) {
            message = "Pairing was cancelled."
            isErrorMessage = true
            return@rememberLauncherForActivityResult
        }
        val pairedUrl = parseSyncUrl(rawContent)
        if (pairedUrl == null) {
            message = "This QR code is not a valid tablet pairing code."
            isErrorMessage = true
            return@rememberLauncherForActivityResult
        }
        syncUrl = pairedUrl
        prefs.edit().putString(PREF_SYNC_URL, pairedUrl).apply()
        Toast.makeText(context, "Tablet paired successfully", Toast.LENGTH_LONG).show()
        message = ""
        isErrorMessage = false
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(scrollState)
            .background(Page)
            .padding(28.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(470.dp)
                .border(1.dp, Line, RoundedCornerShape(8.dp))
                .background(Panel, RoundedCornerShape(8.dp)),
            horizontalArrangement = Arrangement.Center
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(BrandStrong)
                    .padding(42.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Image(
                    painter = painterResource(R.drawable.kudamalana_logo),
                    contentDescription = "Kudamalana Tea Factory logo",
                    modifier = Modifier.size(width = 150.dp, height = 108.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(Modifier.height(18.dp))
                Text("Field tablet", color = Color(0xFF8AA87F), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(10.dp))
                Text(
                    "Secure local access",
                    color = Color.White,
                    fontSize = 34.sp,
                    lineHeight = 38.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Sign in with a registered line-user account to collect green leaf records and sync them with the office over local Wi-Fi.",
                    color = Color(0xFFD8E5D4),
                    lineHeight = 22.sp,
                    modifier = Modifier.width(360.dp)
                )
                Spacer(Modifier.height(22.dp))
                LoginFact("Offline collection records")
                LoginFact("Local Wi-Fi office sync")
                LoginFact("Receipt-ready tablet workflow")
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(42.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text("Collector Login", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
                Spacer(Modifier.height(18.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { passwordFocusRequester.requestFocus() }),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
                    trailingIcon = {
                        TextButton(onClick = { showPassword = !showPassword }) {
                            Text(if (showPassword) "Hide" else "Show", color = BrandStrong)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(passwordFocusRequester)
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        val cleanUrl = syncUrl.trim().trimEnd('/')
                        val cleanUsername = username.trim()
                        if (cleanUsername.isBlank() || password.isBlank()) {
                            message = "Username and password are required."
                            isErrorMessage = true
                            return@Button
                        }
                        val cachedUsername = prefs.getString(PREF_CACHED_USERNAME, "").orEmpty()
                        val cachedPassword = prefs.getString(PREF_CACHED_PASSWORD, "").orEmpty()
                        val cachedDisplayName = prefs.getString(PREF_CACHED_DISPLAY_NAME, "").orEmpty()
                        if (
                            cachedUsername.equals(cleanUsername, ignoreCase = true) &&
                            cachedPassword == password &&
                            cachedDisplayName.isNotBlank()
                        ) {
                            onLoggedIn(
                                MobileSession(
                                    username = cachedUsername,
                                    displayName = cachedDisplayName,
                                    syncUrl = cleanUrl
                                )
                            )
                            return@Button
                        }
                        isLoading = true
                        message = "Checking login..."
                        isErrorMessage = false
                        thread {
                            try {
                                val response = SyncClient(cleanUrl).login(cleanUsername, password)
                                val user = JSONObject(response).getJSONObject("user")
                                val session = MobileSession(
                                    username = user.getString("username"),
                                    displayName = user.getString("displayName"),
                                    syncUrl = cleanUrl
                                )
                                prefs.edit()
                                    .putString(PREF_CACHED_USERNAME, session.username)
                                    .putString(PREF_CACHED_PASSWORD, password)
                                    .putString(PREF_CACHED_DISPLAY_NAME, session.displayName)
                                    .apply()
                                activity?.runOnUiThread {
                                    isLoading = false
                                    message = ""
                                    isErrorMessage = false
                                    onLoggedIn(session)
                                }
                            } catch (error: Exception) {
                                activity?.runOnUiThread {
                                    isLoading = false
                                    val errorMessage = error.message.orEmpty()
                                    message = if (isConnectionError(errorMessage)) {
                                        "Failed to connect to Desktop App on ${desktopHost(cleanUrl)}. Login offline after one successful online login."
                                    } else {
                                        errorMessage.ifBlank { "Login failed." }
                                    }
                                    isErrorMessage = true
                                }
                            }
                        }
                    },
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = Brand),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(Modifier.width(10.dp))
                        }
                        Text(if (isLoading) "Logging in..." else "Login")
                    }
                }
                Spacer(Modifier.height(10.dp))
                TextButton(
                    onClick = {
                        val options = ScanOptions()
                            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            .setPrompt("Scan the Pair Tablet QR code from the office desktop")
                            .setBeepEnabled(false)
                            .setOrientationLocked(false)
                        scanLauncher.launch(options)
                    }
                ) {
                    Text("Pair / Change Server", color = BrandStrong)
                }
                Text(
                    message,
                    color = when {
                        message == "Checking login..." -> Muted
                        isErrorMessage -> Danger
                        else -> Success
                    },
                    minLines = 1
                )
            }
        }
    }
}


fun parseSyncUrl(rawContent: String): String? {
    val trimmed = rawContent.trim()
    val urlFromJson = runCatching {
        val payload = JSONObject(trimmed)
        if (payload.optString("type") != "kudamalana-tablet-sync") return@runCatching null
        payload.optString("syncUrl").takeIf { it.startsWith("http://") || it.startsWith("https://") }
    }.getOrNull()
    return urlFromJson ?: trimmed.takeIf { it.startsWith("http://") || it.startsWith("https://") }
}

fun desktopHost(syncUrl: String): String =
    runCatching { Uri.parse(syncUrl).host }.getOrNull() ?: syncUrl

fun isConnectionError(message: String): Boolean {
    val lower = message.lowercase()
    return "failed to connect" in lower ||
        "timeout" in lower ||
        "timed out" in lower ||
        "unable to resolve host" in lower ||
        "network is unreachable" in lower ||
        "connection refused" in lower ||
        "cleartext communication" in lower
}

fun parseSuppliers(masterDataJson: String): List<SupplierOption> {
    val payload = JSONObject(masterDataJson)
    val suppliers = payload.optJSONArray("suppliers") ?: return emptyList()
    return (0 until suppliers.length()).mapNotNull { index ->
        val supplier = suppliers.optJSONObject(index) ?: return@mapNotNull null
        SupplierOption(
            id = supplier.optString("id"),
            code = supplier.optString("code"),
            name = supplier.optString("name"),
            lineId = supplier.optString("lineId").takeIf { it.isNotBlank() },
            lineName = supplier.optString("lineName")
        )
    }.filter { it.id.isNotBlank() && it.code.isNotBlank() && it.name.isNotBlank() }
}

fun parseTeaLines(masterDataJson: String): List<TeaLineOption> {
    val payload = JSONObject(masterDataJson)
    val teaLines = payload.optJSONArray("teaLines") ?: return emptyList()
    return (0 until teaLines.length()).mapNotNull { index ->
        val line = teaLines.optJSONObject(index) ?: return@mapNotNull null
        TeaLineOption(
            id = line.optString("id"),
            name = line.optString("name")
        )
    }.filter { it.id.isNotBlank() && it.name.isNotBlank() }
}

fun SupplierOption.toEntity(): SupplierEntity =
    SupplierEntity(
        id = id,
        code = code,
        name = name,
        lineId = lineId,
        lineName = lineName,
        deductionEnabled = false,
        ownTransportAdditionEnabled = false,
        factoryTransportDeductionEnabled = false,
        active = true
    )

fun SupplierEntity.toOption(): SupplierOption =
    SupplierOption(
        id = id,
        code = code,
        name = name,
        lineId = lineId,
        lineName = lineName
    )

fun TeaLineOption.toEntity(): TeaLineEntity =
    TeaLineEntity(
        id = id,
        name = name,
        active = true
    )

fun TeaLineEntity.toOption(): TeaLineOption =
    TeaLineOption(
        id = id,
        name = name
    )

@Suppress("DEPRECATION")
fun bluetoothPrinterStatus(context: Context): Pair<Boolean, String> {
    return try {
        if (!hasBluetoothConnectPermission(context)) {
            return false to "Bluetooth permission is required. Tap Connect printer and allow Nearby devices."
        }
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return false to "Bluetooth is not available on this tablet"
        if (!adapter.isEnabled) return false to "Bluetooth is turned off"
        val printers = pairedPrinterCandidates(adapter)
        if (printers.isEmpty()) return false to "No paired Bluetooth printer found"
        val firstPrinter = printers.first()
        true to "Paired Bluetooth device found: ${firstPrinter.name ?: firstPrinter.address}. It will connect when printing starts."
    } catch (error: SecurityException) {
        false to "Bluetooth permission is required. Tap Connect printer and allow Nearby devices."
    }
}

fun hasBluetoothConnectPermission(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

@Suppress("DEPRECATION")
fun pairedPrinterCandidates(adapter: BluetoothAdapter): List<BluetoothDevice> {
    val pairedDevices = adapter.bondedDevices.orEmpty().toList()
    val preferred = pairedDevices.filter { device ->
        val name = device.name.orEmpty()
        RECEIPT_PRINTER_NAME_HINTS.any { hint -> name.contains(hint, ignoreCase = true) }
    }
    return preferred + pairedDevices.filterNot { device -> preferred.any { it.address == device.address } }
}

@Suppress("DEPRECATION")
fun printReceiptToBluetoothPrinter(context: Context, record: CollectionRecordEntity, printedAt: String): Pair<Boolean, String> {
    return try {
        if (!hasBluetoothConnectPermission(context)) {
            return false to "Bluetooth permission is required. Tap Connect printer and allow Nearby devices."
        }
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return false to "Bluetooth is not available on this tablet"
        if (!adapter.isEnabled) return false to "Bluetooth is turned off"
        val printers = pairedPrinterCandidates(adapter)
        if (printers.isEmpty()) return false to "No paired Bluetooth printer found"
        adapter.cancelDiscovery()
        val receiptBytes = EscPosReceiptFormatter().format(record, printedAt)
        val failures = mutableListOf<String>()
        for (printer in printers) {
            try {
                printer.createRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE_UUID).use { socket ->
                    socket.connect()
                    socket.outputStream.use { output ->
                        output.write(receiptBytes)
                        output.flush()
                    }
                }
                return true to "Receipt printed on ${printer.name ?: printer.address}."
            } catch (error: Exception) {
                failures += "${printer.name ?: printer.address}: ${error.message ?: "connection failed"}"
            }
        }
        false to "Print failed on paired Bluetooth devices: ${failures.joinToString("; ")}"
    } catch (error: Exception) {
        false to "Print failed: ${error.message ?: "Could not connect to a paired Bluetooth printer"}"
    }
}

@Composable
fun LoginFact(text: String) {
    Row(
        modifier = Modifier
            .width(320.dp)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Spacer(
            Modifier
                .width(3.dp)
                .height(22.dp)
                .background(Color(0xFFB8D4AE))
        )
        Text(text, color = Color(0xFFEEF6EC), modifier = Modifier.padding(start = 10.dp))
    }
}

@Composable
fun WorkspaceNavButton(
    label: String,
    view: String,
    activeView: String,
    onSelect: (String) -> Unit
) {
    val isActive = view == activeView
    Button(
        onClick = { onSelect(view) },
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isActive) Brand else Soft,
            contentColor = if (isActive) Color.White else BrandStrong
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(label)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectorWorkspace(session: MobileSession, onLogout: () -> Unit) {
    val context = LocalContext.current
    val activity = context as? Activity
    val focusManager = LocalFocusManager.current
    val supplierFocusRequester = remember { FocusRequester() }
    val bagsFocusRequester = remember { FocusRequester() }
    val grossFocusRequester = remember { FocusRequester() }
    val database = remember {
        Room.databaseBuilder(context, TeaDatabase::class.java, "tea_collector.db")
            .addMigrations(TeaDatabase.MIGRATION_1_2)
            .build()
    }
    fun activityRun(action: () -> Unit) {
        activity?.runOnUiThread(action)
    }
    var teaLineName by remember { mutableStateOf("") }
    var supplierName by remember { mutableStateOf("") }
    var bags by remember { mutableStateOf("") }
    var grossKg by remember { mutableStateOf("") }
    var teaLines by remember { mutableStateOf<List<TeaLineOption>>(emptyList()) }
    var suppliers by remember { mutableStateOf<List<SupplierOption>>(emptyList()) }
    var selectedTeaLine by remember { mutableStateOf<TeaLineOption?>(null) }
    var selectedSupplier by remember { mutableStateOf<SupplierOption?>(null) }
    var teaLineMenuExpanded by remember { mutableStateOf(false) }
    var supplierMenuExpanded by remember { mutableStateOf(false) }
    var unsyncedRecords by remember { mutableStateOf<List<CollectionRecordEntity>>(emptyList()) }
    var editingRecordId by remember { mutableStateOf<String?>(null) }
    var previewRecord by remember { mutableStateOf<CollectionRecordEntity?>(null) }
    var previewMode by remember { mutableStateOf("save") }
    var printerConnected by remember { mutableStateOf(false) }
    var printerStatus by remember { mutableStateOf("No Bluetooth printer connected") }
    var isPrinting by remember { mutableStateOf(false) }
    val bluetoothPermissionLauncher = rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val status = bluetoothPrinterStatus(context)
            printerConnected = status.first
            printerStatus = status.second
        } else {
            printerConnected = false
            printerStatus = "Bluetooth permission denied. Allow Nearby devices to use the paired receipt printer."
        }
    }
    var workspaceMessage by remember { mutableStateOf("") }
    var workspaceMessageIsError by remember { mutableStateOf(false) }
    var syncAction by remember { mutableStateOf<String?>(null) }
    var loadedLocalData by remember { mutableStateOf(false) }
    var activeWorkspaceView by remember { mutableStateOf("collection") }
    val filteredTeaLines = teaLines
        .filter { teaLineName.isBlank() || it.name.contains(teaLineName.trim(), ignoreCase = true) }
        .take(8)
    val suppliersForLine = suppliers.filter { supplier ->
        selectedTeaLine == null ||
            supplier.lineId == selectedTeaLine?.id ||
            supplier.lineName.equals(selectedTeaLine?.name.orEmpty(), ignoreCase = true)
    }
    val filteredSuppliers = suppliersForLine
        .filter {
            val query = supplierName.trim()
            query.isBlank() ||
                it.code.contains(query, ignoreCase = true) ||
                it.name.contains(query, ignoreCase = true)
        }
        .take(8)

    fun clearEntryForm() {
        teaLineName = ""
        supplierName = ""
        selectedTeaLine = null
        selectedSupplier = null
        bags = ""
        grossKg = ""
        editingRecordId = null
    }

    fun currentDateTime(): String = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))

    fun upsertPreviewRecord(printStatus: String, printedAt: String? = null) {
        val record = previewRecord ?: return
        val finalRecord = record.copy(printStatus = printStatus, printedAt = printedAt)
        thread {
            runBlocking { database.teaDao().insertCollection(finalRecord) }
        }
        unsyncedRecords = if (unsyncedRecords.any { it.id == finalRecord.id }) {
            unsyncedRecords.map { if (it.id == finalRecord.id) finalRecord else it }
        } else {
            unsyncedRecords + finalRecord
        }
        previewRecord = null
        clearEntryForm()
        workspaceMessage = if (printStatus == "printed") {
            "Collection saved and receipt printed."
        } else {
            "Collection saved without printing."
        }
        workspaceMessageIsError = false
    }

    fun markExistingRecordPrinted(record: CollectionRecordEntity, printedAt: String) {
        val printedRecord = record.copy(printStatus = "printed", printedAt = printedAt)
        thread {
            runBlocking { database.teaDao().updateCollection(printedRecord) }
        }
        unsyncedRecords = unsyncedRecords.map { if (it.id == printedRecord.id) printedRecord else it }
        previewRecord = null
        workspaceMessage = "Receipt printed for ${record.supplierName}."
        workspaceMessageIsError = false
    }

    if (!loadedLocalData) {
        loadedLocalData = true
        thread {
            val localLines = runBlocking { database.teaDao().teaLines() }.map { it.toOption() }
            val localSuppliers = runBlocking { database.teaDao().suppliers() }.map { it.toOption() }
            val localRecords = runBlocking { database.teaDao().unsyncedCollections() }
            activityRun {
                teaLines = localLines
                suppliers = localSuppliers
                unsyncedRecords = localRecords
            }
        }
    }

    previewRecord?.let { record ->
        val isPrintOnlyPreview = previewMode == "print"
        AlertDialog(
            onDismissRequest = { if (!isPrinting) previewRecord = null },
            title = { Text(if (isPrintOnlyPreview) "Print Saved Receipt" else "Receipt Preview") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (isPrintOnlyPreview) {
                        Text("This will print the saved receipt only. The collection record will not be saved again.", color = Muted)
                    }
                    Text("Printer status: $printerStatus", color = if (printerConnected) Success else Danger)
                    if (isPrinting) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Brand, strokeWidth = 2.dp)
                            Text("Printing receipt...", color = Muted)
                        }
                    }
                    Text("Supplier: ${record.supplierName}")
                    Text("Supplier code: ${record.supplierCode}")
                    Text("Tea line: ${record.lineName}")
                    Text("Date: ${record.collectionDate} ${record.collectionTime}")
                    Text("Bags: ${record.bagCount}")
                    Text("Gross kg: ${record.grossWeightKg}")
                    Text("Collected by: ${record.lineUserName}")
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (!printerConnected) {
                            if (isPrintOnlyPreview) {
                                printerStatus = "Printer is not connected. Use Connect printer or Check status before printing."
                                return@Button
                            }
                            upsertPreviewRecord("printer_not_connected")
                            return@Button
                        }
                        isPrinting = true
                        printerStatus = "Connecting to paired Bluetooth printer..."
                        val printedAt = currentDateTime()
                        thread {
                            val result = printReceiptToBluetoothPrinter(context, record, printedAt)
                            activityRun {
                                isPrinting = false
                                printerConnected = result.first
                                printerStatus = result.second
                                if (result.first) {
                                    if (isPrintOnlyPreview) {
                                        markExistingRecordPrinted(record, printedAt)
                                    } else {
                                        upsertPreviewRecord("printed", printedAt)
                                    }
                                }
                            }
                        }
                    },
                    enabled = !isPrinting && (!isPrintOnlyPreview || printerConnected),
                    colors = ButtonDefaults.buttonColors(containerColor = Brand)
                ) {
                        Text(
                            when {
                            isPrinting -> "Printing..."
                            isPrintOnlyPreview && printerConnected -> "Print receipt"
                            printerConnected -> "Save and print"
                            isPrintOnlyPreview -> "Connect printer first"
                            else -> "Save without print"
                        }
                    )
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                                ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
                            ) {
                                bluetoothPermissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
                            }
                            printerStatus = "Open Bluetooth settings and pair/select the receipt printer"
                            activity?.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
                        }
                    ) {
                        Text("Connect printer", color = BrandStrong)
                    }
                    TextButton(
                        onClick = {
                            val status = bluetoothPrinterStatus(context)
                            printerConnected = status.first
                            printerStatus = status.second
                        }
                    ) {
                        Text("Check status", color = BrandStrong)
                    }
                    TextButton(onClick = { previewRecord = null }) {
                        Text("Cancel", color = BrandStrong)
                    }
                }
            }
        )
    }

    Column(Modifier.fillMaxSize().background(Page)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BrandStrong)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                painter = painterResource(R.drawable.kudamalana_logo),
                contentDescription = "Kudamalana Tea Factory logo",
                modifier = Modifier.size(width = 64.dp, height = 48.dp),
                contentScale = ContentScale.Fit
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Kudamalana Tea Factory - Collector", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("Logged in: ${session.displayName}", color = Color(0xFFC7D8C4))
            }
            OutlinedButton(onClick = onLogout, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)) {
                Text("Logout")
            }
        }

        Row(Modifier.fillMaxSize().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Column(
                modifier = Modifier
                    .width(220.dp)
                    .fillMaxHeight()
                    .background(Panel, RoundedCornerShape(8.dp))
                    .border(1.dp, Line, RoundedCornerShape(8.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Tablet menu", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                WorkspaceNavButton("Tea Collection", "collection", activeWorkspaceView) { activeWorkspaceView = it }
                WorkspaceNavButton("Recorded Data", "records", activeWorkspaceView) { activeWorkspaceView = it }
                WorkspaceNavButton("Sync Data", "sync", activeWorkspaceView) { activeWorkspaceView = it }
                WorkspaceNavButton("Master Data", "master", activeWorkspaceView) { activeWorkspaceView = it }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
            if (activeWorkspaceView == "collection") {
            Card(
                modifier = Modifier.fillMaxSize(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Panel),
                border = BorderStroke(1.dp, Line)
            ) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .imePadding()
                        .verticalScroll(rememberScrollState())
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text("Tea Collector", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Text("Offline field collection", color = Muted)
                    ExposedDropdownMenuBox(
                        expanded = teaLineMenuExpanded,
                        onExpandedChange = { teaLineMenuExpanded = !teaLineMenuExpanded }
                    ) {
                        OutlinedTextField(
                            value = teaLineName,
                            onValueChange = {
                                teaLineName = it
                                selectedTeaLine = null
                                selectedSupplier = null
                                supplierName = ""
                                teaLineMenuExpanded = true
                            },
                            label = { Text("Tea line") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                            keyboardActions = KeyboardActions(onNext = { supplierFocusRequester.requestFocus() }),
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = teaLineMenuExpanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = teaLineMenuExpanded && filteredTeaLines.isNotEmpty(),
                            onDismissRequest = { teaLineMenuExpanded = false }
                        ) {
                            filteredTeaLines.forEach { line ->
                                DropdownMenuItem(
                                    text = { Text(line.name, color = Ink) },
                                    onClick = {
                                        selectedTeaLine = line
                                        teaLineName = line.name
                                        selectedSupplier = null
                                        supplierName = ""
                                        teaLineMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    ExposedDropdownMenuBox(
                        expanded = supplierMenuExpanded,
                        onExpandedChange = { supplierMenuExpanded = !supplierMenuExpanded }
                    ) {
                        OutlinedTextField(
                            value = supplierName,
                            onValueChange = {
                                supplierName = it
                                selectedSupplier = null
                                supplierMenuExpanded = true
                            },
                            label = { Text("Supplier name") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                            keyboardActions = KeyboardActions(onNext = { bagsFocusRequester.requestFocus() }),
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = supplierMenuExpanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                                .focusRequester(supplierFocusRequester)
                        )
                        ExposedDropdownMenu(
                            expanded = supplierMenuExpanded && filteredSuppliers.isNotEmpty(),
                            onDismissRequest = { supplierMenuExpanded = false }
                        ) {
                            filteredSuppliers.forEach { supplier ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(supplier.name, color = Ink)
                                            Text("${supplier.code} - ${supplier.lineName}", color = Muted, fontSize = 12.sp)
                                        }
                                    },
                                    onClick = {
                                        selectedSupplier = supplier
                                        supplierName = supplier.name
                                        supplierMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        bags,
                        { bags = it },
                        label = { Text("Bags") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { grossFocusRequester.requestFocus() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(bagsFocusRequester)
                    )
                    OutlinedTextField(
                        grossKg,
                        { grossKg = it },
                        label = { Text("Gross weight kg") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(grossFocusRequester)
                    )
                    Button(
                        onClick = {
                            val line = selectedTeaLine ?: teaLines.firstOrNull { it.name.equals(teaLineName.trim(), ignoreCase = true) }
                            val supplier = selectedSupplier ?: suppliersForLine.firstOrNull { it.name.equals(supplierName.trim(), ignoreCase = true) }
                            val bagCount = bags.trim().toIntOrNull()
                            val grossWeight = grossKg.trim().toDoubleOrNull()
                            if (line == null) {
                                workspaceMessage = "Select a tea line first."
                                workspaceMessageIsError = true
                                return@Button
                            }
                            if (supplier == null) {
                                workspaceMessage = "Select an active supplier from the selected tea line."
                                workspaceMessageIsError = true
                                return@Button
                            }
                            if (bagCount == null || bagCount <= 0 || grossWeight == null || grossWeight <= 0.0) {
                                workspaceMessage = "Enter valid bag count and gross weight."
                                workspaceMessageIsError = true
                                return@Button
                            }
                            val tabletSavedAt = currentDateTime()
                            val record = CollectionRecordEntity(
                                id = editingRecordId ?: "mobile_${UUID.randomUUID()}",
                                collectionDate = tabletSavedAt.substring(0, 10),
                                collectionTime = tabletSavedAt.substring(11),
                                lineId = supplier.lineId,
                                lineName = supplier.lineName,
                                supplierId = supplier.id,
                                supplierCode = supplier.code,
                                supplierName = supplier.name,
                                bagCount = bagCount,
                                grossWeightKg = grossWeight,
                                lineUserName = session.displayName,
                                printStatus = "preview",
                                tabletSavedAt = tabletSavedAt,
                                printedAt = null,
                                synced = false
                            )
                            val status = bluetoothPrinterStatus(context)
                            printerConnected = status.first
                            printerStatus = status.second
                            previewMode = "save"
                            previewRecord = record
                            workspaceMessage = ""
                            workspaceMessageIsError = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        Text(if (editingRecordId == null) "Save and print receipt" else "Preview updated receipt")
                    }
                    if (editingRecordId != null) {
                        TextButton(onClick = { clearEntryForm() }) {
                            Text("Cancel edit", color = BrandStrong)
                        }
                    }
                    Text(
                        workspaceMessage,
                        color = if (workspaceMessageIsError) Danger else Success,
                        minLines = 1
                    )
                }
            }
            }

            if (activeWorkspaceView == "sync") {
            Card(
                modifier = Modifier.fillMaxSize(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Panel),
                border = BorderStroke(1.dp, Line)
            ) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text("Sync", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Text("Connect this tablet to the office desktop over local Wi-Fi.", color = Muted)
                    Text("Tea lines loaded: ${teaLines.size}", color = Muted)
                    Text("Suppliers loaded: ${suppliers.size}", color = Muted)
                    Text("Unsynced collections: ${unsyncedRecords.size}", color = Muted)
                    Button(
                        onClick = {
                            syncAction = "download"
                            workspaceMessage = "Downloading master data..."
                            workspaceMessageIsError = false
                            thread {
                                try {
                                    val response = SyncClient(session.syncUrl).fetchMasterData()
                                    val downloadedTeaLines = parseTeaLines(response)
                                    val downloadedSuppliers = parseSuppliers(response)
                                    runBlocking {
                                        database.teaDao().upsertTeaLines(downloadedTeaLines.map { it.toEntity() })
                                        database.teaDao().upsertSuppliers(downloadedSuppliers.map { it.toEntity() })
                                    }
                                    activityRun {
                                        teaLines = downloadedTeaLines
                                        suppliers = downloadedSuppliers
                                        syncAction = null
                                        workspaceMessage = "Downloaded ${downloadedTeaLines.size} tea lines and ${downloadedSuppliers.size} suppliers."
                                        workspaceMessageIsError = false
                                        Toast.makeText(context, workspaceMessage, Toast.LENGTH_LONG).show()
                                    }
                                } catch (error: Exception) {
                                    activityRun {
                                        syncAction = null
                                        workspaceMessage = if (isConnectionError(error.message.orEmpty())) {
                                            "Failed to connect to Desktop App on ${desktopHost(session.syncUrl)}"
                                        } else {
                                            error.message ?: "Master data download failed."
                                        }
                                        workspaceMessageIsError = true
                                        Toast.makeText(context, workspaceMessage, Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        enabled = syncAction == null,
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        Text(if (syncAction == "download") "Downloading..." else "Download master data")
                    }
                    Button(
                        onClick = {
                            if (unsyncedRecords.isEmpty()) {
                                workspaceMessage = "There are no unsynced collections to upload."
                                workspaceMessageIsError = false
                                return@Button
                            }
                            syncAction = "upload"
                            workspaceMessage = "Uploading collections..."
                            workspaceMessageIsError = false
                            thread {
                                try {
                                    val uploadResponse = SyncClient(session.syncUrl).uploadCollections("tablet-collector", unsyncedRecords)
                                    val importedCount = JSONObject(uploadResponse).optJSONArray("imported")?.length() ?: 0
                                    val skippedCount = JSONObject(uploadResponse).optJSONArray("skipped")?.length() ?: 0
                                    runBlocking {
                                        unsyncedRecords.forEach { record ->
                                            database.teaDao().updateCollection(record.copy(synced = true))
                                        }
                                    }
                                    activityRun {
                                        unsyncedRecords = emptyList()
                                        syncAction = null
                                        workspaceMessage = "Upload complete: $importedCount imported, $skippedCount skipped."
                                        workspaceMessageIsError = false
                                        Toast.makeText(context, workspaceMessage, Toast.LENGTH_LONG).show()
                                    }
                                } catch (error: Exception) {
                                    activityRun {
                                        syncAction = null
                                        workspaceMessage = if (isConnectionError(error.message.orEmpty())) {
                                            "Failed to connect to Desktop App on ${desktopHost(session.syncUrl)}"
                                        } else {
                                            error.message ?: "Collection upload failed."
                                        }
                                        workspaceMessageIsError = true
                                        Toast.makeText(context, workspaceMessage, Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        enabled = syncAction == null,
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        Text(if (syncAction == "upload") "Uploading..." else "Upload unsynced collections")
                    }
                    Surface(color = Soft, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "This tablet connects to the configured office sync server on the local Wi-Fi network.",
                            color = BrandStrong,
                            modifier = Modifier.padding(14.dp)
                        )
                    }
                }
            }
            }
            if (activeWorkspaceView == "records") {
                Card(
                    modifier = Modifier.fillMaxSize(),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = Panel),
                    border = BorderStroke(1.dp, Line)
                ) {
                    Column(
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Recorded Data", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
                        Text("View and edit saved tablet records before upload.", color = Muted)
                        if (unsyncedRecords.isEmpty()) {
                            Surface(color = Soft, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Text("No saved records on this tablet.", color = Muted, modifier = Modifier.padding(14.dp))
                            }
                        }
                        unsyncedRecords.forEach { record ->
                            Surface(
                                color = Soft,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(record.supplierName, color = Ink, fontWeight = FontWeight.Bold)
                                        Text("${record.lineName} | ${record.collectionDate} ${record.collectionTime}", color = Muted, fontSize = 12.sp)
                                        Text("Bags ${record.bagCount} | Gross ${record.grossWeightKg} kg | ${record.printStatus}", color = Muted, fontSize = 12.sp)
                                    }
                                    TextButton(
                                        onClick = {
                                            val status = bluetoothPrinterStatus(context)
                                            printerConnected = status.first
                                            printerStatus = status.second
                                            previewMode = "print"
                                            previewRecord = record
                                        }
                                    ) {
                                        Text("Print", color = BrandStrong)
                                    }
                                    TextButton(
                                        onClick = {
                                            val line = teaLines.firstOrNull {
                                                it.id == record.lineId || it.name.equals(record.lineName, ignoreCase = true)
                                            }
                                            val supplier = suppliers.firstOrNull { it.id == record.supplierId }
                                            selectedTeaLine = line
                                            teaLineName = record.lineName
                                            selectedSupplier = supplier
                                            supplierName = record.supplierName
                                            bags = record.bagCount.toString()
                                            grossKg = record.grossWeightKg.toString()
                                            editingRecordId = record.id
                                            activeWorkspaceView = "collection"
                                            workspaceMessage = "Editing saved collection for ${record.supplierName}."
                                            workspaceMessageIsError = false
                                        }
                                    ) {
                                        Text("Edit", color = BrandStrong)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (activeWorkspaceView == "master") {
                Card(
                    modifier = Modifier.fillMaxSize(),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = Panel),
                    border = BorderStroke(1.dp, Line)
                ) {
                    Column(
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text("Synced Master Data", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
                        Text("Master data downloaded from the desktop app and available for offline collection.", color = Muted)
                        Surface(color = Soft, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Tea Lines", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
                                Text("${teaLines.size} active tea lines synced", color = Muted, fontSize = 12.sp)
                                teaLines.forEach { line ->
                                    Surface(color = Panel, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        Text(line.name, color = Ink, modifier = Modifier.padding(12.dp))
                                    }
                                }
                            }
                        }

                        Surface(color = Soft, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Active Suppliers", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
                                Text("${suppliers.size} active suppliers synced", color = Muted, fontSize = 12.sp)
                                suppliers.forEach { supplier ->
                                    Surface(color = Panel, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        Column(Modifier.padding(12.dp)) {
                                            Text(supplier.name, color = Ink, fontWeight = FontWeight.Bold)
                                            Text("${supplier.code} | ${supplier.lineName}", color = Muted, fontSize = 12.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}}
