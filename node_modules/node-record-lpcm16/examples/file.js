'use strict'

const recorder = require('../')
const fs = require('fs')

const file = fs.createWriteStream('test.wav', { encoding: 'binary' })

recorder.record({
  sampleRate: 44100,
  endOnSilence: true
})
  .stream()
  .pipe(file)
