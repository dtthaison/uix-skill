import SwiftUI

struct Card: View {
    @State private var open = false
    var body: some View {
        RoundedRectangle(cornerRadius: 16)
            .frame(height: open ? 240 : 120)
            .animation(.linear(duration: 0.3), value: open) // FIRES
            .onTapGesture { open.toggle() }
    }
}
