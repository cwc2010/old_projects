import CoreMotion
import UIKit

class Accelerometer: ObservableObject {
    var onUpdate: (() -> Void) = {}
    var interval: TimeInterval
    
    
    let cmotion = CMMotionManager()
    var timer = Timer()
    
    
    @Published var pitch: Double = 0
    @Published var yaw: Double = 0
    @Published var roll: Double = 0
    @Published var xAccel: Double = 0
    @Published var yAccel: Double = 0
    @Published var zAccel: Double = 0
    @Published var xGrav: Double = 0
    @Published var yGrav: Double = 0
    @Published var zGrav: Double = 0
    @Published var xRot: Double = 0
    @Published var yRot: Double = 0
    @Published var zRot: Double = 0
    
    
    init(interval: TimeInterval) {
        self.interval = interval
    }
    
    func start() {
        cmotion.startDeviceMotionUpdates()

        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                self?.updateData()
        }
    }
    
    func stop() {
        cmotion.stopDeviceMotionUpdates()
        timer.invalidate()
    }
    
    func updateData() {
        if let data = cmotion.deviceMotion {
            pitch = data.attitude.pitch
            yaw = data.attitude.yaw
            roll = data.attitude.roll
            xAccel = data.userAcceleration.x
            yAccel = data.userAcceleration.y
            zAccel = data.userAcceleration.z
            xGrav = data.gravity.x
            yGrav = data.gravity.y
            zGrav = data.gravity.z
            xRot = data.rotationRate.x
            yRot = data.rotationRate.y
            zRot = data.rotationRate.z
        }
        onUpdate()
    }
    
    deinit {
        stop()
    }
}
