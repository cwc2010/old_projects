import SwiftUI
import UniformTypeIdentifiers

struct DataRecorder: View {
    
    @EnvironmentObject private var accelerometer: Accelerometer
    @State var buttonText = "START"
    @State var recordData = false

    @State var maxStorageNumber = UserDefaults.standard.integer(forKey: "storage_number")
    @State var logContent = ""
    @State var logCount = 0
    @State var buttonColor = Color(red: 0.58,green:1,blue:0.58)
    func startDataRecord() {
        UserDefaults.standard.setValue(maxStorageNumber+1,forKey:"storage_number")
        
        logContent = ""
        logCount = 0
    }
    func stopDataRecord() {
        maxStorageNumber += 1
        UserDefaults.standard.setValue(logContent,forKey:"storage_"+String(maxStorageNumber))
    }
    var body: some View {
        VStack {
            Spacer()
            Button(buttonText) {
                if recordData {
                    buttonText = "START"
                    recordData = false
                    stopDataRecord()
                    buttonColor = Color(red: 0.58,green:1,blue:0.58)
                } else {
                    buttonText = "STOP "
                    recordData = true
                    startDataRecord()
                    buttonColor = Color(red: 1,green:0.35,blue:0.35)
                }
            }
            .padding(25)
            .background(buttonColor)
            .clipShape(Capsule())
            .foregroundStyle(Color(red:0,green:0,blue:0))
            .font(.custom("",size:40))
            Text("Saving to storage_\(maxStorageNumber)")
            Text("Data points: \(logCount)")
            Spacer()
        }
        .onAppear {
            // this part of the code crashes the whole script
            //*
            accelerometer.onUpdate = {
                if recordData {
                    logContent += "\(accelerometer.xGrav) \(accelerometer.yGrav) \(accelerometer.zGrav) \(accelerometer.pitch) \(accelerometer.yaw) \(accelerometer.roll) \(accelerometer.xAccel) \(accelerometer.yAccel) \(accelerometer.zAccel) \(accelerometer.xRot) \(accelerometer.yRot) \(accelerometer.zRot)\n"
                    logCount += 1
                }
                if recordData && logCount % 60 == 0 {
                    UserDefaults.standard.setValue(logContent,forKey:"storage_"+String(maxStorageNumber+1))
                }
            }//*/
        }
    }
}
