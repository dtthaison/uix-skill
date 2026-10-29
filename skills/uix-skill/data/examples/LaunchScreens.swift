import SwiftUI

// Test hook: `-screen home|product|bag` opens a screen, `-seed` pre-fills state.
// Launch with: xcrun simctl launch <udid> <bundle id> -screen bag -seed
// Do not name your enum `Tab`: it hides SwiftUI.Tab.
enum AppTab: Hashable { case home, bag }

struct RootView: View {
    @Environment(Bag.self) var bag            // <your shared model>
    @State private var tab: AppTab = .home
    @State private var path: [Product] = []   // <your pushed items>

    var body: some View {
        TabView(selection: $tab) {
            Tab("Home", systemImage: "house", value: AppTab.home) {
                NavigationStack(path: $path) {
                    HomeView().navigationDestination(for: Product.self) { ProductView(product: $0) }
                }
            }
            Tab("Bag", systemImage: "bag", value: AppTab.bag) { NavigationStack { BagView() } }
        }
        .onAppear(perform: applyLaunchArgs)
    }

    func applyLaunchArgs() {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-screen"), i + 1 < a.count else { return }
        if a.contains("-seed") { bag.seed() }  // <fill the state the screen needs>
        switch a[i + 1] {
        case "product": path = [Product.all[0]]
        case "bag": tab = .bag
        default: break
        }
    }
}
