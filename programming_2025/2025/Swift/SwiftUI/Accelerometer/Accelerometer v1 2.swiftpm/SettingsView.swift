import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @State var pickers = 0
    @State var deleteButtonDisabled = true
    @State var alertShown = false
    @State var confirmationText = "6G;OX\"SVC9"
    let allKeys = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM"//"~!@#$%^&*()_+`1234567890-=QWERTYUIOP{}|qwertyuiop[]\\ASDFGHJKL:\"asdfghjkl;'ZXCVBNM<>?zxcvbnm,./"
    @State var textFieldData = ""
    @State var deletedAlertShown = false
    func generateConfirmationText() -> String {
        var string = ""
        var i = 0
        while (i < 15) {
            if let randomElement = allKeys.randomElement() {
                string = string + String(randomElement)
            }
            i += 1
        }
        return string
    }
    func CONFIRM_DELETION_OF_ALL_USERDEFAULTS_DATA_779849382161524503() {
        let keys = UserDefaults.standard.dictionaryRepresentation().keys
        for key in keys {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
    var body: some View {
        DisclosureGroup("Delete all data in app") {
            Text("Enter code: " + confirmationText)
                .onAppear {
                    confirmationText = generateConfirmationText()
                    textFieldData = ""
                }
            TextField(confirmationText, text: $textFieldData).tint(.blue)
            Button("Delete All Data") { 
                textFieldData = ""
                alertShown = true
            }
            .disabled(confirmationText != textFieldData)
            .buttonStyle(.borderedProminent)
            .tint(Color(red:1,green:0,blue:0))
            .alert("Confirm Deletion", isPresented: $alertShown) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    CONFIRM_DELETION_OF_ALL_USERDEFAULTS_DATA_779849382161524503()
                    deletedAlertShown = true
                }
            } message: {
                Text("This action cannot be undone")
            }
            .alert("All data successfully deleted", isPresented: $deletedAlertShown) {}
        }
        .tint(.red)
        .multilineTextAlignment(.center)
        Spacer()
        
    }
}

