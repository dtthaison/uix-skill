import SwiftUI

struct Title: View {
    var body: some View {
        VStack {
            Text("Welcome").font(Font.custom("Fraunces", size: 28, relativeTo: .title))
            Text("Body").font(.system(.body))
        }
    }
}
