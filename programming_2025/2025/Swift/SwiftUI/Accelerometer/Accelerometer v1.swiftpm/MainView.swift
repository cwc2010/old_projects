import SwiftUI

struct MainView: View {
 var accelerometer = Accelerometer(interval: (1000/60)/1000)
    @State private var pageSelection = page.record 
    enum page {
        case record, storage
    }
    var body: some View {
        VStack {
            Text("\nAccelerometer").font(.custom("large",size:50))
            Text("version 1.0").font(.custom("small",size:15))
            Text("\n")
            Picker("Page selector", selection: $pageSelection) {
                Text("Record").tag(page.record)
                Text("Storage ").tag(page.storage)
            }
            .pickerStyle(.palette)
            switch pageSelection {
                case page.record: DataRecorder()
                case page.storage: StorageView()
             }
        }
        .environmentObject(accelerometer)
        .onAppear(perform: {
            accelerometer.start()
        })
    }
}
