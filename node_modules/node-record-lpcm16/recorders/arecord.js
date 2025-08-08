// On some systems (RasPi), arecord is the prefered recording binary
module.exports = (options) => {
  const cmd = 'arecord'

  const args = [
    '-q', // show no progress
    '-r', options.sampleRate, // sample rate
    '-c', options.channels, // channels
    '-t', options.audioType, // audio type
    '-f', 'S16_LE', // Sample format
    '-' // pipe
  ]

  if (options.device) {
    args.unshift('-D', options.device)
  }

  return { cmd, args }
}
