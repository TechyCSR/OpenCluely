import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation

// High-performance, stealth system audio recorder for macOS.
// On macOS 14.2+, uses CoreAudio Process Tap + Aggregate Device:
// - Bypasses ScreenCaptureKit entirely
// - Does NOT trigger the macOS menu bar recording indicator (orange/purple dot)
// - Streams 16kHz mono 16-bit signed integer PCM to stdout for Whisper

class CoreAudioTapCapture {
    private var tapID: AudioObjectID = 0
    private var aggregateDeviceID: AudioObjectID = 0
    private var ioProcID: AudioDeviceIOProcID? = nil
    private var isRunning = false
    private let sampleRate: Double = 16000.0
    
    // Resampling state
    private var inSampleRate: Double = 48000.0
    private var inChannels: Int = 2
    private var resamplePos: Double = 0.0
    
    func start() -> Bool {
        if #available(macOS 14.2, *) {
            let tapUUID = UUID()
            let tapDesc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
            tapDesc.uuid = tapUUID
            tapDesc.isPrivate = true
            
            var status = AudioHardwareCreateProcessTap(tapDesc, &tapID)
            guard status == noErr else {
                fputs("[SYSTEM_AUDIO_ERROR] AudioHardwareCreateProcessTap failed with code \(status)\n", stderr)
                fflush(stderr)
                return false
            }
            
            let aggregateDescription: [String: Any] = [
                kAudioAggregateDeviceNameKey: "OpenCluelySystemAudioTap",
                kAudioAggregateDeviceUIDKey: "com.cluely.tap.\(UUID().uuidString)",
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceIsStackedKey: false,
                kAudioAggregateDeviceTapAutoStartKey: true,
                kAudioAggregateDeviceTapListKey: [
                    [
                        kAudioSubTapUIDKey: tapUUID.uuidString,
                        kAudioSubTapDriftCompensationKey: true
                    ]
                ]
            ]
            
            status = AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &aggregateDeviceID)
            guard status == noErr else {
                fputs("[SYSTEM_AUDIO_ERROR] AudioHardwareCreateAggregateDevice failed with code \(status)\n", stderr)
                fflush(stderr)
                AudioHardwareDestroyProcessTap(tapID)
                return false
            }
            
