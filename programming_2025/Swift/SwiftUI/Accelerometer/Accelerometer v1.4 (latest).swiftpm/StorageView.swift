import SwiftUI
import UniformTypeIdentifiers


struct StorageView: View {
    @State var maxStorageNumber = UserDefaults.standard.integer(forKey: "storage_number")
    @State var isSharing = false
    @State var sharingContent = ""
    @State var listData : [String] = []
    func updateListData () {
        listData = []
        var i = maxStorageNumber-1
        while (i >= 1) {
            listData.append(String(i))
            i -= 1
        }
    }
    
    var body: some View {
        VStack {
            Spacer()
            List (listData, id: \.self) { data in
                let dataDate = UserDefaults.standard.string(forKey: "date_\(data)") ?? "Unknown date"
                let dataFPS = String(UserDefaults.standard.double(forKey: "graphFPS_\(data)")) 
                let storageData = UserDefaults.standard.string(forKey: "storage_\(data)")
                DisclosureGroup("storage_\(data) (\(dataDate), \(dataFPS) fps)") {
                    Button {
                        UIPasteboard.general.string = storageData
                    } label: {
                        Label("Copy", systemImage: "document.on.document")
                    }
                    
                    Button {
                        if let possibleSharingContent = storageData {
                            sharingContent = possibleSharingContent
                            isSharing = true
                        }
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                }
            }
            Button {
                UIPasteboard.general.string = UserDefaults.standard.dictionaryRepresentation().description
            } label: {
                Label("Copy all data", systemImage: "document.on.document")
            }
            .buttonStyle(.bordered)
            Spacer()
            Button {
                sharingContent = UserDefaults.standard.dictionaryRepresentation().description
                isSharing = true
            } label: {
                Label("Share all data", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)
        }
        .onAppear(perform: {
            updateListData()
        })
        .sheet(isPresented: $isSharing) {   
            ShareTextSheet(text: $sharingContent)
        }
    }
}
struct ShareTextSheet: UIViewControllerRepresentable {
    let text: Binding<String>
    func makeUIViewController(context: Context) -> UIActivityViewController { 
        return UIActivityViewController(activityItems: [text.wrappedValue], applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

