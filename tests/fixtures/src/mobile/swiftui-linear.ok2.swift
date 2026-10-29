import SwiftUI

struct Spinner: View {
    @State private var angle = 0.0
    var body: some View {
        Circle()
            .trim(from: 0, to: 0.7)
            .rotationEffect(.degrees(angle))
            .onAppear {
                withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { angle = 360 }
            }
    }
}
