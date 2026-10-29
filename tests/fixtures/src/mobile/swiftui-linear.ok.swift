import SwiftUI

struct Loading: View {
    @State private var progress = 0.0
    var body: some View {
        ProgressView(value: progress)
            .animation(.linear(duration: 0.2), value: progress)
    }
}
