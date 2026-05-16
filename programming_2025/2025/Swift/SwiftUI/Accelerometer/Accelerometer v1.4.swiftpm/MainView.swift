import SwiftUI

struct MainView: View {
    //@AppStorage("graphFPS") var accelerometerFPS : Double = 60
    //var accelerometer = Accelerometer(interval: UserDefaults.standard.double(forKey: "graphFPS") ?? 60.0)
    var accelerometer = Accelerometer(interval: (1000/60)/1000)
    var pageSwitchEnabled = true
    @State private var pageSelection = page.record 
    enum page {
        case record, storage, settings, graph
    }
    var body: some View {
        VStack {
            Text("\nAccelerometer").font(.custom("large",size:50))
            Text("version 1.4").font(.custom("small",size:15))
            Text("\n")
            Picker("Page selector", selection: $pageSelection) {
                Text("Record").tag(page.record)
                Text("Storage").tag(page.storage)
                Text("Graph").tag(page.graph)
                Text("Settings").tag(page.settings)
            }
            .pickerStyle(.palette)
            
            switch pageSelection {
            case page.storage: StorageView()
            case page.record: DataRecorder()
            case page.settings: SettingsView()
            case page.graph: GraphView()
            }
        }
        .environmentObject(accelerometer)
        .onAppear(perform: {
            accelerometer.start()
        })
    }
}