            // Query actual stream format
            var propertyAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyStreamFormat,
                mScope: kAudioDevicePropertyScopeInput,
                mElement: kAudioObjectPropertyElementMain
            )
            var asbd = AudioStreamBasicDescription()
            var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            status = AudioObjectGetPropertyData(aggregateDeviceID, &propertyAddress, 0, nil, &size, &asbd)
            if status == noErr && asbd.mSampleRate > 0 {
                self.inSampleRate = asbd.mSampleRate
                self.inChannels = Int(asbd.mChannelsPerFrame)
            }
            
            let selfPointer = Unmanaged.passUnretained(self).toOpaque()
            
            let ioCallback: AudioDeviceIOProc = { (deviceID, now, inInputData, inInputTime, outOutputData, inOutputTime, clientData) -> OSStatus in
                guard let clientData = clientData else { return noErr }
                let capturer = Unmanaged<CoreAudioTapCapture>.fromOpaque(clientData).takeUnretainedValue()
                capturer.processAudioBuffer(inInputData)
                return noErr
            }
            
            status = AudioDeviceCreateIOProcID(aggregateDeviceID, ioCallback, selfPointer, &ioProcID)
            guard status == noErr, let procID = ioProcID else {
                fputs("[SYSTEM_AUDIO_ERROR] AudioDeviceCreateIOProcID failed with code \(status)\n", stderr)
                fflush(stderr)
                self.cleanup()
                return false
            }
            
            status = AudioDeviceStart(aggregateDeviceID, procID)
            guard status == noErr else {
                fputs("[SYSTEM_AUDIO_ERROR] AudioDeviceStart failed with code \(status)\n", stderr)
                fflush(stderr)
                self.cleanup()
                return false
            }
            
            self.isRunning = true
            fputs("[SYSTEM_AUDIO_READY]\n", stderr)
            fflush(stderr)
            return true
        } else {
            fputs("[SYSTEM_AUDIO_ERROR] macOS 14.2 or newer required for CoreAudio Process Tap\n", stderr)
            fflush(stderr)
            return false
        }
    }
    
    // Pre-allocated scratch buffers to guarantee zero heap allocations in the realtime audio thread
    private var monoBuffer = [Float]()
    private var outBuffer = [Int16]()
    
    private func processAudioBuffer(_ inInputData: UnsafePointer<AudioBufferList>) {
        guard isRunning else { return }
        let bufferList = inInputData.pointee
        guard bufferList.mNumberBuffers > 0 else { return }
        
        let buffer = bufferList.mBuffers
        guard let mData = buffer.mData, buffer.mDataByteSize > 0 else { return }
        
        let floatCount = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
        let channels = max(1, self.inChannels)
        let totalFrames = floatCount / channels
        guard totalFrames > 0 else { return }
        
        let floatPtr = mData.bindMemory(to: Float.self, capacity: floatCount)
        
        // 1. Convert to mono float samples into pre-allocated scratch buffer
        if monoBuffer.count < totalFrames {
            monoBuffer = [Float](repeating: 0.0, count: totalFrames)
        }
        
        if channels == 1 {
            for f in 0..<totalFrames {
                monoBuffer[f] = floatPtr[f]
            }
        } else if channels == 2 {
            for f in 0..<totalFrames {
                let base = f * 2
                monoBuffer[f] = (floatPtr[base] + floatPtr[base + 1]) * 0.5
            }
        } else {
            let invChannels = 1.0 / Float(channels)
            for f in 0..<totalFrames {
                let base = f * channels
                var sum: Float = 0.0
                for c in 0..<channels {
                    sum += floatPtr[base + c]
                }
                monoBuffer[f] = sum * invChannels
            }
        }
        
        // 2. Resample to 16000 Hz if needed
        let step = self.inSampleRate / self.sampleRate // e.g. 48000 / 16000 = 3.0
        
        outBuffer.removeAll(keepingCapacity: true)
        let estOut = Int(Double(totalFrames) / step) + 4
        if outBuffer.capacity < estOut {
            outBuffer.reserveCapacity(estOut)
        }
        
        while self.resamplePos < Double(totalFrames - 1) {
            let idx0 = Int(self.resamplePos)
            let idx1 = min(idx0 + 1, totalFrames - 1)
            let frac = Float(self.resamplePos - Double(idx0))
            
            let s0 = monoBuffer[idx0]
            let s1 = monoBuffer[idx1]
            let interpolated = s0 + frac * (s1 - s0)
            
            let clamped = max(-1.0, min(1.0, interpolated))
            let pcm16 = Int16(clamped * (clamped < 0 ? 32768.0 : 32767.0))
            outBuffer.append(pcm16)
            
            self.resamplePos += step
        }
        self.resamplePos -= Double(totalFrames)
        if self.resamplePos < 0 { self.resamplePos = 0 }
        
        // 3. Write Int16 PCM buffer to stdout
        if !outBuffer.isEmpty {
            outBuffer.withUnsafeBytes { rawBuffer in
                if let baseAddress = rawBuffer.baseAddress {
                    let data = Data(bytes: baseAddress, count: rawBuffer.count)
                    FileHandle.standardOutput.write(data)
                }
            }
        }
    }
    
    func stop() {
        guard isRunning else { return }
        isRunning = false
        cleanup()
        exit(0)
    }
    
    private func cleanup() {
        if aggregateDeviceID != 0 {
            if let procID = ioProcID {
                AudioDeviceStop(aggregateDeviceID, procID)
                AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
                ioProcID = nil
            }
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = 0
        }
        if tapID != 0 {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = 0
        }
    }
}

let capture = CoreAudioTapCapture()

// Shutdown handling
let sigintSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigintSource.setEventHandler { capture.stop() }
sigintSource.resume()
signal(SIGINT, SIG_IGN)

let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigtermSource.setEventHandler { capture.stop() }
sigtermSource.resume()
signal(SIGTERM, SIG_IGN)

// Parent process stdin EOF monitor
DispatchQueue.global(qos: .background).async {
    var buf = [UInt8](repeating: 0, count: 16)
    while true {
        let n = read(STDIN_FILENO, &buf, buf.count)
        if n <= 0 {
            DispatchQueue.main.async { capture.stop() }
            break
        }
    }
}

guard capture.start() else {
    exit(1)
}

dispatchMain()
