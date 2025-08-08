'use strict'

const recorder = require('../')
const fs = require('fs')

const file = fs.createWriteStream('test.wav', { encoding: 'binary' })

// this will throw synchronously when the recorder does not exist
const recording = recorder.record({
  recorder: 'sox',
  device: 'does-not-exist'
})

recording.stream()
  .on('error', err => {
    console.error('recoder threw an erorr:', err)
  })
  .pipe(file)

// Stop recording after three seconds and write to file
setTimeout(() => {
  recording.stop()
}, 2000)
