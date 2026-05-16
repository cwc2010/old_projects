import SwiftUI
import UniformTypeIdentifiers
import Charts

struct GraphView: View {
    @EnvironmentObject var accelerometer: Accelerometer
    
    @State var recordChartData = true
    @State var optionsShown = false
    @State var maxChartData = 100
    @State var dataPoints = 0
    
    @State var shownData : [Bool] = [
        true, true, true,
        false, false, false,
        false, false, false,
        false, false, false,
        false, false, false, false
    ]
    let dataNames = [
        "x gravity",
        "y gravity",
        "z gravity",
        
        "pitch(z)",
        "yaw(x)",
        "roll(y)",
        
        "x acceleration",
        "y acceleration",
        "z acceleration",
        
        "x rotation change",
        "y rotation change",
        "z rotation change",
        
        "quaternion W",
        "quaternion X",
        "quaternion Y",
        "quaternion Z"
    ]
    @State var dataSeries : [[Double]] = [
        [],[],[],
        [],[],[],
        [],[],[],
        [],[],[],
        [],[],[],[]
    ]
    let dataColors = [
        Color(red:1,green:0,blue:0),
        Color(red:0,green:1,blue:0),
        Color(red:0,green:0,blue:1),
        Color(red:1,green:1,blue:0),
        Color(red:1,green:0,blue:1),
        Color(red:0,green:1,blue:1),
        Color(red:1,green:0.5,blue:0),
        Color(red:0.5,green:1,blue:0),
        Color(red:0.5,green:0,blue:1),
        Color(red:1,green:1,blue:1),
        Color(red:1,green:0.5,blue:1),
        Color(red:0.5,green:0.5,blue:1),
        
        Color(red:0.33,green:0.5,blue:0.5),
        Color(red:0.67,green:0.5,blue:0.5),
        Color(red:0.33,green:0.33,blue:1),
        Color(red:0.67,green:0.33,blue:1),
    ]
    var body: some View {
        VStack { 
            HStack {
                Spacer()
                Button ("", systemImage: "gear") {
                    optionsShown = !optionsShown
                }
            }
            Spacer()
            if optionsShown {
                List {
                    ForEach(shownData.indices, id: \.self) { i in
                        Toggle(isOn: $shownData[i]) {
                            Text(dataNames[i])
                        }
                        .tint(.green)
                        
                    }
                    .onChange(of: shownData) {
                        UserDefaults.standard.setValue(shownData, forKey: "graphLinesShown")
                    }
                }
            } else {
                Chart (dataSeries.indices, id: \.self) { i in
                    let data = dataSeries[i]
                    let color = dataColors[i]
                    let indices = data.indices
                    if shownData[i] {
                        ForEach(indices, id: \.self) {j in
                            LineMark(
                                x: .value("x",Double(j)),
                                y: .value("y",data[j]),
                                series: .value("s",i)
                            )
                            .foregroundStyle(color)
                        }
                    }
                }
                .chartXScale(domain: 0...maxChartData)
            }
        }.padding(30)
        Spacer()
        
            .onAppear {
                if let graphLinesShown = UserDefaults.standard.array(forKey: "graphLinesShown") as? [Bool] {
                    shownData = graphLinesShown
                }
                
                accelerometer.onUpdate = {
                    if recordChartData {
                        dataSeries[0].append(accelerometer.xGrav)
                        dataSeries[1].append(accelerometer.yGrav)
                        dataSeries[2].append(accelerometer.zGrav)
                        dataSeries[3].append(accelerometer.pitch)
                        dataSeries[4].append(accelerometer.yaw)
                        dataSeries[5].append(accelerometer.roll)
                        dataSeries[6].append(accelerometer.xAccel)
                        dataSeries[7].append(accelerometer.yAccel)
                        dataSeries[8].append(accelerometer.zAccel)
                        dataSeries[9].append(accelerometer.xRot)
                        dataSeries[10].append(accelerometer.yRot)
                        dataSeries[11].append(accelerometer.zRot)
                        
                         dataSeries[12].append(accelerometer.qW)
                         dataSeries[13].append(accelerometer.qX)
                         dataSeries[14].append(accelerometer.qY)
                         dataSeries[15].append(accelerometer.qZ)
                        
                        
                        
                        dataPoints += 1
                        if dataPoints > maxChartData {
                            dataPoints -= 1
                            var i = 0
                            while i <= 15 {
                                dataSeries[i].removeFirst()
                                i += 1
                            }
                        }
                    }
                }
            }
    }
}

