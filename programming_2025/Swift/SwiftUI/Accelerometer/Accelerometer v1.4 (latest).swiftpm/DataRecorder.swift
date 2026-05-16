import SwiftUI
import UniformTypeIdentifiers

struct DataRecorder: View {
    @EnvironmentObject var accelerometer: Accelerometer
    
    @State var accelerometerFPS : Double = UserDefaults.standard.double(forKey: "graphFPS")
    
    @State var fpsCounterStartDate = Date()
    var greenButtonColor = Color(UIColor { (traits) -> UIColor in
        return traits.userInterfaceStyle == .dark ? UIColor.green : UIColor(red:0.35,green:0.95,blue:0.35,alpha:1)
    })
    @State var buttonColor = Color.green
    @State var buttonText = "START"
    @State var recordData = false
    
    @State var maxStorageNumber = UserDefaults.standard.integer(forKey: "storage_number")
    @State var logContent = ""
    @State var logCount = 0 
    
    @State var avgFPS = UserDefaults.standard.double(forKey: "graphFPS")
    
    @State var fpsUpdateInterval = 10
    @State var logUpdateInterval = 100
    func startDataRecord() {
        UserDefaults.standard.setValue(maxStorageNumber+1,forKey:"storage_number")
        UserDefaults.standard.setValue(Date().formatted(date: .abbreviated, time: .complete),forKey:"date_"+String(maxStorageNumber))
        UserDefaults.standard.setValue(accelerometerFPS,forKey:"graphFPS_"+String(maxStorageNumber))
        logContent = ""
        logCount = 0
        
        fpsCounterStartDate = Date()
    }
    func stopDataRecord() {
        UserDefaults.standard.setValue(logContent,forKey:"storage_"+String(maxStorageNumber))
        maxStorageNumber += 1
        UserDefaults.standard.setValue(round(avgFPS*10)/10,forKey:"graphFPS_"+String(maxStorageNumber))
        avgFPS = accelerometerFPS
    }
    var body: some View {
        VStack {
            Spacer()
            Button(buttonText) {
                if recordData {
                    buttonText = "START"
                    recordData = false
                    stopDataRecord()
                    buttonColor = greenButtonColor
                } else {
                    buttonText = "STOP "
                    recordData = true
                    startDataRecord()
                    buttonColor = Color.red
                }
            }
            .padding(25)
            .background(buttonColor)
            .clipShape(Capsule())
            .foregroundStyle(Color(red:0,green:0,blue:0))
            .font(.custom("testfont",size:40))
            Text("Saving to storage_\(maxStorageNumber)")
            Text("Data points: \(logCount)")
            Text("FPS: \(avgFPS)")
            Spacer()
        }
        .onAppear {
            accelerometerFPS = UserDefaults.standard.double(forKey: "graphFPS")
            if accelerometerFPS == 0 {
                accelerometerFPS = 120
                avgFPS = 120
            }
             
            if maxStorageNumber == 0 {
                maxStorageNumber = 1
            }
            buttonColor = greenButtonColor
            accelerometer.onUpdate = {
                if recordData {
                    let a = accelerometer
                    logContent += "\(a.xGrav) \(a.yGrav) \(a.zGrav) \(a.pitch) \(a.yaw) \(a.roll) \(a.xAccel) \(a.yAccel) \(a.zAccel) \(a.xRot) \(a.yRot) \(a.zRot) \(a.qW) \(a.qX) \(a.qY) \(a.qZ)\n"
                    logCount += 1
                }
                if recordData && logCount % logUpdateInterval == 0 {
                    UserDefaults.standard.setValue(logContent,forKey:"storage_"+String(maxStorageNumber))
                }
                if recordData && logCount % fpsUpdateInterval == 0 {
                    avgFPS = Double(logCount) / -fpsCounterStartDate.timeIntervalSinceNow
                    fpsUpdateInterval = Int(avgFPS)
                    UserDefaults.standard.setValue(avgFPS,forKey:"graphFPS_"+String(maxStorageNumber))
                }
            }
        }
    }
}

