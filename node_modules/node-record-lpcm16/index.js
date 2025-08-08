'use strict'

const assert = require('assert')
const debug = require('debug')('record')
const { spawn } = require('child_process')
const recorders = require('./recorders')

class Recording {
  constructor (options = {}) {
    const defaults = {
      sampleRate: 16000,
      channels: 1,
      compress: false,
      threshold: 0.5,
      thresholdStart: null,
      thresholdEnd: null,
      silence: '1.0',
      recorder: 'sox',
      endOnSilence: false,
      audioType: 'wav'
    }

    this.options = Object.assign(defaults, options)

    const recorder = recorders.load(this.options.recorder)
    const { cmd, args, spawnOptions = {} } = recorder(this.options)

    this.cmd = cmd
    this.args = args
    this.cmdOptions = Object.assign({ encoding: 'binary', stdio: 'pipe' }, spawnOptions)

    debug(`Started recording`)
    debug(this.options)
    debug(` ${this.cmd} ${this.args.join(' ')}`)

    return this.start()
  }

  start () {
    const { cmd, args, cmdOptions } = this

    const cp = spawn(cmd, args, cmdOptions)
    const rec = cp.stdout
    const err = cp.stderr

    this.process = cp // expose child process
    this._stream = rec // expose output stream

    cp.on('close', code => {
      if (code === 0) return
      rec.emit('error', `${this.cmd} has exited with error code ${code}.

Enable debugging with the environment variable DEBUG=record.`
      )
    })

    err.on('data', chunk => {
      debug(`STDERR: ${chunk}`)
    })

    rec.on('data', chunk => {
      debug(`Recording ${chunk.length} bytes`)
    })

    rec.on('end', () => {
      debug('Recording ended')
    })

    return this
  }

  stop () {
    assert(this.process, 'Recording not yet started')

    this.process.kill()
  }

  pause () {
    assert(this.process, 'Recording not yet started')

    this.process.kill('SIGSTOP')
    this._stream.pause()
    debug('Paused recording')
  }

  resume () {
    assert(this.process, 'Recording not yet started')

    this.process.kill('SIGCONT')
    this._stream.resume()
    debug('Resumed recording')
  }

  isPaused () {
    assert(this.process, 'Recording not yet started')

    return this._stream.isPaused()
  }

  stream () {
    assert(this._stream, 'Recording not yet started')

    return this._stream
  }
}

module.exports = {
  record: (...args) => new Recording(...args)
}
