'use strict'

const recorder = require('../')
const fs = require('fs')

const soxFile = fs.createWriteStream('test.sox.wav', { encoding: 'binary' })
const recFile = fs.createWriteStream('test.rec.wav', { encoding: 'binary' })

const sox = recorder.record({ recorder: 'sox' })
const rec = recorder.record({ recorder: 'rec' })

sox.stream()
  .pipe(soxFile)

rec.stream()
  .pipe(recFile)

// Stop recording after three seconds
setTimeout(() => {
  sox.stop()
  rec.stop()
}, 2000)
