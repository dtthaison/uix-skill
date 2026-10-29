import androidx.compose.animation.core.*

@Composable
fun Panel(open: Boolean) {
    val h by animateDpAsState(
        if (open) 240.dp else 120.dp,
        animationSpec = tween(300, easing = LinearEasing) // FIRES
    )
}
