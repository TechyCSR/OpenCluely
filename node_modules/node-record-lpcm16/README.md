# node-record-lpcm-16

Records a 16-bit signed-integer linear pulse modulation code WAV audio file.

This module uses Node.js streams to minimize memory usage and optimize speed, perfect for embedded devices and "the internet of things".

These audio files are fully compatible with both the [Google Speech to Text API (v2)](https://github.com/gillesdemey/google-speech-v2) and the [Wit.ai Speech API](https://wit.ai/docs/api#span-classtitle-verb-postspeech).

## Installation

`npm install node-record-lpcm16`

## Dependencies

Generally, running `npm install` should suffice.

This module requires you to install [SoX](http://sox.sourceforge.net) and it must be available in your `$PATH`.

### For Mac OS
`brew install sox`

### For most linux disto's
`sudo apt-get install sox libsox-fmt-all`

### For Windows
[download the binaries](http://sourceforge.net/projects/sox/files/latest/download)

## Options

```
sampleRate            : 16000  // audio sample rate
channels              : 1      // number of channels
threshold             : 0.5    // silence threshold (rec only)
endOnSilence          : false  // automatically end on silence (if supported)
thresholdStart        : null   // silence threshold to start recording, overrides threshold (rec only)
thresholdEnd          : null   // silence threshold to end recording, overrides threshold (rec only)
silence               : '1.0'  // seconds of silence before ending
recorder              : 'sox'  // Defaults to 'sox'
device                : null   // recording device (e.g.: 'plughw:1')
audioType             : 'wav'  // audio type to record
```

> Please note that `arecord` might not work on all operating systems. If you can't capture any sound with `arecord`, try to change device (`arecord -l`).

## Usage

```javascript
const recorder = require('node-record-lpcm16')
const fs = require('fs')

const file = fs.createWriteStream('test.wav', { encoding: 'binary' })

recorder.record({
  sampleRate: 44100
})
.stream()
.pipe(file)
```

You can pause, resume and stop the recording manually.

```javascript
const recorder = require('node-record-lpcm16')
const fs = require('fs')

const file = fs.createWriteStream('test.wav', { encoding: 'binary' })

const recording = recorder.record()
recording.stream().pipe(file)

// Pause recording after one second
setTimeout(() => {
  recording.pause()
}, 1000)

// Resume another second later
setTimeout(() => {
  recording.resume()
}, 2000)

// Stop recording after three seconds
setTimeout(() => {
  recording.stop()
}, 3000)
```

## Recorders

The following recorders are included:

* rec
* sox
* arecord

**Note:** not all recorders support all features!

## Error handling

Some recorders might be logging errors to `stderr` and throw an exit code.
You can catch early termination by adding an error event listener to the stream.

To debug the recorder see [debugging](#debugging) below.

```javascript
recording.stream()
  .on('error', err => {
    console.error('recorder threw an error:', err)
  })
  .pipe(file)
```

## Debugging

Debug logging is implemented with [visionmedia/debug](https://github.com/visionmedia/debug)

`DEBUG=record node examples/file.js`

## Example

Here's how you can write your own Siri in just 10 lines of code.

```javascript
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
    'url': 'https://api.wit.ai/speech?client=chromium&lang=en-us&output=json',
    'headers': {
      'Accept': 'application/vnd.wit.20160202+json',
      'Authorization': `Bearer ${witToken}`,
      'Content-Type': 'audio/wav'
    }
  }, parseResult))

setTimeout(() => {
  recording.stop()
}, 3000) // Stop after three seconds of recording
```
