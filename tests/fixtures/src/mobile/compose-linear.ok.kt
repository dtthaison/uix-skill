import androidx.compose.animation.core.*

@Composable
fun Spinner() {
    val t = rememberInfiniteTransition()
    val angle by t.animateFloat(
        0f, 360f,
        infiniteRepeatable(
            animation = tween(900, easing = LinearEasing)
        )
    )
}
