import SwiftUI
import UniformTypeIdentifiers

struct StorageView: View {
    //@EnvironmentObject private var detector: Accelerometer

    @State var maxStorageNumber = UserDefaults.standard.integer(forKey: "storage_number")
    @State var isSharing = false
    @State var sharingContent = ""
    @State var listData : [String] = []
    func updateListData () {
        print(Date.now.description)
        listData = []
        var i = maxStorageNumber-1
        while (i >= 1) {
            listData.append("storage_"+String(i))
            i -= 1
        }
    }
    
    var body: some View {
        VStack {
            Spacer()
            List (listData, id: \.self) { data in
                DisclosureGroup(data) {
                    Button {
                        UIPasteboard.general.string = UserDefaults.standard.string(forKey: data)
                        print(listData)
                    } label: {
                        Label("Copy", systemImage: "document.on.document")
                    }   
                    .buttonStyle(.borderless)
                    Button {
                        sharingContent = UserDefaults.standard.string(forKey: data) ?? ""
                        isSharing = true
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }   
                    .buttonStyle(.borderless)
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
            ShareTextSheet(text: sharingContent)
        }
    }
}
struct ShareTextSheet: UIViewControllerRepresentable {
    let text: String
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let activityVC = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        return activityVC
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
