'use strict'

const recorder = require('../')
const request = require('request')

const witToken = process.env.WIT_TOKEN // get one from wit.ai!

function parseResult (err, resp, body) {
  if (err) console.error(err)
  console.log(body)
}

const recording = recorder.record({
  recorder: 'arecord'
})

recording
  .stream()
  .pipe(request.post({
    url: 'https://api.wit.ai/speech?client=chromium&lang=en-us&output=json',
    headers: {
      Accept: 'application/vnd.wit.20160202+json',
      Authorization: `Bearer ${witToken}`,
      'Content-Type': 'audio/wav'
    }
  }, parseResult))

setTimeout(() => {
  recording.stop()
}, 3000) // Stop after three seconds of recording
