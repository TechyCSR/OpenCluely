'use strict'

const recorder = require('../')
const fs = require('fs')

const file = fs.createWriteStream('test.wav', { encoding: 'binary' })

const recording = recorder.record({
  sampleRate: 44100
})

recording.stream().pipe(file)

setTimeout(() => {
  recording.pause()
}, 1000)

setTimeout(() => {
  recording.resume()
}, 2000)

setTimeout(() => {
  recording.stop()
}, 3000)
