import SwiftUI

struct MainView: View {
    var accelerometer = Accelerometer(interval: (1000/60)/1000)
    var pageSwitchEnabled = true
    @State private var pageSelection = page.record 
    enum page {
        case record, storage, settings
    }
    var body: some View {
        VStack {
            Text("\nAccelerometer").font(.custom("large",size:50))
            Text("version 1.1").font(.custom("small",size:15))
            Text("\n")
            Picker("Page selector", selection: $pageSelection) {
                Text("Record").tag(page.record)
                Text("Storage").tag(page.storage)
                Text("Settings").tag(page.settings)
            }
            .pickerStyle(.palette)
            // make is so that when you record data, you can't switch pages OR keep recording in background
            switch pageSelection {
                case page.storage: StorageView()
                case page.record: DataRecorder()
            case page.settings: SettingsView()
             }
        }
        .environmentObject(accelerometer)
        .onAppear(perform: {
            accelerometer.start()
        })
    }
}

