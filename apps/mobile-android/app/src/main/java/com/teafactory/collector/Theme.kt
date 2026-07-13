package com.teafactory.collector

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Ink = Color(0xFF172116)
val Muted = Color(0xFF62705F)
val Line = Color(0xFFDCE3D8)
val Panel = Color(0xFFFFFFFF)
val Soft = Color(0xFFEEF3EB)
val Page = Color(0xFFF6F7F4)
val Brand = Color(0xFF1F5F36)
val BrandStrong = Color(0xFF17351F)
val Accent = Color(0xFFB9862C)
val Success = Color(0xFF1F5F36)
val Danger = Color(0xFF8A241F)

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
