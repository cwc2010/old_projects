import SwiftUI

@main
struct MainApp: App {
    var body: some Scene {
        WindowGroup {
            MainView().tint(Color.appearance)
        }
    }
}
extension Color {
    static var appearance: Color {
        return Color(UIColor { (traits) -> UIColor in
            return traits.userInterfaceStyle == .dark ? UIColor.white : UIColor.black
        })
    }
}
