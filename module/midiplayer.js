(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.MidiPlayer = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

function ADSR(audioContext) {
  const node = audioContext.createGain()

  const voltage = node._voltage = getVoltage(audioContext)
  const value = scale(voltage)
  const startValue = scale(voltage)
  const endValue = scale(voltage)

  node._startAmount = scale(startValue)
  node._endAmount = scale(endValue)

  node._multiplier = scale(value)
  node._multiplier.connect(node)
  node._startAmount.connect(node)
  node._endAmount.connect(node)

  node.value = value.gain
  node.startValue = startValue.gain
  node.endValue = endValue.gain

  node.startValue.value = 0
  node.endValue.value = 0

  Object.defineProperties(node, props)
  return node
}

const props = {

  attack: { value: 0, writable: true },
  decay: { value: 0, writable: true },
  sustain: { value: 1, writable: true },
  release: { value: 0, writable: true },

  getReleaseDuration: {
    value: function () {
      return this.release
    }
  },

  start: {
    value: function (at) {
      const target = this._multiplier.gain
      const startAmount = this._startAmount.gain
      const endAmount = this._endAmount.gain

      this._voltage.start(at)
      this._decayFrom = this._decayFrom = at + this.attack
      this._startedAt = at

      const sustain = this.sustain

      target.cancelScheduledValues(at)
      startAmount.cancelScheduledValues(at)
      endAmount.cancelScheduledValues(at)

      endAmount.setValueAtTime(0, at)

      if (this.attack) {
        target.setValueAtTime(0, at)
        target.linearRampToValueAtTime(1, at + this.attack)

        startAmount.setValueAtTime(1, at)
        startAmount.linearRampToValueAtTime(0, at + this.attack)
      } else {
        target.setValueAtTime(1, at)
        startAmount.setValueAtTime(0, at)
      }

      if (this.decay) {
        target.setTargetAtTime(sustain, this._decayFrom, getTimeConstant(this.decay))
      }
    }
  },

  stop: {
    value: function (at, isTarget) {
      if (isTarget) {
        at = at - this.release
      }

      const endTime = at + this.release
      if (this.release) {

        const target = this._multiplier.gain
        const startAmount = this._startAmount.gain
        const endAmount = this._endAmount.gain

        target.cancelScheduledValues(at)
        startAmount.cancelScheduledValues(at)
        endAmount.cancelScheduledValues(at)

        const expFalloff = getTimeConstant(this.release)

        // truncate attack (required as linearRamp is removed by cancelScheduledValues)
        if (this.attack && at < this._decayFrom) {
          const valueAtTime = getValue(0, 1, this._startedAt, this._decayFrom, at)
          target.linearRampToValueAtTime(valueAtTime, at)
          startAmount.linearRampToValueAtTime(1 - valueAtTime, at)
          startAmount.setTargetAtTime(0, at, expFalloff)
        }

        endAmount.setTargetAtTime(1, at, expFalloff)
        target.setTargetAtTime(0, at, expFalloff)
      }

      this._voltage.stop(endTime)
      return endTime
    }
  },

  onended: {
    get: function () {
      return this._voltage.onended
    },
    set: function (value) {
      this._voltage.onended = value
    }
  }

}

const flat = new Float32Array([1, 1])
function getVoltage(context) {
  const voltage = context.createBufferSource()
  const buffer = context.createBuffer(1, 2, context.sampleRate)
  buffer.getChannelData(0).set(flat)
  voltage.buffer = buffer
  voltage.loop = true
  return voltage
}

function scale(node) {
  const gain = node.context.createGain()
  node.connect(gain)
  return gain
}

function getTimeConstant(time) {
  return Math.log(time + 1) / Math.log(100)
}

function getValue(start, end, fromTime, toTime, at) {
  const difference = end - start
  const time = toTime - fromTime
  const truncateTime = at - fromTime
  const phase = truncateTime / time
  let value = start + phase * difference

  if (value <= start) {
    value = start
  }
  if (value >= end) {
    value = end
  }

  return value
}

module.exports = ADSR

},{}],2:[function(require,module,exports){
'use strict'

// DECODE UTILITIES
function b64ToUint6(nChr) {
  return nChr > 64 && nChr < 91 ? nChr - 65
    : nChr > 96 && nChr < 123 ? nChr - 71
      : nChr > 47 && nChr < 58 ? nChr + 4
        : nChr === 43 ? 62
          : nChr === 47 ? 63
            : 0
}

// Decode Base64 to Uint8Array
// ---------------------------
function decode(sBase64, nBlocksSize) {
  var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, '')
  var nInLen = sB64Enc.length
  var nOutLen = nBlocksSize
    ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize
    : nInLen * 3 + 1 >> 2
  var taBytes = new Uint8Array(nOutLen)

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++ , nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255
      }
      nUint24 = 0
    }
  }
  return taBytes
}

module.exports = { decode }

},{}],3:[function(require,module,exports){
/* global XMLHttpRequest */
'use strict'

/**
 * Given a url and a return type, returns a promise to the content of the url
 * Basically it wraps a XMLHttpRequest into a Promise
 *
 * @param {String} url
 * @param {String} type - can be 'text' or 'arraybuffer'
 * @return {Promise}
 */
module.exports = function (url, type) {
  return new Promise(function (done, reject) {
    var req = new XMLHttpRequest()
    if (type) req.responseType = type

    req.open('GET', url)
    req.onload = function () {
      req.status === 200 ? done(req.response) : reject(Error(req.statusText))
    }
    req.onerror = function () { reject(Error('Network Error')) }
    req.send()
  })
}

},{}],4:[function(require,module,exports){
'use strict'

var base64 = require('./base64')
var fetch = require('./fetch')

// Given a regex, return a function that test if against a string
function fromRegex(r) {
  return function (o) { return typeof o === 'string' && r.test(o) }
}
// Try to apply a prefix to a name
function prefix(pre, name) {
  return typeof pre === 'string' ? pre + name
    : typeof pre === 'function' ? pre(name)
      : name
}

/**
 * Load one or more audio files
 *
 *
 * Possible option keys:
 *
 * - __from__ {Function|String}: a function or string to convert from file names to urls.
 * If is a string it will be prefixed to the name:
 * `load(ac, 'snare.mp3', { from: 'http://audio.net/samples/' })`
 * If it's a function it receives the file name and should return the url as string.
 * - __only__ {Array} - when loading objects, if provided, only the given keys
 * will be included in the decoded object:
 * `load(ac, 'piano.json', { only: ['C2', 'D2'] })`
 *
 * @param {AudioContext} ac - the audio context
 * @param {Object} source - the object to be loaded
 * @param {Object} options - (Optional) the load options for that object
 * @param {Object} defaultValue - (Optional) the default value to return as
 * in a promise if not valid loader found
 */
function load(ac, source, options, defVal) {
  var loader =
    // Basic audio loading
    isArrayBuffer(source) ? loadArrayBuffer
      : isAudioFileName(source) ? loadAudioFile
        : isPromise(source) ? loadPromise
          // Compound objects
          : isArray(source) ? loadArrayData
            : isObject(source) ? loadObjectData
              : isJsonFileName(source) ? loadJsonFile
                // Base64 encoded audio
                : isBase64Audio(source) ? loadBase64Audio
                  : isJsFileName(source) ? loadMidiJSFile
                    : null

  var opts = options || {}
  return loader ? loader(ac, source, opts)
    : defVal ? Promise.resolve(defVal)
      : Promise.reject('Source not valid (' + source + ')')
}
load.fetch = fetch

// BASIC AUDIO LOADING
// ===================

// Load (decode) an array buffer
function isArrayBuffer(o) { return o instanceof ArrayBuffer }
function loadArrayBuffer(ac, array, options) {
  return new Promise(function (done, reject) {
    ac.decodeAudioData(array,
      function (buffer) { done(buffer) },
      function () { reject("Can't decode audio data (" + array.slice(0, 30) + '...)') }
    )
  })
}

// Load an audio filename
var isAudioFileName = fromRegex(/\.(mp3|wav|ogg)(\?.*)?$/i)
function loadAudioFile(ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'arraybuffer'), options)
}

// Load the result of a promise
function isPromise(o) { return o && typeof o.then === 'function' }
function loadPromise(ac, promise, options) {
  return promise.then(function (value) {
    return load(ac, value, options)
  })
}

// COMPOUND OBJECTS
// ================

// Try to load all the items of an array
var isArray = Array.isArray
function loadArrayData(ac, array, options) {
  return Promise.all(array.map(function (data) {
    return load(ac, data, options, data)
  }))
}

// Try to load all the values of a key/value object
function isObject(o) { return o && typeof o === 'object' }
function loadObjectData(ac, obj, options) {
  var dest = {}
  var promises = Object.keys(obj).map(function (key) {
    if (options.only && options.only.indexOf(key) === -1) return null
    var value = obj[key]
    return load(ac, value, options, value).then(function (audio) {
      dest[key] = audio
    })
  })
  return Promise.all(promises).then(function () { return dest })
}

// Load the content of a JSON file
var isJsonFileName = fromRegex(/\.json(\?.*)?$/i)
function loadJsonFile(ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'text').then(JSON.parse), options)
}

// BASE64 ENCODED FORMATS
// ======================

// Load strings with Base64 encoded audio
var isBase64Audio = fromRegex(/^data:audio/)
function loadBase64Audio(ac, source, options) {
  var i = source.indexOf(',')
  return load(ac, base64.decode(source.slice(i + 1)).buffer, options)
}

// Load .js files with MidiJS soundfont prerendered audio
var isJsFileName = fromRegex(/\.js(\?.*)?$/i)
function loadMidiJSFile(ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'text').then(midiJsToJson), options)
}

// convert a MIDI.js javascript soundfont file to json
function midiJsToJson(data) {
  var begin = data.indexOf('MIDI.Soundfont.')
  if (begin < 0) throw Error('Invalid MIDI.js Soundfont format')
  begin = data.indexOf('=', begin) + 2
  var end = data.lastIndexOf(',')
  return JSON.parse(data.slice(begin, end) + '}')
}

module.exports = { load }


},{"./base64":2,"./fetch":3}],5:[function(require,module,exports){
/**
 * Constants used in player.
 */
const Constants = {
	VERSION: '2.0.4',
	NOTES: [],
	CIRCLE_OF_FOURTHS: ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb', 'Bbb', 'Ebb', 'Abb'],
	CIRCLE_OF_FIFTHS: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#']
};

// Builds notes object for reference against binary values.
const allNotes = [['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B']];
let counter = 0;

// All available octaves.
for (let i = -1; i <= 9; i++) {
	allNotes.forEach(noteGroup => {
		noteGroup.forEach(note => Constants.NOTES[counter] = note + i);
		counter++;
	});
}

module.exports.Constants = Constants;

},{}],6:[function(require,module,exports){
const Player = require('./player');
const Soundfont = require('./soundfont-player/index');

module.exports = {
    Player: Player.Player,
    Soundfont: Soundfont.Soundfont,
}


},{"./player":8,"./soundfont-player/index":14}],7:[function(require,module,exports){
'use strict'

// util
const fillStr = (s, num) => Array(num + 1).join(s)
const isNum = x => typeof x === 'number'
const isStr = x => typeof x === 'string'
const isDef = x => typeof x !== 'undefined'
const midiToFreq = (midi, tuning) => Math.pow(2, (midi - 69) / 12) * (tuning || 440)

const REGEX = /^([a-gA-G])(#{1,}|b{1,}|x{1,}|)(-?\d*)\s*(.*)\s*$/
/**
 * A regex for matching note strings in scientific notation.
 *
 * @name regex
 * @function
 * @return {RegExp} the regexp used to parse the note name
 *
 * The note string should have the form `letter[accidentals][octave][element]`
 * where:
 *
 * - letter: (Required) is a letter from A to G either upper or lower case
 * - accidentals: (Optional) can be one or more `b` (flats), `#` (sharps) or `x` (double sharps).
 * They can NOT be mixed.
 * - octave: (Optional) a positive or negative integer
 * - element: (Optional) additionally anything after the duration is considered to
 * be the element name (for example: 'C2 dorian')
 *
 * The executed regex contains (by array index):
 *
 * - 0: the complete string
 * - 1: the note letter
 * - 2: the optional accidentals
 * - 3: the optional octave
 * - 4: the rest of the string (trimmed)
 *
 * @example
 * var parser = require('note-parser')
 * parser.regex.exec('c#4')
 * // => ['c#4', 'c', '#', '4', '']
 * parser.regex.exec('c#4 major')
 * // => ['c#4major', 'c', '#', '4', 'major']
 * parser.regex().exec('CMaj7')
 * // => ['CMaj7', 'C', '', '', 'Maj7']
 */
function regex() { return REGEX };

const SEMITONES = [0, 2, 4, 5, 7, 9, 11]
/**
 * Parse a note name in scientific notation an return it's components,
 * and some numeric properties including midi number and frequency.
 *
 * @name parse
 * @function
 * @param {String} note - the note string to be parsed
 * @param {Boolean} isTonic - true the strings it's supposed to contain a note number
 * and some category (for example an scale: 'C# major'). It's false by default,
 * but when true, en extra tonicOf property is returned with the category ('major')
 * @param {Float} tunning - The frequency of A4 note to calculate frequencies.
 * By default it 440.
 * @return {Object} the parsed note name or null if not a valid note
 *
 * The parsed note name object will ALWAYS contains:
 * - letter: the uppercase letter of the note
 * - acc: the accidentals of the note (only sharps or flats)
 * - pc: the pitch class (letter + acc)
 * - step: s a numeric representation of the letter. It's an integer from 0 to 6
 * where 0 = C, 1 = D ... 6 = B
 * - alt: a numeric representation of the accidentals. 0 means no alteration,
 * positive numbers are for sharps and negative for flats
 * - chroma: a numeric representation of the pitch class. It's like midi for
 * pitch classes. 0 = C, 1 = C#, 2 = D ... 11 = B. Can be used to find enharmonics
 * since, for example, chroma of 'Cb' and 'B' are both 11
 *
 * If the note has octave, the parser object will contain:
 * - oct: the octave number (as integer)
 * - midi: the midi number
 * - freq: the frequency (using tuning parameter as base)
 *
 * If the parameter `isTonic` is set to true, the parsed object will contain:
 * - tonicOf: the rest of the string that follows note name (left and right trimmed)
 *
 * @example
 * var parse = require('note-parser').parse
 * parse('Cb4')
 * // => { letter: 'C', acc: 'b', pc: 'Cb', step: 0, alt: -1, chroma: -1,
 *         oct: 4, midi: 59, freq: 246.94165062806206 }
 * // if no octave, no midi, no freq
 * parse('fx')
 * // => { letter: 'F', acc: '##', pc: 'F##', step: 3, alt: 2, chroma: 7 })
 */
function parse(str, isTonic, tuning) {
  if (typeof str !== 'string')
    return null
  const m = REGEX.exec(str)
  if (!m || (!isTonic && m[4]))
    return null

  const p = { letter: m[1].toUpperCase(), acc: m[2].replace(/x/g, '##') }
  p.pc = p.letter + p.acc
  p.step = (p.letter.charCodeAt(0) + 3) % 7
  p.alt = p.acc[0] === 'b' ? -p.acc.length : p.acc.length
  const pos = SEMITONES[p.step] + p.alt
  p.chroma = pos < 0 ? 12 + pos : pos % 12
  if (m[3]) { // has octave
    p.oct = +m[3]
    p.midi = pos + 12 * (p.oct + 1)
    p.freq = midiToFreq(p.midi, tuning)
  }
  if (isTonic)
    p.tonicOf = m[4]
  return p
}

const LETTERS = 'CDEFGAB'
const accStr = n => !isNum(n) ? '' : n < 0 ? fillStr('b', -n) : fillStr('#', n)
const octStr = n => !isNum(n) ? '' : '' + n

/**
 * Create a string from a parsed object or `step, alteration, octave` parameters
 * @param {Object} obj - the parsed data object
 * @return {String} a note string or null if not valid parameters
 * @since 1.2
 * @example
 * parser.build(parser.parse('cb2')) // => 'Cb2'
 *
 * @example
 * // it accepts (step, alteration, octave) parameters:
 * parser.build(3) // => 'F'
 * parser.build(3, -1) // => 'Fb'
 * parser.build(3, -1, 4) // => 'Fb4'
 */
function build(s, a, o) {
  if (s === null || typeof s === 'undefined')
    return null
  if (s.step)
    return build(s.step, s.alt, s.oct)
  if (s < 0 || s > 6)
    return null
  return LETTERS.charAt(s) + accStr(a) + octStr(o)
}

/**
 * Get midi of a note
 *
 * @name midi
 * @function
 * @param {String|Integer} note - the note name or midi number
 * @return {Integer} the midi number of the note or null if not a valid note
 * or the note does NOT contains octave
 * @example
 * var parser = require('note-parser')
 * parser.midi('A4') // => 69
 * parser.midi('A') // => null
 * @example
 * // midi numbers are bypassed (even as strings)
 * parser.midi(60) // => 60
 * parser.midi('60') // => 60
 */
function midi(note) {
  if ((isNum(note) || isStr(note)) && note >= 0 && note < 128)
    return +note
  const p = parse(note)
  return p && isDef(p.midi) ? p.midi : null
}

/**
 * Get freq of a note in hertzs (in a well tempered 440Hz A4)
 *
 * @name freq
 * @function
 * @param {String} note - the note name or note midi number
 * @param {String} tuning - (Optional) the A4 frequency (440 by default)
 * @return {Float} the freq of the number if hertzs or null if not valid note
 * @example
 * var parser = require('note-parser')
 * parser.freq('A4') // => 440
 * parser.freq('A') // => null
 * @example
 * // can change tuning (440 by default)
 * parser.freq('A4', 444) // => 444
 * parser.freq('A3', 444) // => 222
 * @example
 * // it accepts midi numbers (as numbers and as strings)
 * parser.freq(69) // => 440
 * parser.freq('69', 442) // => 442
 */
function freq(note, tuning) {
  const m = midi(note)
  return m === null ? null : midiToFreq(m, tuning)
}

const letter = src => (parse(src) || {}).letter
const acc = src => (parse(src) || {}).acc
const pc = src => (parse(src) || {}).pc
const step = src => (parse(src) || {}).step
const alt = src => (parse(src) || {}).alt
const chroma = src => (parse(src) || {}).chroma
const oct = src => (parse(src) || {}).oct

module.exports = {
  regex,
  parse,
  build,
  midi,
  freq,
  letter,
  acc,
  pc,
  step,
  alt,
  chroma,
  oct,
}

},{}],8:[function(require,module,exports){
const Utils = require('./utils').Utils;
const Track = require('./track').Track;

// Polyfill Uint8Array.forEach: Doesn't exist on Safari <10
if (!Uint8Array.prototype.forEach) {
	Object.defineProperty(Uint8Array.prototype, 'forEach', {
		value: Array.prototype.forEach
	});
}

/**
 * Main player class.  Contains methods to load files, start, stop.
 * @param {function} - Callback to fire for each MIDI event.  Can also be added with on('midiEvent', fn)
 * @param {array} - Array buffer of MIDI file (optional).
 */
class Player {
	constructor(eventHandler, buffer) {
		this.sampleRate = 5; // milliseconds
		this.startTime = 0;
		this.buffer = buffer || null;
		this.division;
		this.format;
		this.setIntervalId = false;
		this.tracks = [];
		this.instruments = [];
		this.defaultTempo = 120;
		this.tempo = null;
		this.startTick = 0;
		this.tick = 0;
		this.lastTick = null;
		this.inLoop = false;
		this.totalTicks = 0;
		this.events = [];
		this.totalEvents = 0;
		this.eventListeners = {};

		if (typeof (eventHandler) === 'function') this.on('midiEvent', eventHandler);
	}

	/**
	 * Load a file into the player (Node.js only).
	 * @param {string} path - Path of file.
	 * @return {Player}
	 */
	loadFile(path) {
		const fs = require('fs');
		this.buffer = fs.readFileSync(path);
		return this.fileLoaded();
	}

	/**
	 * Load an array buffer into the player.
	 * @param {array} arrayBuffer - Array buffer of file to be loaded.
	 * @return {Player}
	 */
	loadArrayBuffer(arrayBuffer) {
		this.buffer = new Uint8Array(arrayBuffer);
		return this.fileLoaded();
	}

	/**
	 * Load a data URI into the player.
	 * @param {string} dataUri - Data URI to be loaded.
	 * @return {Player}
	 */
	loadDataUri(dataUri) {
		// convert base64 to raw binary data held in a string.
		// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
		const byteString = window.atob(dataUri.split(',')[1]);

		// write the bytes of the string to an ArrayBuffer
		const ia = new Uint8Array(byteString.length);
		for (let i = 0; i < byteString.length; i++)
			ia[i] = byteString.charCodeAt(i);

		this.buffer = ia;
		return this.fileLoaded();
	}

	/**
	 * Get filesize of loaded file in number of bytes.
	 * @return {number} - The filesize.
	 */
	getFilesize() {
		return this.buffer ? this.buffer.length : 0;
	}

	/**
	 * Sets default tempo, parses file for necessary information, and does a dry run to calculate total length.
	 * Populates this.events & this.totalTicks.
	 * @return {Player}
	 */
	fileLoaded() {
		if (!this.validate()) throw 'Invalid MIDI file; should start with MThd';
		return this.setTempo(this.defaultTempo).getDivision().getFormat().getTracks().dryRun();
	}

	/**
	 * Validates file using simple means - first four bytes should == MThd.
	 * @return {boolean}
	 */
	validate() {
		return Utils.bytesToLetters(this.buffer.subarray(0, 4)) === 'MThd';
	}

	/**
	 * Gets MIDI file format for loaded file.
	 * @return {Player}
	 */
	getFormat() {
		/*
		MIDI files come in 3 variations:
		Format 0 which contain a single track
		Format 1 which contain one or more simultaneous tracks
		(ie all tracks are to be played simultaneously).
		Format 2 which contain one or more independant tracks
		(ie each track is to be played independantly of the others).
		return Utils.bytesToNumber(this.buffer.subarray(8, 10));
		*/

		this.format = Utils.bytesToNumber(this.buffer.subarray(8, 10));
		return this;
	}

	/**
	 * Parses out tracks, places them in this.tracks and initializes this.pointers
	 * @return {Player}
	 */
	getTracks() {
		this.tracks = [];
		let trackOffset = 0;
		while (trackOffset < this.buffer.length) {
			if (Utils.bytesToLetters(this.buffer.subarray(trackOffset, trackOffset + 4)) == 'MTrk') {
				let trackLength = Utils.bytesToNumber(this.buffer.subarray(trackOffset + 4, trackOffset + 8));
				this.tracks.push(new Track(this.tracks.length, this.buffer.subarray(trackOffset + 8, trackOffset + 8 + trackLength)));
			}

			trackOffset += Utils.bytesToNumber(this.buffer.subarray(trackOffset + 4, trackOffset + 8)) + 8;
		}
		return this;
	}

	/**
	 * Enables a track for playing.
	 * @param {number} trackNumber - Track number
	 * @return {Player}
	 */
	enableTrack(trackNumber) {
		this.tracks[trackNumber - 1].enable();
		return this;
	}

	/**
	 * Disables a track for playing.
	 * @param {number} - Track number
	 * @return {Player}
	 */
	disableTrack(trackNumber) {
		this.tracks[trackNumber - 1].disable();
		return this;
	}

	/**
	 * Gets quarter note division of loaded MIDI file.
	 * @return {Player}
	 */
	getDivision() {
		this.division = Utils.bytesToNumber(this.buffer.subarray(12, 14));
		return this;
	}

	/**
	 * The main play loop.
	 * @param {boolean} - Indicates whether or not this is being called simply for parsing purposes.  Disregards timing if so.
	 * @return {undefined}
	 */
	playLoop(dryRun) {
		if (!this.inLoop) {
			this.inLoop = true;
			this.tick = this.getCurrentTick();

			this.tracks.forEach(function (track) {
				// Handle next event
				if (!dryRun && this.endOfFile()) {
					//console.log('end of file')
					this.triggerPlayerEvent('endOfFile');
					this.stop();
				} else {
					let event = track.handleEvent(this.tick, dryRun);

					if (dryRun && event) {
						if (event.hasOwnProperty('name') && event.name === 'Set Tempo') {
							// Grab tempo if available.
							this.setTempo(event.data);
						}
						if (event.hasOwnProperty('name') && event.name === 'Program Change') {
							if (!this.instruments.includes(event.value)) {
								this.instruments.push(event.value);
							}
						}
					} else if (event) this.emitEvent(event);
				}

			}, this);

			if (!dryRun) this.triggerPlayerEvent('playing', { tick: this.tick });
			this.inLoop = false;
		}
	}

	/**
	 * Setter for tempo.
	 * @param {number} - Tempo in bpm (defaults to 120)
	 */
	setTempo(tempo) {
		this.tempo = tempo;
		return this;
	}

	/**
	 * Setter for startTime.
	 * @param {number} - UTC timestamp
	 */
	setStartTime(startTime) {
		this.startTime = startTime;
	}

	/**
	 * Start playing loaded MIDI file if not already playing.
	 * @return {Player}
	 */
	play() {
		if (this.isPlaying())
			throw 'Already playing...';

		// Initialize
		if (!this.startTime)
			this.startTime = (new Date()).getTime();

		// Start play loop
		//window.requestAnimationFrame(this.playLoop.bind(this));
		this.setIntervalId = window.setInterval(this.playLoop.bind(this), this.sampleRate);

		return this;
	}

	/**
	 * Pauses playback if playing.
	 * @return {Player}
	 */
	pause() {
		clearInterval(this.setIntervalId);
		this.setIntervalId = false;
		this.startTick = this.tick;
		this.startTime = 0;
		return this;
	}

	/**
	 * Stops playback if playing.
	 * @return {Player}
	 */
	stop() {
		clearInterval(this.setIntervalId);
		this.setIntervalId = false;
		this.startTick = 0;
		this.startTime = 0;
		this.resetTracks();
		return this;
	}

	/**
	 * Skips player pointer to specified tick.
	 * @param {number} - Tick to skip to.
	 * @return {Player}
	 */
	skipToTick(tick) {
		this.stop();
		this.startTick = tick;

		// Need to set track event indexes to the nearest possible event to the specified tick.
		this.tracks.forEach(function (track) {
			track.setEventIndexByTick(tick);
		});
		return this;
	}

	/**
	 * Skips player pointer to specified percentage.
	 * @param {number} - Percent value in integer format.
	 * @return {Player}
	 */
	skipToPercent(percent) {
		if (percent < 0 || percent > 100) throw 'Percent must be number between 1 and 100.';
		this.skipToTick(Math.round(percent / 100 * this.totalTicks));
		return this;
	}

	/**
	 * Skips player pointer to specified seconds.
	 * @param {number} - Seconds to skip to.
	 * @return {Player}
	 */
	skipToSeconds(seconds) {
		const songTime = this.getSongTime();
		if (seconds < 0 || seconds > songTime)
			throw `${seconds} seconds not within song time of ${songTime}`;
		this.skipToPercent(seconds / songTime * 100);
		return this;
	}

	/**
	 * Checks if player is playing
	 * @return {boolean}
	 */
	isPlaying() {
		return this.setIntervalId > 0 || typeof this.setIntervalId === 'object';
	}

	/**
	 * Plays the loaded MIDI file without regard for timing and saves events in this.events.  Essentially used as a parser.
	 * @return {Player}
	 */
	dryRun() {
		// Reset tracks first
		this.resetTracks();
		while (!this.endOfFile())
			this.playLoop(true);
		this.events = this.getEvents();
		this.totalEvents = this.getTotalEvents();
		this.totalTicks = this.getTotalTicks();
		this.startTick = 0;
		this.startTime = 0;

		// Leave tracks in pristine condish
		this.resetTracks();

		//console.log('Song time: ' + this.getSongTime() + ' seconds / ' + this.totalTicks + ' ticks.');

		this.triggerPlayerEvent('fileLoaded', this);
		return this;
	}

	/**
	 * Resets play pointers for all tracks.
	 * @return {Player}
	 */
	resetTracks() {
		this.tracks.forEach(track => track.reset());
		return this;
	}

	/**
	 * Gets an array of events grouped by track.
	 * @return {array}
	 */
	getEvents() {
		return this.tracks.map(track => track.events);
	}

	/**
	 * Gets total number of ticks in the loaded MIDI file.
	 * @return {number}
	 */
	getTotalTicks() {
		return Math.max.apply(null, this.tracks.map(track => track.delta));
	}

	/**
	 * Gets total number of events in the loaded MIDI file.
	 * @return {number}
	 */
	getTotalEvents() {
		return this.tracks.reduce(
			(a, b) => { return { events: { length: a.events.length + b.events.length } } },
			{ events: { length: 0 } }
		).events.length;
	}

	/**
	 * Gets song duration in seconds.
	 * @return {number}
	 */
	getSongTime() {
		return this.totalTicks / this.division / this.tempo * 60;
	}

	/**
	 * Gets remaining number of seconds in playback.
	 * @return {number}
	 */
	getSongTimeRemaining() {
		return Math.round((this.totalTicks - this.tick) / this.division / this.tempo * 60);
	}

	/**
	 * Gets remaining percent of playback.
	 * @return {number}
	 */
	getSongPercentRemaining() {
		return Math.round(this.getSongTimeRemaining() / this.getSongTime() * 100);
	}

	/**
	 * Number of bytes processed in the loaded MIDI file.
	 * @return {number}
	 */
	bytesProcessed() {
		// Currently assume header chunk is strictly 14 bytes
		return 14 + this.tracks.length * 8 + this.tracks.reduce((a, b) => { return { pointer: a.pointer + b.pointer } }, { pointer: 0 }).pointer;
	}

	/**
	 * Number of events played up to this point.
	 * @return {number}
	 */
	eventsPlayed() {
		return this.tracks.reduce((a, b) => { return { eventIndex: a.eventIndex + b.eventIndex } }, { eventIndex: 0 }).eventIndex;
	}

	/**
	 * Determines if the player pointer has reached the end of the loaded MIDI file.
	 * Used in two ways:
	 * 1. If playing result is based on loaded JSON events.
	 * 2. If parsing (dryRun) it's based on the actual buffer length vs bytes processed.
	 * @return {boolean}
	 */
	endOfFile() {
		if (this.isPlaying())
			return this.eventsPlayed() == this.totalEvents;

		return this.bytesProcessed() == this.buffer.length;
	}

	/**
	 * Gets the current tick number in playback.
	 * @return {number}
	 */
	getCurrentTick() {
		return Math.round(((new Date()).getTime() - this.startTime) / 1000 * (this.division * (this.tempo / 60))) + this.startTick;
	}

	/**
	 * Sends MIDI event out to listener.
	 * @param {object}
	 * @return {Player}
	 */
	emitEvent(event) {
		this.triggerPlayerEvent('midiEvent', event);
		return this;
	}

	/**
	 * Subscribes events to listeners
	 * @param {string} - Name of event to subscribe to.
	 * @param {function} - Callback to fire when event is broadcast.
	 * @return {Player}
	 */
	on(playerEvent, fn) {
		if (!this.eventListeners.hasOwnProperty(playerEvent))
			this.eventListeners[playerEvent] = [];
		this.eventListeners[playerEvent].push(fn);
		return this;
	}

	/**
	 * Broadcasts event to trigger subscribed callbacks.
	 * @param {string} - Name of event.
	 * @param {object} - Data to be passed to subscriber callback.
	 * @return {Player}
	 */
	triggerPlayerEvent(playerEvent, data) {
		if (this.eventListeners.hasOwnProperty(playerEvent))
			this.eventListeners[playerEvent].forEach(fn => fn(data || {}));
		return this;
	}

}

module.exports = { Player }

},{"./track":15,"./utils":16,"fs":undefined}],9:[function(require,module,exports){

module.exports = function (player) {
  /**
   * Adds a listener of an event
   * @chainable
   * @param {String} event - the event name
   * @param {Function} callback - the event handler
   * @return {SamplePlayer} the player
   * @example
   * player.on('start', function(time, note) {
   *   console.log(time, note)
   * })
   */
  player.on = function (event, cb) {
    if (arguments.length === 1 && typeof event === 'function') return player.on('event', event)
    var prop = 'on' + event
    var old = player[prop]
    player[prop] = old ? chain(old, cb) : cb
    return player
  }
  return player
}

function chain (fn1, fn2) {
  return function (a, b, c, d) { fn1(a, b, c, d); fn2(a, b, c, d) }
}

},{}],10:[function(require,module,exports){
'use strict'

var player = require('./player')
var events = require('./events')
var notes = require('./notes')
var scheduler = require('./scheduler')
//var midi = require('./midi')

function SamplePlayer(ac, source, options) {
  //return midi(scheduler(notes(events(player(ac, source, options)))))
  return scheduler(notes(events(player(ac, source, options))))
}

module.exports = { SamplePlayer }

},{"./events":9,"./notes":11,"./player":12,"./scheduler":13}],11:[function(require,module,exports){
'use strict'

var note = require('../note-parser/index')
var isMidi = function (n) { return n !== null && n !== [] && n >= 0 && n < 129 }
var toMidi = function (n) { return isMidi(n) ? +n : note.midi(n) }

// Adds note name to midi conversion
module.exports = function (player) {
  if (player.buffers) {
    var map = player.opts.map
    var toKey = typeof map === 'function' ? map : toMidi
    var mapper = function (name) {
      return name ? toKey(name) || name : null
    }

    player.buffers = mapBuffers(player.buffers, mapper)
    var start = player.start
    player.start = function (name, when, options) {
      var key = mapper(name)
      var dec = key % 1
      if (dec) {
        key = Math.floor(key)
        options = Object.assign(options || {}, { cents: Math.floor(dec * 100) })
      }
      return start(key, when, options)
    }
  }
  return player
}

function mapBuffers(buffers, toKey) {
  return Object.keys(buffers).reduce(function (mapped, name) {
    mapped[toKey(name)] = buffers[name]
    return mapped
  }, {})
}

},{"../note-parser/index":7}],12:[function(require,module,exports){
/* global AudioBuffer */
'use strict'

const ADSR = require('../adsr/index')

const EMPTY = {}
const DEFAULTS = {
  gain: 1,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.9,
  release: 0.3,
  loop: false,
  cents: 0,
  loopStart: 0,
  loopEnd: 0
}

/**
 * Create a sample player.
 *
 * @param {AudioContext} ac - the audio context
 * @param {ArrayBuffer|Object<String,ArrayBuffer>} source
 * @param {Onject} options - (Optional) an options object
 * @return {player} the player
 * @example
 * const SamplePlayer = require('sample-player')
 * const ac = new AudioContext()
 * const snare = SamplePlayer(ac, <AudioBuffer>)
 * snare.play()
 */
function SamplePlayer(ac, source, options) {
  let connected = false
  let nextId = 0
  let tracked = {}
  const out = ac.createGain()
  out.gain.value = 1

  const opts = Object.assign({}, DEFAULTS, options)

  /**
   * @namespace
   */
  const player = { context: ac, out, opts }
  if (source instanceof AudioBuffer)
    player.buffer = source
  else
    player.buffers = source

  /**
   * Start a sample buffer.
   *
   * The returned object has a function `stop(when)` to stop the sound.
   *
   * @param {String} name - the name of the buffer. If the source of the
   * SamplePlayer is one sample buffer, this parameter is not required
   * @param {Float} when - (Optional) when to start (current time if by default)
   * @param {Object} options - additional sample playing options
   * @return {AudioNode} an audio node with a `stop` function
   * @example
   * var sample = player(ac, <AudioBuffer>).connect(ac.destination)
   * sample.start()
   * sample.start(5, { gain: 0.7 }) // name not required since is only one AudioBuffer
   * @example
   * var drums = player(ac, { snare: <AudioBuffer>, kick: <AudioBuffer>, ... }).connect(ac.destination)
   * drums.start('snare')
   * drums.start('snare', 0, { gain: 0.3 })
   */
  player.start = function (name, when, options) {
    // if only one buffer, reorder arguments
    if (player.buffer && name !== null)
      return player.start(null, name, when)

    var buffer = name ? player.buffers[name] : player.buffer
    if (!buffer) {
      console.warn(`Buffer ${name} not found.`)
      return
    } else if (!connected) {
      console.warn('SamplePlayer not connected to any node.')
      return
    }

    const opts = options || EMPTY
    when = Math.max(ac.currentTime, when || 0)
    player.emit('start', when, name, opts)
    var node = createNode(name, buffer, opts)
    node.id = track(name, node)
    node.env.start(when)
    node.source.start(when)
    player.emit('started', when, node.id, node)
    if (opts.duration)
      node.stop(when + opts.duration)
    return node
  }

  // NOTE: start will be override so we can't copy the function reference
  // this is obviously not a good design, so this code will be gone soon.
  /**
   * An alias for `player.start`
   * @see player.start
   * @since 0.3.0
   */
  player.play = function (name, when, options) {
    return player.start(name, when, options)
  }

  /**
   * Stop some or all samples
   *
   * @param {Float} when - (Optional) an absolute time in seconds (or currentTime
   * if not specified)
   * @param {Array} nodes - (Optional) an array of nodes or nodes ids to stop
   * @return {Array} an array of ids of the stoped samples
   *
   * @example
   * var longSound = player(ac, <AudioBuffer>).connect(ac.destination)
   * longSound.start(ac.currentTime)
   * longSound.start(ac.currentTime + 1)
   * longSound.start(ac.currentTime + 2)
   * longSound.stop(ac.currentTime + 3) // stop the three sounds
   */
  player.stop = function (when, ids) {
    ids = ids || Object.keys(tracked)
    return ids.map(function (id) {
      const node = tracked[id]
      if (!node) return null
      node.stop(when)
      return node.id
    })
  }
  /**
   * Connect the player to a destination node
   *
   * @param {AudioNode} destination - the destination node
   * @return {AudioPlayer} the player
   * @chainable
   * @example
   * var sample = player(ac, <AudioBuffer>).connect(ac.destination)
   */
  player.connect = function (dest) {
    connected = true
    out.connect(dest)
    return player
  }

  player.emit = function (event, when, obj, opts) {
    if (player.onevent) player.onevent(event, when, obj, opts)
    const fn = player['on' + event]
    if (fn) fn(when, obj, opts)
  }

  return player

  // =============== PRIVATE FUNCTIONS ============== //

  function track(name, node) {
    node.id = nextId++
    tracked[node.id] = node
    node.source.onended = function () {
      const now = ac.currentTime
      node.source.disconnect()
      node.env.disconnect()
      node.disconnect()
      player.emit('ended', now, node.id, node)
    }
    return node.id
  }

  function createNode(name, buffer, options) {
    const node = ac.createGain()
    node.gain.value = 0 // the envelope will control the gain
    node.connect(out)

    node.env = envelope(ac, options, opts)
    node.env.connect(node.gain)

    node.source = ac.createBufferSource()
    node.source.buffer = buffer
    node.source.connect(node)
    node.source.loop = options.loop || opts.loop
    node.source.playbackRate.value = centsToRate(options.cents || opts.cents)
    node.source.loopStart = options.loopStart || opts.loopStart
    node.source.loopEnd = options.loopEnd || opts.loopEnd
    node.stop = function (when) {
      const time = when || ac.currentTime
      player.emit('stop', time, name)
      const stopAt = node.env.stop(time)
      node.source.stop(stopAt)
    }
    return node
  }
}

function isNum(x) { return typeof x === 'number' }

const PARAMS = ['attack', 'decay', 'sustain', 'release']

function envelope(ac, options, opts) {
  const env = ADSR(ac)
  const adsr = options.adsr || opts.adsr
  PARAMS.forEach(function (name, i) {
    if (adsr) env[name] = adsr[i]
    else env[name] = options[name] || opts[name]
  })
  env.value.value = isNum(options.gain) ? options.gain
    : isNum(opts.gain) ? opts.gain : 1
  return env
}

/*
 * Get playback rate for a given pitch change (in cents)
 * Basic [math](http://www.birdsoft.demon.co.uk/music/samplert.htm):
 * f2 = f1 * 2^( C / 1200 )
 */
function centsToRate(cents) { return cents ? Math.pow(2, cents / 1200) : 1 }

module.exports = SamplePlayer

},{"../adsr/index":1}],13:[function(require,module,exports){
'use strict'

var isArr = Array.isArray
var isObj = function (o) { return o && typeof o === 'object' }
var OPTS = {}

module.exports = function (player) {
  /**
   * Schedule a list of events to be played at specific time.
   *
   * It supports three formats of events for the events list:
   *
   * - An array with [time, note]
   * - An array with [time, object]
   * - An object with { time: ?, [name|note|midi|key]: ? }
   *
   * @param {Float} time - an absolute time to start (or AudioContext's
   * currentTime if provided number is 0)
   * @param {Array} events - the events list.
   * @return {Array} an array of ids
   *
   * @example
   * // Event format: [time, note]
   * var piano = player(ac, ...).connect(ac.destination)
   * piano.schedule(0, [ [0, 'C2'], [0.5, 'C3'], [1, 'C4'] ])
   *
   * @example
   * // Event format: an object { time: ?, name: ? }
   * var drums = player(ac, ...).connect(ac.destination)
   * drums.schedule(0, [
   *   { name: 'kick', time: 0 },
   *   { name: 'snare', time: 0.5 },
   *   { name: 'kick', time: 1 },
   *   { name: 'snare', time: 1.5 }
   * ])
   */
  player.schedule = function (time, events) {
    var now = player.context.currentTime
    var when = time < now ? now : time
    player.emit('schedule', when, events)
    var t, o, note, opts
    return events.map(function (event) {
      if (!event) return null
      else if (isArr(event)) {
        t = event[0]; o = event[1]
      } else {
        t = event.time; o = event
      }

      if (isObj(o)) {
        note = o.name || o.key || o.note || o.midi || null
        opts = o
      } else {
        note = o
        opts = OPTS
      }

      return player.start(note, when + (t || 0), opts)
    })
  }
  return player
}

},{}],14:[function(require,module,exports){
'use strict'

const load = require('../audio-loader/index').load
const player = require('../sample-player/index').SamplePlayer

/**
 * Load a soundfont instrument. It returns a promise that resolves to a
 * instrument object.
 *
 * The instrument object returned by the promise has the following properties:
 *
 * - name: the instrument name
 * - play: A function to play notes from the buffer with the signature
 * `play(note, time, duration, options)`
 *
 *
 * The valid options are:
 *
 * - `format`: the soundfont format. 'mp3' by default. Can be 'ogg'
 * - `soundfont`: the soundfont name. 'MusyngKite' by default. Can be 'FluidR3_GM'
 * - `nameToUrl` <Function>: a function to convert from instrument names to URL
 * - `destination`: by default Soundfont uses the `audioContext.destination` but you can override it.
 * - `gain`: the gain of the player (1 by default)
 * - `notes`: an array of the notes to decode. It can be an array of strings
 * with note names or an array of numbers with midi note numbers. This is a
 * performance option: since decoding mp3 is a cpu intensive process, you can limit
 * limit the number of notes you want and reduce the time to load the instrument.
 *
 * @param {AudioContext} ac - the audio context
 * @param {String} name - the instrument name. For example: 'acoustic_grand_piano'
 * @param {Object} options - (Optional) the same options as Soundfont.loadBuffers
 * @return {Promise}
 *
 * @example
 * var Soundfont = require('sounfont-player')
 * Soundfont.instrument('marimba').then(function (marimba) {
 *   marimba.play('C4')
 * })
 */
function instrument(ac, name, options) {
  if (arguments.length === 1) return function (n, o) { return instrument(ac, n, o) }
  const opts = options || {}
  const isUrl = opts.isSoundfontURL || isSoundfontURL
  const toUrl = opts.nameToUrl || nameToUrl
  const url = isUrl(name) ? name : toUrl(name, opts.soundfont, opts.format)

  return load(ac, url, { only: opts.only || opts.notes }).then(function (buffers) {
    const p = player(ac, buffers, opts).connect(opts.destination ? opts.destination : ac.destination)
    p.url = url
    p.name = name
    return p
  })
}

function isSoundfontURL(name) {
  return /\.js(\?.*)?$/i.test(name)
}

/**
 * Given an instrument name returns a URL to to the Benjamin Gleitzman's
 * package of [pre-rendered sound fonts](https://github.com/gleitz/midi-js-soundfonts)
 *
 * @param {String} name - instrument name
 * @param {String} soundfont - (Optional) the soundfont name. One of 'FluidR3_GM'
 * or 'MusyngKite' ('MusyngKite' by default)
 * @param {String} format - (Optional) Can be 'mp3' or 'ogg' (mp3 by default)
 * @returns {String} the Soundfont file url
 * @example
 * var Soundfont = require('soundfont-player')
 * Soundfont.nameToUrl('marimba', 'mp3')
 */
function nameToUrl(name, sf, format) {
  format = format === 'ogg' ? format : 'mp3'
  sf = sf === 'FluidR3_GM' ? sf : 'MusyngKite'
  return 'https://gleitz.github.io/midi-js-soundfonts/' + sf + '/' + name + '-' + format + '.js'
}

const Soundfont = {
  instrument,
  nameToUrl,
}

module.exports = { Soundfont }

},{"../audio-loader/index":4,"../sample-player/index":10}],15:[function(require,module,exports){
const Constants = require('./constants').Constants;
const Utils = require('./utils').Utils;

/**
 * Class representing a track.  Contains methods for parsing events and keeping track of pointer.
 */
class Track {
	constructor(index, data) {
		this.enabled = true;
		this.eventIndex = 0;
		this.pointer = 0;
		this.lastTick = 0;
		this.lastStatus = null;
		this.index = index;
		this.data = data;
		this.delta = 0;
		this.runningDelta = 0;
		this.events = [];
	}

	/**
	 * Resets all stateful track informaion used during playback.
	 * @return {Track}
	 */
	reset() {
		this.enabled = true;
		this.eventIndex = 0;
		this.pointer = 0;
		this.lastTick = 0;
		this.lastStatus = null;
		this.delta = 0;
		this.runningDelta = 0;
		return this;
	}

	/**
	 * Sets this track to be enabled during playback.
	 * @return {Track}
	 */
	enable() {
		this.enabled = true;
		return this;
	}

	/**
	 * Sets this track to be disabled during playback.
	 * @return {Track}
	 */
	disable() {
		this.enabled = false;
		return this;
	}

	/**
	 * Sets the track event index to the nearest event to the given tick.
	 * @param {number} tick
	 * @return {Track}
	 */
	setEventIndexByTick(tick) {
		tick = tick || 0;

		for (let i in this.events) {
			if (this.events[i].tick >= tick) {
				this.eventIndex = i;
				return this;
			}
		}
	}

	/**
	 * Gets byte located at pointer position.
	 * @return {number}
	 */
	getCurrentByte() {
		return this.data[this.pointer];
	}

	/**
	 * Gets count of delta bytes and current pointer position.
	 * @return {number}
	 */
	getDeltaByteCount() {
		// Get byte count of delta VLV
		// http://www.ccarh.org/courses/253/handout/vlv/
		// If byte is greater or equal to 80h (128 decimal) then the next byte
		// is also part of the VLV,
		// else byte is the last byte in a VLV.
		let currentByte = this.getCurrentByte();
		let byteCount = 1;

		while (currentByte >= 128) {
			currentByte = this.data[this.pointer + byteCount];
			byteCount++;
		}

		return byteCount;
	}

	/**
	 * Get delta value at current pointer position.
	 * @return {number}
	 */
	getDelta() {
		return Utils.readVarInt(this.data.subarray(this.pointer, this.pointer + this.getDeltaByteCount()));
	}

	/**
	 * Handles event within a given track starting at specified index
	 * @param {number} currentTick
	 * @param {boolean} dryRun - If true events will be parsed and returned regardless of time.
	 */
	handleEvent(currentTick, dryRun) {
		dryRun = dryRun || false;

		if (dryRun) {
			const elapsedTicks = currentTick - this.lastTick;
			const delta = this.getDelta();
			const eventReady = elapsedTicks >= delta;

			if (this.pointer < this.data.length && (dryRun || eventReady)) {
				const event = this.parseEvent();
				if (this.enabled)
					return event;
				// Recursively call this function for each event ahead that has 0 delta time?
			}

		} else {
			// Let's actually play the MIDI from the generated JSON events created by the dry run.
			if (this.events[this.eventIndex] && this.events[this.eventIndex].tick <= currentTick) {
				this.eventIndex++;
				if (this.enabled)
					return this.events[this.eventIndex - 1];
			}
		}

		return null;
	}

	/**
	 * Get string data from event.
	 * @param {number} eventStartIndex
	 * @return {string}
	 */
	getStringData(eventStartIndex) {
		//const currentByte = this.pointer;
		const byteCount = 1;
		const length = Utils.readVarInt(this.data.subarray(eventStartIndex + 2, eventStartIndex + 2 + byteCount));
		//const stringLength = length;

		return Utils.bytesToLetters(this.data.subarray(eventStartIndex + byteCount + 2, eventStartIndex + byteCount + length + 2));
	}

	/**
	 * Parses event into JSON and advances pointer for the track
	 * @return {object}
	 */
	parseEvent() {
		const eventStartIndex = this.pointer + this.getDeltaByteCount();
		const eventJson = {};
		const deltaByteCount = this.getDeltaByteCount();
		eventJson.track = this.index + 1;
		eventJson.delta = this.getDelta();
		this.lastTick = this.lastTick + eventJson.delta;
		this.runningDelta += eventJson.delta;
		eventJson.tick = this.runningDelta;
		eventJson.byteIndex = this.pointer;

		//eventJson.raw = event;
		if (this.data[eventStartIndex] == 0xff) {
			// Meta Event

			// If this is a meta event we should emit the data and immediately move to the next event
			// otherwise if we let it run through the next cycle a slight delay will accumulate if multiple tracks
			// are being played simultaneously

			switch (this.data[eventStartIndex + 1]) {
				case 0x00: // Sequence Number
					eventJson.name = 'Sequence Number';
					break;
				case 0x01: // Text Event
					eventJson.name = 'Text Event';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x02: // Copyright Notice
					eventJson.name = 'Copyright Notice';
					break;
				case 0x03: // Sequence/Track Name
					eventJson.name = 'Sequence/Track Name';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x04: // Instrument Name
					eventJson.name = 'Instrument Name';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x05: // Lyric
					eventJson.name = 'Lyric';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x06: // Marker
					eventJson.name = 'Marker';
					break;
				case 0x07: // Cue Point
					eventJson.name = 'Cue Point';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x09: // Device Name
					eventJson.name = 'Device Name';
					eventJson.string = this.getStringData(eventStartIndex);
					break;
				case 0x20: // MIDI Channel Prefix
					eventJson.name = 'MIDI Channel Prefix';
					break;
				case 0x21: // MIDI Port
					eventJson.name = 'MIDI Port';
					eventJson.data = Utils.bytesToNumber([this.data[eventStartIndex + 3]]);
					break;
				case 0x2F: // End of Track
					eventJson.name = 'End of Track';
					break;
				case 0x51: // Set Tempo
					eventJson.name = 'Set Tempo';
					eventJson.data = Math.round(60000000 / Utils.bytesToNumber(this.data.subarray(eventStartIndex + 3, eventStartIndex + 6)));
					this.tempo = eventJson.data;
					break;
				case 0x54: // SMTPE Offset
					eventJson.name = 'SMTPE Offset';
					break;
				case 0x58: // Time Signature
					// FF 58 04 nn dd cc bb
					eventJson.name = 'Time Signature';
					eventJson.data = this.data.subarray(eventStartIndex + 3, eventStartIndex + 7);
					eventJson.timeSignature = "" + eventJson.data[0] + "/" + Math.pow(2, eventJson.data[1]);
					break;
				case 0x59: // Key Signature
					// FF 59 02 sf mi
					eventJson.name = 'Key Signature';
					eventJson.data = this.data.subarray(eventStartIndex + 3, eventStartIndex + 5);

					if (eventJson.data[0] >= 0) {
						eventJson.keySignature = Constants.CIRCLE_OF_FIFTHS[eventJson.data[0]];

					} else if (eventJson.data[0] < 0) {
						eventJson.keySignature = Constants.CIRCLE_OF_FOURTHS[Math.abs(eventJson.data[0])];
					}

					if (eventJson.data[1] == 0) {
						eventJson.keySignature += ' Major';

					} else if (eventJson.data[1] == 1) {
						eventJson.keySignature += ' Minor';
					}

					break;
				case 0x7F: // Sequencer-Specific Meta-event
					eventJson.name = 'Sequencer-Specific Meta-event';
					break;
				default:
					eventJson.name = `Unknown: ${this.data[eventStartIndex + 1].toString(16)}`;
					break;
			}

			const length = this.data[this.pointer + deltaByteCount + 2];
			// Some meta events will have vlv that needs to be handled

			this.pointer += deltaByteCount + 3 + length;

		} else if (this.data[eventStartIndex] == 0xf0) {
			// Sysex
			eventJson.name = 'Sysex';
			const length = this.data[this.pointer + deltaByteCount + 1];
			this.pointer += deltaByteCount + 2 + length;

		} else {
			// Voice event
			if (this.data[eventStartIndex] < 0x80) {
				// Running status
				eventJson.running = true;
				eventJson.noteNumber = this.data[eventStartIndex];
				eventJson.noteName = Constants.NOTES[this.data[eventStartIndex]];
				eventJson.velocity = this.data[eventStartIndex + 1];

				if (this.lastStatus <= 0x8f) {
					eventJson.name = 'Note off';
					eventJson.channel = this.lastStatus - 0x80 + 1;

				} else if (this.lastStatus <= 0x9f) {
					eventJson.name = 'Note on';
					eventJson.channel = this.lastStatus - 0x90 + 1;
				}

				this.pointer += deltaByteCount + 2;

			} else {
				this.lastStatus = this.data[eventStartIndex];

				if (this.data[eventStartIndex] <= 0x8f) {
					// Note off
					eventJson.name = 'Note off';
					eventJson.channel = this.lastStatus - 0x80 + 1;
					eventJson.noteNumber = this.data[eventStartIndex + 1];
					eventJson.noteName = Constants.NOTES[this.data[eventStartIndex + 1]];
					eventJson.velocity = Math.round(this.data[eventStartIndex + 2] / 127 * 100);
					this.pointer += deltaByteCount + 3;

				} else if (this.data[eventStartIndex] <= 0x9f) {
					// Note on
					eventJson.name = 'Note on';
					eventJson.channel = this.lastStatus - 0x90 + 1;
					eventJson.noteNumber = this.data[eventStartIndex + 1];
					eventJson.noteName = Constants.NOTES[this.data[eventStartIndex + 1]];
					eventJson.velocity = Math.round(this.data[eventStartIndex + 2] / 127 * 100);
					this.pointer += deltaByteCount + 3;

				} else if (this.data[eventStartIndex] <= 0xaf) {
					// Polyphonic Key Pressure
					eventJson.name = 'Polyphonic Key Pressure';
					eventJson.channel = this.lastStatus - 0xa0 + 1;
					eventJson.note = Constants.NOTES[this.data[eventStartIndex + 1]];
					eventJson.pressure = event[2];
					this.pointer += deltaByteCount + 3;

				} else if (this.data[eventStartIndex] <= 0xbf) {
					// Controller Change
					eventJson.name = 'Controller Change';
					eventJson.channel = this.lastStatus - 0xb0 + 1;
					eventJson.number = this.data[eventStartIndex + 1];
					eventJson.value = this.data[eventStartIndex + 2];
					this.pointer += deltaByteCount + 3;

				} else if (this.data[eventStartIndex] <= 0xcf) {
					// Program Change
					eventJson.name = 'Program Change';
					eventJson.channel = this.lastStatus - 0xc0 + 1;
					eventJson.value = this.data[eventStartIndex + 1];
					this.pointer += deltaByteCount + 2;

				} else if (this.data[eventStartIndex] <= 0xdf) {
					// Channel Key Pressure
					eventJson.name = 'Channel Key Pressure';
					eventJson.channel = this.lastStatus - 0xd0 + 1;
					this.pointer += deltaByteCount + 2;

				} else if (this.data[eventStartIndex] <= 0xef) {
					// Pitch Bend
					eventJson.name = 'Pitch Bend';
					eventJson.channel = this.lastStatus - 0xe0 + 1;
					this.pointer += deltaByteCount + 3;

				} else {
					eventJson.name = `Unknown.  Pointer: ${this.pointer.toString()} ${eventStartIndex.toString()} ${this.data.length}`;
				}
			}
		}

		this.delta += eventJson.delta;
		this.events.push(eventJson);

		return eventJson;
	}

	/**
	 * Returns true if pointer has reached the end of the track.
	 * @param {boolean}
	 */
	endOfTrack() {
		if (this.data[this.pointer + 1] == 0xff && this.data[this.pointer + 2] == 0x2f && this.data[this.pointer + 3] == 0x00)
			return true;

		return false;
	}
}

module.exports = { Track }

},{"./constants":5,"./utils":16}],16:[function(require,module,exports){
/**
 * Contains misc static utility methods.
 */
class Utils {

	/**
	 * Converts a single byte to a hex string.
	 * @param {number} byte
	 * @return {string}
	 */
	static byteToHex(byte) {
		// Ensure hex string always has two chars
		return `0${byte.toString(16)}`.slice(-2);
	}

	/**
	 * Converts an array of bytes to a hex string.
	 * @param {array} byteArray
	 * @return {string}
	 */
	static bytesToHex(byteArray) {
		const hex = [];
		byteArray.forEach(byte => hex.push(Utils.byteToHex(byte)));
		return hex.join('');
	}

	/**
	 * Converts a hex string to a number.
	 * @param {string} hexString
	 * @return {number}
	 */
	static hexToNumber(hexString) {
		return parseInt(hexString, 16);
	}

	/**
	 * Converts an array of bytes to a number.
	 * @param {array} byteArray
	 * @return {number}
	 */
	static bytesToNumber(byteArray) {
		return Utils.hexToNumber(Utils.bytesToHex(byteArray));
	}

	/**
	 * Converts an array of bytes to letters.
	 * @param {array} byteArray
	 * @return {string}
	 */
	static bytesToLetters(byteArray) {
		const letters = [];
		byteArray.forEach(byte => letters.push(String.fromCharCode(byte)));
		return letters.join('');
	}

	/**
	 * Converts a decimal to it's binary representation.
	 * @param {number} dec
	 * @return {string}
	 */
	static decToBinary(dec) {
		return (dec >>> 0).toString(2);
	}

	/**
	 * Reads a variable length value.
	 * @param {array} byteArray
	 * @return {number}
	 */
	static readVarInt(byteArray) {
		let result = 0;
		byteArray.forEach(number => {
			var b = number;
			if (b & 0x80) {
				result += (b & 0x7f);
				result <<= 7;
			} else {
				/* b is the last byte */
				result += b;
			}
		});

		return result;
	}

	/**
	 * Decodes base-64 encoded string
	 * @param {string} string
	 * @return {string}
	 */
	/* Only for NodeJS!
	static atob(string) {
		if (typeof atob === 'function') return atob(string);
		return new Buffer(string, 'base64').toString('binary');
	}
	*/
}

module.exports = { Utils }
},{}]},{},[6])(6)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWRzci9pbmRleC5qcyIsInNyYy9hdWRpby1sb2FkZXIvYmFzZTY0LmpzIiwic3JjL2F1ZGlvLWxvYWRlci9mZXRjaC5qcyIsInNyYy9hdWRpby1sb2FkZXIvaW5kZXguanMiLCJzcmMvY29uc3RhbnRzLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL25vdGUtcGFyc2VyL2luZGV4LmpzIiwic3JjL3BsYXllci5qcyIsInNyYy9zYW1wbGUtcGxheWVyL2V2ZW50cy5qcyIsInNyYy9zYW1wbGUtcGxheWVyL2luZGV4LmpzIiwic3JjL3NhbXBsZS1wbGF5ZXIvbm90ZXMuanMiLCJzcmMvc2FtcGxlLXBsYXllci9wbGF5ZXIuanMiLCJzcmMvc2FtcGxlLXBsYXllci9zY2hlZHVsZXIuanMiLCJzcmMvc291bmRmb250LXBsYXllci9pbmRleC5qcyIsInNyYy90cmFjay5qcyIsInNyYy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDck5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIlxuZnVuY3Rpb24gQURTUihhdWRpb0NvbnRleHQpIHtcbiAgY29uc3Qgbm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKClcblxuICBjb25zdCB2b2x0YWdlID0gbm9kZS5fdm9sdGFnZSA9IGdldFZvbHRhZ2UoYXVkaW9Db250ZXh0KVxuICBjb25zdCB2YWx1ZSA9IHNjYWxlKHZvbHRhZ2UpXG4gIGNvbnN0IHN0YXJ0VmFsdWUgPSBzY2FsZSh2b2x0YWdlKVxuICBjb25zdCBlbmRWYWx1ZSA9IHNjYWxlKHZvbHRhZ2UpXG5cbiAgbm9kZS5fc3RhcnRBbW91bnQgPSBzY2FsZShzdGFydFZhbHVlKVxuICBub2RlLl9lbmRBbW91bnQgPSBzY2FsZShlbmRWYWx1ZSlcblxuICBub2RlLl9tdWx0aXBsaWVyID0gc2NhbGUodmFsdWUpXG4gIG5vZGUuX211bHRpcGxpZXIuY29ubmVjdChub2RlKVxuICBub2RlLl9zdGFydEFtb3VudC5jb25uZWN0KG5vZGUpXG4gIG5vZGUuX2VuZEFtb3VudC5jb25uZWN0KG5vZGUpXG5cbiAgbm9kZS52YWx1ZSA9IHZhbHVlLmdhaW5cbiAgbm9kZS5zdGFydFZhbHVlID0gc3RhcnRWYWx1ZS5nYWluXG4gIG5vZGUuZW5kVmFsdWUgPSBlbmRWYWx1ZS5nYWluXG5cbiAgbm9kZS5zdGFydFZhbHVlLnZhbHVlID0gMFxuICBub2RlLmVuZFZhbHVlLnZhbHVlID0gMFxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKG5vZGUsIHByb3BzKVxuICByZXR1cm4gbm9kZVxufVxuXG5jb25zdCBwcm9wcyA9IHtcblxuICBhdHRhY2s6IHsgdmFsdWU6IDAsIHdyaXRhYmxlOiB0cnVlIH0sXG4gIGRlY2F5OiB7IHZhbHVlOiAwLCB3cml0YWJsZTogdHJ1ZSB9LFxuICBzdXN0YWluOiB7IHZhbHVlOiAxLCB3cml0YWJsZTogdHJ1ZSB9LFxuICByZWxlYXNlOiB7IHZhbHVlOiAwLCB3cml0YWJsZTogdHJ1ZSB9LFxuXG4gIGdldFJlbGVhc2VEdXJhdGlvbjoge1xuICAgIHZhbHVlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxlYXNlXG4gICAgfVxuICB9LFxuXG4gIHN0YXJ0OiB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uIChhdCkge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5fbXVsdGlwbGllci5nYWluXG4gICAgICBjb25zdCBzdGFydEFtb3VudCA9IHRoaXMuX3N0YXJ0QW1vdW50LmdhaW5cbiAgICAgIGNvbnN0IGVuZEFtb3VudCA9IHRoaXMuX2VuZEFtb3VudC5nYWluXG5cbiAgICAgIHRoaXMuX3ZvbHRhZ2Uuc3RhcnQoYXQpXG4gICAgICB0aGlzLl9kZWNheUZyb20gPSB0aGlzLl9kZWNheUZyb20gPSBhdCArIHRoaXMuYXR0YWNrXG4gICAgICB0aGlzLl9zdGFydGVkQXQgPSBhdFxuXG4gICAgICBjb25zdCBzdXN0YWluID0gdGhpcy5zdXN0YWluXG5cbiAgICAgIHRhcmdldC5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMoYXQpXG4gICAgICBzdGFydEFtb3VudC5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMoYXQpXG4gICAgICBlbmRBbW91bnQuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKGF0KVxuXG4gICAgICBlbmRBbW91bnQuc2V0VmFsdWVBdFRpbWUoMCwgYXQpXG5cbiAgICAgIGlmICh0aGlzLmF0dGFjaykge1xuICAgICAgICB0YXJnZXQuc2V0VmFsdWVBdFRpbWUoMCwgYXQpXG4gICAgICAgIHRhcmdldC5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgxLCBhdCArIHRoaXMuYXR0YWNrKVxuXG4gICAgICAgIHN0YXJ0QW1vdW50LnNldFZhbHVlQXRUaW1lKDEsIGF0KVxuICAgICAgICBzdGFydEFtb3VudC5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLCBhdCArIHRoaXMuYXR0YWNrKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGFyZ2V0LnNldFZhbHVlQXRUaW1lKDEsIGF0KVxuICAgICAgICBzdGFydEFtb3VudC5zZXRWYWx1ZUF0VGltZSgwLCBhdClcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuZGVjYXkpIHtcbiAgICAgICAgdGFyZ2V0LnNldFRhcmdldEF0VGltZShzdXN0YWluLCB0aGlzLl9kZWNheUZyb20sIGdldFRpbWVDb25zdGFudCh0aGlzLmRlY2F5KSlcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgc3RvcDoge1xuICAgIHZhbHVlOiBmdW5jdGlvbiAoYXQsIGlzVGFyZ2V0KSB7XG4gICAgICBpZiAoaXNUYXJnZXQpIHtcbiAgICAgICAgYXQgPSBhdCAtIHRoaXMucmVsZWFzZVxuICAgICAgfVxuXG4gICAgICBjb25zdCBlbmRUaW1lID0gYXQgKyB0aGlzLnJlbGVhc2VcbiAgICAgIGlmICh0aGlzLnJlbGVhc2UpIHtcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLl9tdWx0aXBsaWVyLmdhaW5cbiAgICAgICAgY29uc3Qgc3RhcnRBbW91bnQgPSB0aGlzLl9zdGFydEFtb3VudC5nYWluXG4gICAgICAgIGNvbnN0IGVuZEFtb3VudCA9IHRoaXMuX2VuZEFtb3VudC5nYWluXG5cbiAgICAgICAgdGFyZ2V0LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhhdClcbiAgICAgICAgc3RhcnRBbW91bnQuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKGF0KVxuICAgICAgICBlbmRBbW91bnQuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKGF0KVxuXG4gICAgICAgIGNvbnN0IGV4cEZhbGxvZmYgPSBnZXRUaW1lQ29uc3RhbnQodGhpcy5yZWxlYXNlKVxuXG4gICAgICAgIC8vIHRydW5jYXRlIGF0dGFjayAocmVxdWlyZWQgYXMgbGluZWFyUmFtcCBpcyByZW1vdmVkIGJ5IGNhbmNlbFNjaGVkdWxlZFZhbHVlcylcbiAgICAgICAgaWYgKHRoaXMuYXR0YWNrICYmIGF0IDwgdGhpcy5fZGVjYXlGcm9tKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWVBdFRpbWUgPSBnZXRWYWx1ZSgwLCAxLCB0aGlzLl9zdGFydGVkQXQsIHRoaXMuX2RlY2F5RnJvbSwgYXQpXG4gICAgICAgICAgdGFyZ2V0LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHZhbHVlQXRUaW1lLCBhdClcbiAgICAgICAgICBzdGFydEFtb3VudC5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgxIC0gdmFsdWVBdFRpbWUsIGF0KVxuICAgICAgICAgIHN0YXJ0QW1vdW50LnNldFRhcmdldEF0VGltZSgwLCBhdCwgZXhwRmFsbG9mZilcbiAgICAgICAgfVxuXG4gICAgICAgIGVuZEFtb3VudC5zZXRUYXJnZXRBdFRpbWUoMSwgYXQsIGV4cEZhbGxvZmYpXG4gICAgICAgIHRhcmdldC5zZXRUYXJnZXRBdFRpbWUoMCwgYXQsIGV4cEZhbGxvZmYpXG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3ZvbHRhZ2Uuc3RvcChlbmRUaW1lKVxuICAgICAgcmV0dXJuIGVuZFRpbWVcbiAgICB9XG4gIH0sXG5cbiAgb25lbmRlZDoge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZvbHRhZ2Uub25lbmRlZFxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHRoaXMuX3ZvbHRhZ2Uub25lbmRlZCA9IHZhbHVlXG4gICAgfVxuICB9XG5cbn1cblxuY29uc3QgZmxhdCA9IG5ldyBGbG9hdDMyQXJyYXkoWzEsIDFdKVxuZnVuY3Rpb24gZ2V0Vm9sdGFnZShjb250ZXh0KSB7XG4gIGNvbnN0IHZvbHRhZ2UgPSBjb250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpXG4gIGNvbnN0IGJ1ZmZlciA9IGNvbnRleHQuY3JlYXRlQnVmZmVyKDEsIDIsIGNvbnRleHQuc2FtcGxlUmF0ZSlcbiAgYnVmZmVyLmdldENoYW5uZWxEYXRhKDApLnNldChmbGF0KVxuICB2b2x0YWdlLmJ1ZmZlciA9IGJ1ZmZlclxuICB2b2x0YWdlLmxvb3AgPSB0cnVlXG4gIHJldHVybiB2b2x0YWdlXG59XG5cbmZ1bmN0aW9uIHNjYWxlKG5vZGUpIHtcbiAgY29uc3QgZ2FpbiA9IG5vZGUuY29udGV4dC5jcmVhdGVHYWluKClcbiAgbm9kZS5jb25uZWN0KGdhaW4pXG4gIHJldHVybiBnYWluXG59XG5cbmZ1bmN0aW9uIGdldFRpbWVDb25zdGFudCh0aW1lKSB7XG4gIHJldHVybiBNYXRoLmxvZyh0aW1lICsgMSkgLyBNYXRoLmxvZygxMDApXG59XG5cbmZ1bmN0aW9uIGdldFZhbHVlKHN0YXJ0LCBlbmQsIGZyb21UaW1lLCB0b1RpbWUsIGF0KSB7XG4gIGNvbnN0IGRpZmZlcmVuY2UgPSBlbmQgLSBzdGFydFxuICBjb25zdCB0aW1lID0gdG9UaW1lIC0gZnJvbVRpbWVcbiAgY29uc3QgdHJ1bmNhdGVUaW1lID0gYXQgLSBmcm9tVGltZVxuICBjb25zdCBwaGFzZSA9IHRydW5jYXRlVGltZSAvIHRpbWVcbiAgbGV0IHZhbHVlID0gc3RhcnQgKyBwaGFzZSAqIGRpZmZlcmVuY2VcblxuICBpZiAodmFsdWUgPD0gc3RhcnQpIHtcbiAgICB2YWx1ZSA9IHN0YXJ0XG4gIH1cbiAgaWYgKHZhbHVlID49IGVuZCkge1xuICAgIHZhbHVlID0gZW5kXG4gIH1cblxuICByZXR1cm4gdmFsdWVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBRFNSXG4iLCIndXNlIHN0cmljdCdcblxuLy8gREVDT0RFIFVUSUxJVElFU1xuZnVuY3Rpb24gYjY0VG9VaW50NihuQ2hyKSB7XG4gIHJldHVybiBuQ2hyID4gNjQgJiYgbkNociA8IDkxID8gbkNociAtIDY1XG4gICAgOiBuQ2hyID4gOTYgJiYgbkNociA8IDEyMyA/IG5DaHIgLSA3MVxuICAgICAgOiBuQ2hyID4gNDcgJiYgbkNociA8IDU4ID8gbkNociArIDRcbiAgICAgICAgOiBuQ2hyID09PSA0MyA/IDYyXG4gICAgICAgICAgOiBuQ2hyID09PSA0NyA/IDYzXG4gICAgICAgICAgICA6IDBcbn1cblxuLy8gRGVjb2RlIEJhc2U2NCB0byBVaW50OEFycmF5XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRlY29kZShzQmFzZTY0LCBuQmxvY2tzU2l6ZSkge1xuICB2YXIgc0I2NEVuYyA9IHNCYXNlNjQucmVwbGFjZSgvW15BLVphLXowLTlcXCtcXC9dL2csICcnKVxuICB2YXIgbkluTGVuID0gc0I2NEVuYy5sZW5ndGhcbiAgdmFyIG5PdXRMZW4gPSBuQmxvY2tzU2l6ZVxuICAgID8gTWF0aC5jZWlsKChuSW5MZW4gKiAzICsgMSA+PiAyKSAvIG5CbG9ja3NTaXplKSAqIG5CbG9ja3NTaXplXG4gICAgOiBuSW5MZW4gKiAzICsgMSA+PiAyXG4gIHZhciB0YUJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkobk91dExlbilcblxuICBmb3IgKHZhciBuTW9kMywgbk1vZDQsIG5VaW50MjQgPSAwLCBuT3V0SWR4ID0gMCwgbkluSWR4ID0gMDsgbkluSWR4IDwgbkluTGVuOyBuSW5JZHgrKykge1xuICAgIG5Nb2Q0ID0gbkluSWR4ICYgM1xuICAgIG5VaW50MjQgfD0gYjY0VG9VaW50NihzQjY0RW5jLmNoYXJDb2RlQXQobkluSWR4KSkgPDwgMTggLSA2ICogbk1vZDRcbiAgICBpZiAobk1vZDQgPT09IDMgfHwgbkluTGVuIC0gbkluSWR4ID09PSAxKSB7XG4gICAgICBmb3IgKG5Nb2QzID0gMDsgbk1vZDMgPCAzICYmIG5PdXRJZHggPCBuT3V0TGVuOyBuTW9kMysrICwgbk91dElkeCsrKSB7XG4gICAgICAgIHRhQnl0ZXNbbk91dElkeF0gPSBuVWludDI0ID4+PiAoMTYgPj4+IG5Nb2QzICYgMjQpICYgMjU1XG4gICAgICB9XG4gICAgICBuVWludDI0ID0gMFxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFCeXRlc1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgZGVjb2RlIH1cbiIsIi8qIGdsb2JhbCBYTUxIdHRwUmVxdWVzdCAqL1xuJ3VzZSBzdHJpY3QnXG5cbi8qKlxuICogR2l2ZW4gYSB1cmwgYW5kIGEgcmV0dXJuIHR5cGUsIHJldHVybnMgYSBwcm9taXNlIHRvIHRoZSBjb250ZW50IG9mIHRoZSB1cmxcbiAqIEJhc2ljYWxseSBpdCB3cmFwcyBhIFhNTEh0dHBSZXF1ZXN0IGludG8gYSBQcm9taXNlXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBjYW4gYmUgJ3RleHQnIG9yICdhcnJheWJ1ZmZlcidcbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHVybCwgdHlwZSkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKGRvbmUsIHJlamVjdCkge1xuICAgIHZhciByZXEgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICAgIGlmICh0eXBlKSByZXEucmVzcG9uc2VUeXBlID0gdHlwZVxuXG4gICAgcmVxLm9wZW4oJ0dFVCcsIHVybClcbiAgICByZXEub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVxLnN0YXR1cyA9PT0gMjAwID8gZG9uZShyZXEucmVzcG9uc2UpIDogcmVqZWN0KEVycm9yKHJlcS5zdGF0dXNUZXh0KSlcbiAgICB9XG4gICAgcmVxLm9uZXJyb3IgPSBmdW5jdGlvbiAoKSB7IHJlamVjdChFcnJvcignTmV0d29yayBFcnJvcicpKSB9XG4gICAgcmVxLnNlbmQoKVxuICB9KVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCcuL2Jhc2U2NCcpXG52YXIgZmV0Y2ggPSByZXF1aXJlKCcuL2ZldGNoJylcblxuLy8gR2l2ZW4gYSByZWdleCwgcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCB0ZXN0IGlmIGFnYWluc3QgYSBzdHJpbmdcbmZ1bmN0aW9uIGZyb21SZWdleChyKSB7XG4gIHJldHVybiBmdW5jdGlvbiAobykgeyByZXR1cm4gdHlwZW9mIG8gPT09ICdzdHJpbmcnICYmIHIudGVzdChvKSB9XG59XG4vLyBUcnkgdG8gYXBwbHkgYSBwcmVmaXggdG8gYSBuYW1lXG5mdW5jdGlvbiBwcmVmaXgocHJlLCBuYW1lKSB7XG4gIHJldHVybiB0eXBlb2YgcHJlID09PSAnc3RyaW5nJyA/IHByZSArIG5hbWVcbiAgICA6IHR5cGVvZiBwcmUgPT09ICdmdW5jdGlvbicgPyBwcmUobmFtZSlcbiAgICAgIDogbmFtZVxufVxuXG4vKipcbiAqIExvYWQgb25lIG9yIG1vcmUgYXVkaW8gZmlsZXNcbiAqXG4gKlxuICogUG9zc2libGUgb3B0aW9uIGtleXM6XG4gKlxuICogLSBfX2Zyb21fXyB7RnVuY3Rpb258U3RyaW5nfTogYSBmdW5jdGlvbiBvciBzdHJpbmcgdG8gY29udmVydCBmcm9tIGZpbGUgbmFtZXMgdG8gdXJscy5cbiAqIElmIGlzIGEgc3RyaW5nIGl0IHdpbGwgYmUgcHJlZml4ZWQgdG8gdGhlIG5hbWU6XG4gKiBgbG9hZChhYywgJ3NuYXJlLm1wMycsIHsgZnJvbTogJ2h0dHA6Ly9hdWRpby5uZXQvc2FtcGxlcy8nIH0pYFxuICogSWYgaXQncyBhIGZ1bmN0aW9uIGl0IHJlY2VpdmVzIHRoZSBmaWxlIG5hbWUgYW5kIHNob3VsZCByZXR1cm4gdGhlIHVybCBhcyBzdHJpbmcuXG4gKiAtIF9fb25seV9fIHtBcnJheX0gLSB3aGVuIGxvYWRpbmcgb2JqZWN0cywgaWYgcHJvdmlkZWQsIG9ubHkgdGhlIGdpdmVuIGtleXNcbiAqIHdpbGwgYmUgaW5jbHVkZWQgaW4gdGhlIGRlY29kZWQgb2JqZWN0OlxuICogYGxvYWQoYWMsICdwaWFuby5qc29uJywgeyBvbmx5OiBbJ0MyJywgJ0QyJ10gfSlgXG4gKlxuICogQHBhcmFtIHtBdWRpb0NvbnRleHR9IGFjIC0gdGhlIGF1ZGlvIGNvbnRleHRcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb3VyY2UgLSB0aGUgb2JqZWN0IHRvIGJlIGxvYWRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSAoT3B0aW9uYWwpIHRoZSBsb2FkIG9wdGlvbnMgZm9yIHRoYXQgb2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gZGVmYXVsdFZhbHVlIC0gKE9wdGlvbmFsKSB0aGUgZGVmYXVsdCB2YWx1ZSB0byByZXR1cm4gYXNcbiAqIGluIGEgcHJvbWlzZSBpZiBub3QgdmFsaWQgbG9hZGVyIGZvdW5kXG4gKi9cbmZ1bmN0aW9uIGxvYWQoYWMsIHNvdXJjZSwgb3B0aW9ucywgZGVmVmFsKSB7XG4gIHZhciBsb2FkZXIgPVxuICAgIC8vIEJhc2ljIGF1ZGlvIGxvYWRpbmdcbiAgICBpc0FycmF5QnVmZmVyKHNvdXJjZSkgPyBsb2FkQXJyYXlCdWZmZXJcbiAgICAgIDogaXNBdWRpb0ZpbGVOYW1lKHNvdXJjZSkgPyBsb2FkQXVkaW9GaWxlXG4gICAgICAgIDogaXNQcm9taXNlKHNvdXJjZSkgPyBsb2FkUHJvbWlzZVxuICAgICAgICAgIC8vIENvbXBvdW5kIG9iamVjdHNcbiAgICAgICAgICA6IGlzQXJyYXkoc291cmNlKSA/IGxvYWRBcnJheURhdGFcbiAgICAgICAgICAgIDogaXNPYmplY3Qoc291cmNlKSA/IGxvYWRPYmplY3REYXRhXG4gICAgICAgICAgICAgIDogaXNKc29uRmlsZU5hbWUoc291cmNlKSA/IGxvYWRKc29uRmlsZVxuICAgICAgICAgICAgICAgIC8vIEJhc2U2NCBlbmNvZGVkIGF1ZGlvXG4gICAgICAgICAgICAgICAgOiBpc0Jhc2U2NEF1ZGlvKHNvdXJjZSkgPyBsb2FkQmFzZTY0QXVkaW9cbiAgICAgICAgICAgICAgICAgIDogaXNKc0ZpbGVOYW1lKHNvdXJjZSkgPyBsb2FkTWlkaUpTRmlsZVxuICAgICAgICAgICAgICAgICAgICA6IG51bGxcblxuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge31cbiAgcmV0dXJuIGxvYWRlciA/IGxvYWRlcihhYywgc291cmNlLCBvcHRzKVxuICAgIDogZGVmVmFsID8gUHJvbWlzZS5yZXNvbHZlKGRlZlZhbClcbiAgICAgIDogUHJvbWlzZS5yZWplY3QoJ1NvdXJjZSBub3QgdmFsaWQgKCcgKyBzb3VyY2UgKyAnKScpXG59XG5sb2FkLmZldGNoID0gZmV0Y2hcblxuLy8gQkFTSUMgQVVESU8gTE9BRElOR1xuLy8gPT09PT09PT09PT09PT09PT09PVxuXG4vLyBMb2FkIChkZWNvZGUpIGFuIGFycmF5IGJ1ZmZlclxuZnVuY3Rpb24gaXNBcnJheUJ1ZmZlcihvKSB7IHJldHVybiBvIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgfVxuZnVuY3Rpb24gbG9hZEFycmF5QnVmZmVyKGFjLCBhcnJheSwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKGRvbmUsIHJlamVjdCkge1xuICAgIGFjLmRlY29kZUF1ZGlvRGF0YShhcnJheSxcbiAgICAgIGZ1bmN0aW9uIChidWZmZXIpIHsgZG9uZShidWZmZXIpIH0sXG4gICAgICBmdW5jdGlvbiAoKSB7IHJlamVjdChcIkNhbid0IGRlY29kZSBhdWRpbyBkYXRhIChcIiArIGFycmF5LnNsaWNlKDAsIDMwKSArICcuLi4pJykgfVxuICAgIClcbiAgfSlcbn1cblxuLy8gTG9hZCBhbiBhdWRpbyBmaWxlbmFtZVxudmFyIGlzQXVkaW9GaWxlTmFtZSA9IGZyb21SZWdleCgvXFwuKG1wM3x3YXZ8b2dnKShcXD8uKik/JC9pKVxuZnVuY3Rpb24gbG9hZEF1ZGlvRmlsZShhYywgbmFtZSwgb3B0aW9ucykge1xuICB2YXIgdXJsID0gcHJlZml4KG9wdGlvbnMuZnJvbSwgbmFtZSlcbiAgcmV0dXJuIGxvYWQoYWMsIGxvYWQuZmV0Y2godXJsLCAnYXJyYXlidWZmZXInKSwgb3B0aW9ucylcbn1cblxuLy8gTG9hZCB0aGUgcmVzdWx0IG9mIGEgcHJvbWlzZVxuZnVuY3Rpb24gaXNQcm9taXNlKG8pIHsgcmV0dXJuIG8gJiYgdHlwZW9mIG8udGhlbiA9PT0gJ2Z1bmN0aW9uJyB9XG5mdW5jdGlvbiBsb2FkUHJvbWlzZShhYywgcHJvbWlzZSwgb3B0aW9ucykge1xuICByZXR1cm4gcHJvbWlzZS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBsb2FkKGFjLCB2YWx1ZSwgb3B0aW9ucylcbiAgfSlcbn1cblxuLy8gQ09NUE9VTkQgT0JKRUNUU1xuLy8gPT09PT09PT09PT09PT09PVxuXG4vLyBUcnkgdG8gbG9hZCBhbGwgdGhlIGl0ZW1zIG9mIGFuIGFycmF5XG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXlcbmZ1bmN0aW9uIGxvYWRBcnJheURhdGEoYWMsIGFycmF5LCBvcHRpb25zKSB7XG4gIHJldHVybiBQcm9taXNlLmFsbChhcnJheS5tYXAoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICByZXR1cm4gbG9hZChhYywgZGF0YSwgb3B0aW9ucywgZGF0YSlcbiAgfSkpXG59XG5cbi8vIFRyeSB0byBsb2FkIGFsbCB0aGUgdmFsdWVzIG9mIGEga2V5L3ZhbHVlIG9iamVjdFxuZnVuY3Rpb24gaXNPYmplY3QobykgeyByZXR1cm4gbyAmJiB0eXBlb2YgbyA9PT0gJ29iamVjdCcgfVxuZnVuY3Rpb24gbG9hZE9iamVjdERhdGEoYWMsIG9iaiwgb3B0aW9ucykge1xuICB2YXIgZGVzdCA9IHt9XG4gIHZhciBwcm9taXNlcyA9IE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAob3B0aW9ucy5vbmx5ICYmIG9wdGlvbnMub25seS5pbmRleE9mKGtleSkgPT09IC0xKSByZXR1cm4gbnVsbFxuICAgIHZhciB2YWx1ZSA9IG9ialtrZXldXG4gICAgcmV0dXJuIGxvYWQoYWMsIHZhbHVlLCBvcHRpb25zLCB2YWx1ZSkudGhlbihmdW5jdGlvbiAoYXVkaW8pIHtcbiAgICAgIGRlc3Rba2V5XSA9IGF1ZGlvXG4gICAgfSlcbiAgfSlcbiAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRlc3QgfSlcbn1cblxuLy8gTG9hZCB0aGUgY29udGVudCBvZiBhIEpTT04gZmlsZVxudmFyIGlzSnNvbkZpbGVOYW1lID0gZnJvbVJlZ2V4KC9cXC5qc29uKFxcPy4qKT8kL2kpXG5mdW5jdGlvbiBsb2FkSnNvbkZpbGUoYWMsIG5hbWUsIG9wdGlvbnMpIHtcbiAgdmFyIHVybCA9IHByZWZpeChvcHRpb25zLmZyb20sIG5hbWUpXG4gIHJldHVybiBsb2FkKGFjLCBsb2FkLmZldGNoKHVybCwgJ3RleHQnKS50aGVuKEpTT04ucGFyc2UpLCBvcHRpb25zKVxufVxuXG4vLyBCQVNFNjQgRU5DT0RFRCBGT1JNQVRTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIExvYWQgc3RyaW5ncyB3aXRoIEJhc2U2NCBlbmNvZGVkIGF1ZGlvXG52YXIgaXNCYXNlNjRBdWRpbyA9IGZyb21SZWdleCgvXmRhdGE6YXVkaW8vKVxuZnVuY3Rpb24gbG9hZEJhc2U2NEF1ZGlvKGFjLCBzb3VyY2UsIG9wdGlvbnMpIHtcbiAgdmFyIGkgPSBzb3VyY2UuaW5kZXhPZignLCcpXG4gIHJldHVybiBsb2FkKGFjLCBiYXNlNjQuZGVjb2RlKHNvdXJjZS5zbGljZShpICsgMSkpLmJ1ZmZlciwgb3B0aW9ucylcbn1cblxuLy8gTG9hZCAuanMgZmlsZXMgd2l0aCBNaWRpSlMgc291bmRmb250IHByZXJlbmRlcmVkIGF1ZGlvXG52YXIgaXNKc0ZpbGVOYW1lID0gZnJvbVJlZ2V4KC9cXC5qcyhcXD8uKik/JC9pKVxuZnVuY3Rpb24gbG9hZE1pZGlKU0ZpbGUoYWMsIG5hbWUsIG9wdGlvbnMpIHtcbiAgdmFyIHVybCA9IHByZWZpeChvcHRpb25zLmZyb20sIG5hbWUpXG4gIHJldHVybiBsb2FkKGFjLCBsb2FkLmZldGNoKHVybCwgJ3RleHQnKS50aGVuKG1pZGlKc1RvSnNvbiksIG9wdGlvbnMpXG59XG5cbi8vIGNvbnZlcnQgYSBNSURJLmpzIGphdmFzY3JpcHQgc291bmRmb250IGZpbGUgdG8ganNvblxuZnVuY3Rpb24gbWlkaUpzVG9Kc29uKGRhdGEpIHtcbiAgdmFyIGJlZ2luID0gZGF0YS5pbmRleE9mKCdNSURJLlNvdW5kZm9udC4nKVxuICBpZiAoYmVnaW4gPCAwKSB0aHJvdyBFcnJvcignSW52YWxpZCBNSURJLmpzIFNvdW5kZm9udCBmb3JtYXQnKVxuICBiZWdpbiA9IGRhdGEuaW5kZXhPZignPScsIGJlZ2luKSArIDJcbiAgdmFyIGVuZCA9IGRhdGEubGFzdEluZGV4T2YoJywnKVxuICByZXR1cm4gSlNPTi5wYXJzZShkYXRhLnNsaWNlKGJlZ2luLCBlbmQpICsgJ30nKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgbG9hZCB9XG5cbiIsIi8qKlxuICogQ29uc3RhbnRzIHVzZWQgaW4gcGxheWVyLlxuICovXG5jb25zdCBDb25zdGFudHMgPSB7XG5cdFZFUlNJT046ICcyLjAuNCcsXG5cdE5PVEVTOiBbXSxcblx0Q0lSQ0xFX09GX0ZPVVJUSFM6IFsnQycsICdGJywgJ0JiJywgJ0ViJywgJ0FiJywgJ0RiJywgJ0diJywgJ0NiJywgJ0ZiJywgJ0JiYicsICdFYmInLCAnQWJiJ10sXG5cdENJUkNMRV9PRl9GSUZUSFM6IFsnQycsICdHJywgJ0QnLCAnQScsICdFJywgJ0InLCAnRiMnLCAnQyMnLCAnRyMnLCAnRCMnLCAnQSMnLCAnRSMnXVxufTtcblxuLy8gQnVpbGRzIG5vdGVzIG9iamVjdCBmb3IgcmVmZXJlbmNlIGFnYWluc3QgYmluYXJ5IHZhbHVlcy5cbmNvbnN0IGFsbE5vdGVzID0gW1snQyddLCBbJ0MjJywgJ0RiJ10sIFsnRCddLCBbJ0QjJywgJ0ViJ10sIFsnRSddLCBbJ0YnXSwgWydGIycsICdHYiddLCBbJ0cnXSwgWydHIycsICdBYiddLCBbJ0EnXSwgWydBIycsICdCYiddLCBbJ0InXV07XG5sZXQgY291bnRlciA9IDA7XG5cbi8vIEFsbCBhdmFpbGFibGUgb2N0YXZlcy5cbmZvciAobGV0IGkgPSAtMTsgaSA8PSA5OyBpKyspIHtcblx0YWxsTm90ZXMuZm9yRWFjaChub3RlR3JvdXAgPT4ge1xuXHRcdG5vdGVHcm91cC5mb3JFYWNoKG5vdGUgPT4gQ29uc3RhbnRzLk5PVEVTW2NvdW50ZXJdID0gbm90ZSArIGkpO1xuXHRcdGNvdW50ZXIrKztcblx0fSk7XG59XG5cbm1vZHVsZS5leHBvcnRzLkNvbnN0YW50cyA9IENvbnN0YW50cztcbiIsImNvbnN0IFBsYXllciA9IHJlcXVpcmUoJy4vcGxheWVyJyk7XG5jb25zdCBTb3VuZGZvbnQgPSByZXF1aXJlKCcuL3NvdW5kZm9udC1wbGF5ZXIvaW5kZXgnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGxheWVyOiBQbGF5ZXIuUGxheWVyLFxuICAgIFNvdW5kZm9udDogU291bmRmb250LlNvdW5kZm9udCxcbn1cblxuIiwiJ3VzZSBzdHJpY3QnXG5cbi8vIHV0aWxcbmNvbnN0IGZpbGxTdHIgPSAocywgbnVtKSA9PiBBcnJheShudW0gKyAxKS5qb2luKHMpXG5jb25zdCBpc051bSA9IHggPT4gdHlwZW9mIHggPT09ICdudW1iZXInXG5jb25zdCBpc1N0ciA9IHggPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnXG5jb25zdCBpc0RlZiA9IHggPT4gdHlwZW9mIHggIT09ICd1bmRlZmluZWQnXG5jb25zdCBtaWRpVG9GcmVxID0gKG1pZGksIHR1bmluZykgPT4gTWF0aC5wb3coMiwgKG1pZGkgLSA2OSkgLyAxMikgKiAodHVuaW5nIHx8IDQ0MClcblxuY29uc3QgUkVHRVggPSAvXihbYS1nQS1HXSkoI3sxLH18YnsxLH18eHsxLH18KSgtP1xcZCopXFxzKiguKilcXHMqJC9cbi8qKlxuICogQSByZWdleCBmb3IgbWF0Y2hpbmcgbm90ZSBzdHJpbmdzIGluIHNjaWVudGlmaWMgbm90YXRpb24uXG4gKlxuICogQG5hbWUgcmVnZXhcbiAqIEBmdW5jdGlvblxuICogQHJldHVybiB7UmVnRXhwfSB0aGUgcmVnZXhwIHVzZWQgdG8gcGFyc2UgdGhlIG5vdGUgbmFtZVxuICpcbiAqIFRoZSBub3RlIHN0cmluZyBzaG91bGQgaGF2ZSB0aGUgZm9ybSBgbGV0dGVyW2FjY2lkZW50YWxzXVtvY3RhdmVdW2VsZW1lbnRdYFxuICogd2hlcmU6XG4gKlxuICogLSBsZXR0ZXI6IChSZXF1aXJlZCkgaXMgYSBsZXR0ZXIgZnJvbSBBIHRvIEcgZWl0aGVyIHVwcGVyIG9yIGxvd2VyIGNhc2VcbiAqIC0gYWNjaWRlbnRhbHM6IChPcHRpb25hbCkgY2FuIGJlIG9uZSBvciBtb3JlIGBiYCAoZmxhdHMpLCBgI2AgKHNoYXJwcykgb3IgYHhgIChkb3VibGUgc2hhcnBzKS5cbiAqIFRoZXkgY2FuIE5PVCBiZSBtaXhlZC5cbiAqIC0gb2N0YXZlOiAoT3B0aW9uYWwpIGEgcG9zaXRpdmUgb3IgbmVnYXRpdmUgaW50ZWdlclxuICogLSBlbGVtZW50OiAoT3B0aW9uYWwpIGFkZGl0aW9uYWxseSBhbnl0aGluZyBhZnRlciB0aGUgZHVyYXRpb24gaXMgY29uc2lkZXJlZCB0b1xuICogYmUgdGhlIGVsZW1lbnQgbmFtZSAoZm9yIGV4YW1wbGU6ICdDMiBkb3JpYW4nKVxuICpcbiAqIFRoZSBleGVjdXRlZCByZWdleCBjb250YWlucyAoYnkgYXJyYXkgaW5kZXgpOlxuICpcbiAqIC0gMDogdGhlIGNvbXBsZXRlIHN0cmluZ1xuICogLSAxOiB0aGUgbm90ZSBsZXR0ZXJcbiAqIC0gMjogdGhlIG9wdGlvbmFsIGFjY2lkZW50YWxzXG4gKiAtIDM6IHRoZSBvcHRpb25hbCBvY3RhdmVcbiAqIC0gNDogdGhlIHJlc3Qgb2YgdGhlIHN0cmluZyAodHJpbW1lZClcbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIHBhcnNlciA9IHJlcXVpcmUoJ25vdGUtcGFyc2VyJylcbiAqIHBhcnNlci5yZWdleC5leGVjKCdjIzQnKVxuICogLy8gPT4gWydjIzQnLCAnYycsICcjJywgJzQnLCAnJ11cbiAqIHBhcnNlci5yZWdleC5leGVjKCdjIzQgbWFqb3InKVxuICogLy8gPT4gWydjIzRtYWpvcicsICdjJywgJyMnLCAnNCcsICdtYWpvciddXG4gKiBwYXJzZXIucmVnZXgoKS5leGVjKCdDTWFqNycpXG4gKiAvLyA9PiBbJ0NNYWo3JywgJ0MnLCAnJywgJycsICdNYWo3J11cbiAqL1xuZnVuY3Rpb24gcmVnZXgoKSB7IHJldHVybiBSRUdFWCB9O1xuXG5jb25zdCBTRU1JVE9ORVMgPSBbMCwgMiwgNCwgNSwgNywgOSwgMTFdXG4vKipcbiAqIFBhcnNlIGEgbm90ZSBuYW1lIGluIHNjaWVudGlmaWMgbm90YXRpb24gYW4gcmV0dXJuIGl0J3MgY29tcG9uZW50cyxcbiAqIGFuZCBzb21lIG51bWVyaWMgcHJvcGVydGllcyBpbmNsdWRpbmcgbWlkaSBudW1iZXIgYW5kIGZyZXF1ZW5jeS5cbiAqXG4gKiBAbmFtZSBwYXJzZVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gbm90ZSAtIHRoZSBub3RlIHN0cmluZyB0byBiZSBwYXJzZWRcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaXNUb25pYyAtIHRydWUgdGhlIHN0cmluZ3MgaXQncyBzdXBwb3NlZCB0byBjb250YWluIGEgbm90ZSBudW1iZXJcbiAqIGFuZCBzb21lIGNhdGVnb3J5IChmb3IgZXhhbXBsZSBhbiBzY2FsZTogJ0MjIG1ham9yJykuIEl0J3MgZmFsc2UgYnkgZGVmYXVsdCxcbiAqIGJ1dCB3aGVuIHRydWUsIGVuIGV4dHJhIHRvbmljT2YgcHJvcGVydHkgaXMgcmV0dXJuZWQgd2l0aCB0aGUgY2F0ZWdvcnkgKCdtYWpvcicpXG4gKiBAcGFyYW0ge0Zsb2F0fSB0dW5uaW5nIC0gVGhlIGZyZXF1ZW5jeSBvZiBBNCBub3RlIHRvIGNhbGN1bGF0ZSBmcmVxdWVuY2llcy5cbiAqIEJ5IGRlZmF1bHQgaXQgNDQwLlxuICogQHJldHVybiB7T2JqZWN0fSB0aGUgcGFyc2VkIG5vdGUgbmFtZSBvciBudWxsIGlmIG5vdCBhIHZhbGlkIG5vdGVcbiAqXG4gKiBUaGUgcGFyc2VkIG5vdGUgbmFtZSBvYmplY3Qgd2lsbCBBTFdBWVMgY29udGFpbnM6XG4gKiAtIGxldHRlcjogdGhlIHVwcGVyY2FzZSBsZXR0ZXIgb2YgdGhlIG5vdGVcbiAqIC0gYWNjOiB0aGUgYWNjaWRlbnRhbHMgb2YgdGhlIG5vdGUgKG9ubHkgc2hhcnBzIG9yIGZsYXRzKVxuICogLSBwYzogdGhlIHBpdGNoIGNsYXNzIChsZXR0ZXIgKyBhY2MpXG4gKiAtIHN0ZXA6IHMgYSBudW1lcmljIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBsZXR0ZXIuIEl0J3MgYW4gaW50ZWdlciBmcm9tIDAgdG8gNlxuICogd2hlcmUgMCA9IEMsIDEgPSBEIC4uLiA2ID0gQlxuICogLSBhbHQ6IGEgbnVtZXJpYyByZXByZXNlbnRhdGlvbiBvZiB0aGUgYWNjaWRlbnRhbHMuIDAgbWVhbnMgbm8gYWx0ZXJhdGlvbixcbiAqIHBvc2l0aXZlIG51bWJlcnMgYXJlIGZvciBzaGFycHMgYW5kIG5lZ2F0aXZlIGZvciBmbGF0c1xuICogLSBjaHJvbWE6IGEgbnVtZXJpYyByZXByZXNlbnRhdGlvbiBvZiB0aGUgcGl0Y2ggY2xhc3MuIEl0J3MgbGlrZSBtaWRpIGZvclxuICogcGl0Y2ggY2xhc3Nlcy4gMCA9IEMsIDEgPSBDIywgMiA9IEQgLi4uIDExID0gQi4gQ2FuIGJlIHVzZWQgdG8gZmluZCBlbmhhcm1vbmljc1xuICogc2luY2UsIGZvciBleGFtcGxlLCBjaHJvbWEgb2YgJ0NiJyBhbmQgJ0InIGFyZSBib3RoIDExXG4gKlxuICogSWYgdGhlIG5vdGUgaGFzIG9jdGF2ZSwgdGhlIHBhcnNlciBvYmplY3Qgd2lsbCBjb250YWluOlxuICogLSBvY3Q6IHRoZSBvY3RhdmUgbnVtYmVyIChhcyBpbnRlZ2VyKVxuICogLSBtaWRpOiB0aGUgbWlkaSBudW1iZXJcbiAqIC0gZnJlcTogdGhlIGZyZXF1ZW5jeSAodXNpbmcgdHVuaW5nIHBhcmFtZXRlciBhcyBiYXNlKVxuICpcbiAqIElmIHRoZSBwYXJhbWV0ZXIgYGlzVG9uaWNgIGlzIHNldCB0byB0cnVlLCB0aGUgcGFyc2VkIG9iamVjdCB3aWxsIGNvbnRhaW46XG4gKiAtIHRvbmljT2Y6IHRoZSByZXN0IG9mIHRoZSBzdHJpbmcgdGhhdCBmb2xsb3dzIG5vdGUgbmFtZSAobGVmdCBhbmQgcmlnaHQgdHJpbW1lZClcbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIHBhcnNlID0gcmVxdWlyZSgnbm90ZS1wYXJzZXInKS5wYXJzZVxuICogcGFyc2UoJ0NiNCcpXG4gKiAvLyA9PiB7IGxldHRlcjogJ0MnLCBhY2M6ICdiJywgcGM6ICdDYicsIHN0ZXA6IDAsIGFsdDogLTEsIGNocm9tYTogLTEsXG4gKiAgICAgICAgIG9jdDogNCwgbWlkaTogNTksIGZyZXE6IDI0Ni45NDE2NTA2MjgwNjIwNiB9XG4gKiAvLyBpZiBubyBvY3RhdmUsIG5vIG1pZGksIG5vIGZyZXFcbiAqIHBhcnNlKCdmeCcpXG4gKiAvLyA9PiB7IGxldHRlcjogJ0YnLCBhY2M6ICcjIycsIHBjOiAnRiMjJywgc3RlcDogMywgYWx0OiAyLCBjaHJvbWE6IDcgfSlcbiAqL1xuZnVuY3Rpb24gcGFyc2Uoc3RyLCBpc1RvbmljLCB0dW5pbmcpIHtcbiAgaWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKVxuICAgIHJldHVybiBudWxsXG4gIGNvbnN0IG0gPSBSRUdFWC5leGVjKHN0cilcbiAgaWYgKCFtIHx8ICghaXNUb25pYyAmJiBtWzRdKSlcbiAgICByZXR1cm4gbnVsbFxuXG4gIGNvbnN0IHAgPSB7IGxldHRlcjogbVsxXS50b1VwcGVyQ2FzZSgpLCBhY2M6IG1bMl0ucmVwbGFjZSgveC9nLCAnIyMnKSB9XG4gIHAucGMgPSBwLmxldHRlciArIHAuYWNjXG4gIHAuc3RlcCA9IChwLmxldHRlci5jaGFyQ29kZUF0KDApICsgMykgJSA3XG4gIHAuYWx0ID0gcC5hY2NbMF0gPT09ICdiJyA/IC1wLmFjYy5sZW5ndGggOiBwLmFjYy5sZW5ndGhcbiAgY29uc3QgcG9zID0gU0VNSVRPTkVTW3Auc3RlcF0gKyBwLmFsdFxuICBwLmNocm9tYSA9IHBvcyA8IDAgPyAxMiArIHBvcyA6IHBvcyAlIDEyXG4gIGlmIChtWzNdKSB7IC8vIGhhcyBvY3RhdmVcbiAgICBwLm9jdCA9ICttWzNdXG4gICAgcC5taWRpID0gcG9zICsgMTIgKiAocC5vY3QgKyAxKVxuICAgIHAuZnJlcSA9IG1pZGlUb0ZyZXEocC5taWRpLCB0dW5pbmcpXG4gIH1cbiAgaWYgKGlzVG9uaWMpXG4gICAgcC50b25pY09mID0gbVs0XVxuICByZXR1cm4gcFxufVxuXG5jb25zdCBMRVRURVJTID0gJ0NERUZHQUInXG5jb25zdCBhY2NTdHIgPSBuID0+ICFpc051bShuKSA/ICcnIDogbiA8IDAgPyBmaWxsU3RyKCdiJywgLW4pIDogZmlsbFN0cignIycsIG4pXG5jb25zdCBvY3RTdHIgPSBuID0+ICFpc051bShuKSA/ICcnIDogJycgKyBuXG5cbi8qKlxuICogQ3JlYXRlIGEgc3RyaW5nIGZyb20gYSBwYXJzZWQgb2JqZWN0IG9yIGBzdGVwLCBhbHRlcmF0aW9uLCBvY3RhdmVgIHBhcmFtZXRlcnNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogLSB0aGUgcGFyc2VkIGRhdGEgb2JqZWN0XG4gKiBAcmV0dXJuIHtTdHJpbmd9IGEgbm90ZSBzdHJpbmcgb3IgbnVsbCBpZiBub3QgdmFsaWQgcGFyYW1ldGVyc1xuICogQHNpbmNlIDEuMlxuICogQGV4YW1wbGVcbiAqIHBhcnNlci5idWlsZChwYXJzZXIucGFyc2UoJ2NiMicpKSAvLyA9PiAnQ2IyJ1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBpdCBhY2NlcHRzIChzdGVwLCBhbHRlcmF0aW9uLCBvY3RhdmUpIHBhcmFtZXRlcnM6XG4gKiBwYXJzZXIuYnVpbGQoMykgLy8gPT4gJ0YnXG4gKiBwYXJzZXIuYnVpbGQoMywgLTEpIC8vID0+ICdGYidcbiAqIHBhcnNlci5idWlsZCgzLCAtMSwgNCkgLy8gPT4gJ0ZiNCdcbiAqL1xuZnVuY3Rpb24gYnVpbGQocywgYSwgbykge1xuICBpZiAocyA9PT0gbnVsbCB8fCB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgcmV0dXJuIG51bGxcbiAgaWYgKHMuc3RlcClcbiAgICByZXR1cm4gYnVpbGQocy5zdGVwLCBzLmFsdCwgcy5vY3QpXG4gIGlmIChzIDwgMCB8fCBzID4gNilcbiAgICByZXR1cm4gbnVsbFxuICByZXR1cm4gTEVUVEVSUy5jaGFyQXQocykgKyBhY2NTdHIoYSkgKyBvY3RTdHIobylcbn1cblxuLyoqXG4gKiBHZXQgbWlkaSBvZiBhIG5vdGVcbiAqXG4gKiBAbmFtZSBtaWRpXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nfEludGVnZXJ9IG5vdGUgLSB0aGUgbm90ZSBuYW1lIG9yIG1pZGkgbnVtYmVyXG4gKiBAcmV0dXJuIHtJbnRlZ2VyfSB0aGUgbWlkaSBudW1iZXIgb2YgdGhlIG5vdGUgb3IgbnVsbCBpZiBub3QgYSB2YWxpZCBub3RlXG4gKiBvciB0aGUgbm90ZSBkb2VzIE5PVCBjb250YWlucyBvY3RhdmVcbiAqIEBleGFtcGxlXG4gKiB2YXIgcGFyc2VyID0gcmVxdWlyZSgnbm90ZS1wYXJzZXInKVxuICogcGFyc2VyLm1pZGkoJ0E0JykgLy8gPT4gNjlcbiAqIHBhcnNlci5taWRpKCdBJykgLy8gPT4gbnVsbFxuICogQGV4YW1wbGVcbiAqIC8vIG1pZGkgbnVtYmVycyBhcmUgYnlwYXNzZWQgKGV2ZW4gYXMgc3RyaW5ncylcbiAqIHBhcnNlci5taWRpKDYwKSAvLyA9PiA2MFxuICogcGFyc2VyLm1pZGkoJzYwJykgLy8gPT4gNjBcbiAqL1xuZnVuY3Rpb24gbWlkaShub3RlKSB7XG4gIGlmICgoaXNOdW0obm90ZSkgfHwgaXNTdHIobm90ZSkpICYmIG5vdGUgPj0gMCAmJiBub3RlIDwgMTI4KVxuICAgIHJldHVybiArbm90ZVxuICBjb25zdCBwID0gcGFyc2Uobm90ZSlcbiAgcmV0dXJuIHAgJiYgaXNEZWYocC5taWRpKSA/IHAubWlkaSA6IG51bGxcbn1cblxuLyoqXG4gKiBHZXQgZnJlcSBvZiBhIG5vdGUgaW4gaGVydHpzIChpbiBhIHdlbGwgdGVtcGVyZWQgNDQwSHogQTQpXG4gKlxuICogQG5hbWUgZnJlcVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gbm90ZSAtIHRoZSBub3RlIG5hbWUgb3Igbm90ZSBtaWRpIG51bWJlclxuICogQHBhcmFtIHtTdHJpbmd9IHR1bmluZyAtIChPcHRpb25hbCkgdGhlIEE0IGZyZXF1ZW5jeSAoNDQwIGJ5IGRlZmF1bHQpXG4gKiBAcmV0dXJuIHtGbG9hdH0gdGhlIGZyZXEgb2YgdGhlIG51bWJlciBpZiBoZXJ0enMgb3IgbnVsbCBpZiBub3QgdmFsaWQgbm90ZVxuICogQGV4YW1wbGVcbiAqIHZhciBwYXJzZXIgPSByZXF1aXJlKCdub3RlLXBhcnNlcicpXG4gKiBwYXJzZXIuZnJlcSgnQTQnKSAvLyA9PiA0NDBcbiAqIHBhcnNlci5mcmVxKCdBJykgLy8gPT4gbnVsbFxuICogQGV4YW1wbGVcbiAqIC8vIGNhbiBjaGFuZ2UgdHVuaW5nICg0NDAgYnkgZGVmYXVsdClcbiAqIHBhcnNlci5mcmVxKCdBNCcsIDQ0NCkgLy8gPT4gNDQ0XG4gKiBwYXJzZXIuZnJlcSgnQTMnLCA0NDQpIC8vID0+IDIyMlxuICogQGV4YW1wbGVcbiAqIC8vIGl0IGFjY2VwdHMgbWlkaSBudW1iZXJzIChhcyBudW1iZXJzIGFuZCBhcyBzdHJpbmdzKVxuICogcGFyc2VyLmZyZXEoNjkpIC8vID0+IDQ0MFxuICogcGFyc2VyLmZyZXEoJzY5JywgNDQyKSAvLyA9PiA0NDJcbiAqL1xuZnVuY3Rpb24gZnJlcShub3RlLCB0dW5pbmcpIHtcbiAgY29uc3QgbSA9IG1pZGkobm90ZSlcbiAgcmV0dXJuIG0gPT09IG51bGwgPyBudWxsIDogbWlkaVRvRnJlcShtLCB0dW5pbmcpXG59XG5cbmNvbnN0IGxldHRlciA9IHNyYyA9PiAocGFyc2Uoc3JjKSB8fCB7fSkubGV0dGVyXG5jb25zdCBhY2MgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLmFjY1xuY29uc3QgcGMgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLnBjXG5jb25zdCBzdGVwID0gc3JjID0+IChwYXJzZShzcmMpIHx8IHt9KS5zdGVwXG5jb25zdCBhbHQgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLmFsdFxuY29uc3QgY2hyb21hID0gc3JjID0+IChwYXJzZShzcmMpIHx8IHt9KS5jaHJvbWFcbmNvbnN0IG9jdCA9IHNyYyA9PiAocGFyc2Uoc3JjKSB8fCB7fSkub2N0XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZWdleCxcbiAgcGFyc2UsXG4gIGJ1aWxkLFxuICBtaWRpLFxuICBmcmVxLFxuICBsZXR0ZXIsXG4gIGFjYyxcbiAgcGMsXG4gIHN0ZXAsXG4gIGFsdCxcbiAgY2hyb21hLFxuICBvY3QsXG59XG4iLCJjb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKS5VdGlscztcbmNvbnN0IFRyYWNrID0gcmVxdWlyZSgnLi90cmFjaycpLlRyYWNrO1xuXG4vLyBQb2x5ZmlsbCBVaW50OEFycmF5LmZvckVhY2g6IERvZXNuJ3QgZXhpc3Qgb24gU2FmYXJpIDwxMFxuaWYgKCFVaW50OEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShVaW50OEFycmF5LnByb3RvdHlwZSwgJ2ZvckVhY2gnLCB7XG5cdFx0dmFsdWU6IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoXG5cdH0pO1xufVxuXG4vKipcbiAqIE1haW4gcGxheWVyIGNsYXNzLiAgQ29udGFpbnMgbWV0aG9kcyB0byBsb2FkIGZpbGVzLCBzdGFydCwgc3RvcC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IC0gQ2FsbGJhY2sgdG8gZmlyZSBmb3IgZWFjaCBNSURJIGV2ZW50LiAgQ2FuIGFsc28gYmUgYWRkZWQgd2l0aCBvbignbWlkaUV2ZW50JywgZm4pXG4gKiBAcGFyYW0ge2FycmF5fSAtIEFycmF5IGJ1ZmZlciBvZiBNSURJIGZpbGUgKG9wdGlvbmFsKS5cbiAqL1xuY2xhc3MgUGxheWVyIHtcblx0Y29uc3RydWN0b3IoZXZlbnRIYW5kbGVyLCBidWZmZXIpIHtcblx0XHR0aGlzLnNhbXBsZVJhdGUgPSA1OyAvLyBtaWxsaXNlY29uZHNcblx0XHR0aGlzLnN0YXJ0VGltZSA9IDA7XG5cdFx0dGhpcy5idWZmZXIgPSBidWZmZXIgfHwgbnVsbDtcblx0XHR0aGlzLmRpdmlzaW9uO1xuXHRcdHRoaXMuZm9ybWF0O1xuXHRcdHRoaXMuc2V0SW50ZXJ2YWxJZCA9IGZhbHNlO1xuXHRcdHRoaXMudHJhY2tzID0gW107XG5cdFx0dGhpcy5pbnN0cnVtZW50cyA9IFtdO1xuXHRcdHRoaXMuZGVmYXVsdFRlbXBvID0gMTIwO1xuXHRcdHRoaXMudGVtcG8gPSBudWxsO1xuXHRcdHRoaXMuc3RhcnRUaWNrID0gMDtcblx0XHR0aGlzLnRpY2sgPSAwO1xuXHRcdHRoaXMubGFzdFRpY2sgPSBudWxsO1xuXHRcdHRoaXMuaW5Mb29wID0gZmFsc2U7XG5cdFx0dGhpcy50b3RhbFRpY2tzID0gMDtcblx0XHR0aGlzLmV2ZW50cyA9IFtdO1xuXHRcdHRoaXMudG90YWxFdmVudHMgPSAwO1xuXHRcdHRoaXMuZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuXHRcdGlmICh0eXBlb2YgKGV2ZW50SGFuZGxlcikgPT09ICdmdW5jdGlvbicpIHRoaXMub24oJ21pZGlFdmVudCcsIGV2ZW50SGFuZGxlcik7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZCBhIGZpbGUgaW50byB0aGUgcGxheWVyIChOb2RlLmpzIG9ubHkpLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gcGF0aCAtIFBhdGggb2YgZmlsZS5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0bG9hZEZpbGUocGF0aCkge1xuXHRcdGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcblx0XHR0aGlzLmJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhwYXRoKTtcblx0XHRyZXR1cm4gdGhpcy5maWxlTG9hZGVkKCk7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZCBhbiBhcnJheSBidWZmZXIgaW50byB0aGUgcGxheWVyLlxuXHQgKiBAcGFyYW0ge2FycmF5fSBhcnJheUJ1ZmZlciAtIEFycmF5IGJ1ZmZlciBvZiBmaWxlIHRvIGJlIGxvYWRlZC5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0bG9hZEFycmF5QnVmZmVyKGFycmF5QnVmZmVyKSB7XG5cdFx0dGhpcy5idWZmZXIgPSBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcik7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUxvYWRlZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvYWQgYSBkYXRhIFVSSSBpbnRvIHRoZSBwbGF5ZXIuXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBkYXRhVXJpIC0gRGF0YSBVUkkgdG8gYmUgbG9hZGVkLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRsb2FkRGF0YVVyaShkYXRhVXJpKSB7XG5cdFx0Ly8gY29udmVydCBiYXNlNjQgdG8gcmF3IGJpbmFyeSBkYXRhIGhlbGQgaW4gYSBzdHJpbmcuXG5cdFx0Ly8gZG9lc24ndCBoYW5kbGUgVVJMRW5jb2RlZCBEYXRhVVJJcyAtIHNlZSBTTyBhbnN3ZXIgIzY4NTAyNzYgZm9yIGNvZGUgdGhhdCBkb2VzIHRoaXNcblx0XHRjb25zdCBieXRlU3RyaW5nID0gd2luZG93LmF0b2IoZGF0YVVyaS5zcGxpdCgnLCcpWzFdKTtcblxuXHRcdC8vIHdyaXRlIHRoZSBieXRlcyBvZiB0aGUgc3RyaW5nIHRvIGFuIEFycmF5QnVmZmVyXG5cdFx0Y29uc3QgaWEgPSBuZXcgVWludDhBcnJheShieXRlU3RyaW5nLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBieXRlU3RyaW5nLmxlbmd0aDsgaSsrKVxuXHRcdFx0aWFbaV0gPSBieXRlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cblx0XHR0aGlzLmJ1ZmZlciA9IGlhO1xuXHRcdHJldHVybiB0aGlzLmZpbGVMb2FkZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgZmlsZXNpemUgb2YgbG9hZGVkIGZpbGUgaW4gbnVtYmVyIG9mIGJ5dGVzLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9IC0gVGhlIGZpbGVzaXplLlxuXHQgKi9cblx0Z2V0RmlsZXNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYnVmZmVyID8gdGhpcy5idWZmZXIubGVuZ3RoIDogMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIGRlZmF1bHQgdGVtcG8sIHBhcnNlcyBmaWxlIGZvciBuZWNlc3NhcnkgaW5mb3JtYXRpb24sIGFuZCBkb2VzIGEgZHJ5IHJ1biB0byBjYWxjdWxhdGUgdG90YWwgbGVuZ3RoLlxuXHQgKiBQb3B1bGF0ZXMgdGhpcy5ldmVudHMgJiB0aGlzLnRvdGFsVGlja3MuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGZpbGVMb2FkZWQoKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRlKCkpIHRocm93ICdJbnZhbGlkIE1JREkgZmlsZTsgc2hvdWxkIHN0YXJ0IHdpdGggTVRoZCc7XG5cdFx0cmV0dXJuIHRoaXMuc2V0VGVtcG8odGhpcy5kZWZhdWx0VGVtcG8pLmdldERpdmlzaW9uKCkuZ2V0Rm9ybWF0KCkuZ2V0VHJhY2tzKCkuZHJ5UnVuKCk7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIGZpbGUgdXNpbmcgc2ltcGxlIG1lYW5zIC0gZmlyc3QgZm91ciBieXRlcyBzaG91bGQgPT0gTVRoZC5cblx0ICogQHJldHVybiB7Ym9vbGVhbn1cblx0ICovXG5cdHZhbGlkYXRlKCkge1xuXHRcdHJldHVybiBVdGlscy5ieXRlc1RvTGV0dGVycyh0aGlzLmJ1ZmZlci5zdWJhcnJheSgwLCA0KSkgPT09ICdNVGhkJztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIE1JREkgZmlsZSBmb3JtYXQgZm9yIGxvYWRlZCBmaWxlLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRnZXRGb3JtYXQoKSB7XG5cdFx0Lypcblx0XHRNSURJIGZpbGVzIGNvbWUgaW4gMyB2YXJpYXRpb25zOlxuXHRcdEZvcm1hdCAwIHdoaWNoIGNvbnRhaW4gYSBzaW5nbGUgdHJhY2tcblx0XHRGb3JtYXQgMSB3aGljaCBjb250YWluIG9uZSBvciBtb3JlIHNpbXVsdGFuZW91cyB0cmFja3Ncblx0XHQoaWUgYWxsIHRyYWNrcyBhcmUgdG8gYmUgcGxheWVkIHNpbXVsdGFuZW91c2x5KS5cblx0XHRGb3JtYXQgMiB3aGljaCBjb250YWluIG9uZSBvciBtb3JlIGluZGVwZW5kYW50IHRyYWNrc1xuXHRcdChpZSBlYWNoIHRyYWNrIGlzIHRvIGJlIHBsYXllZCBpbmRlcGVuZGFudGx5IG9mIHRoZSBvdGhlcnMpLlxuXHRcdHJldHVybiBVdGlscy5ieXRlc1RvTnVtYmVyKHRoaXMuYnVmZmVyLnN1YmFycmF5KDgsIDEwKSk7XG5cdFx0Ki9cblxuXHRcdHRoaXMuZm9ybWF0ID0gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmJ1ZmZlci5zdWJhcnJheSg4LCAxMCkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBvdXQgdHJhY2tzLCBwbGFjZXMgdGhlbSBpbiB0aGlzLnRyYWNrcyBhbmQgaW5pdGlhbGl6ZXMgdGhpcy5wb2ludGVyc1xuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRnZXRUcmFja3MoKSB7XG5cdFx0dGhpcy50cmFja3MgPSBbXTtcblx0XHRsZXQgdHJhY2tPZmZzZXQgPSAwO1xuXHRcdHdoaWxlICh0cmFja09mZnNldCA8IHRoaXMuYnVmZmVyLmxlbmd0aCkge1xuXHRcdFx0aWYgKFV0aWxzLmJ5dGVzVG9MZXR0ZXJzKHRoaXMuYnVmZmVyLnN1YmFycmF5KHRyYWNrT2Zmc2V0LCB0cmFja09mZnNldCArIDQpKSA9PSAnTVRyaycpIHtcblx0XHRcdFx0bGV0IHRyYWNrTGVuZ3RoID0gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmJ1ZmZlci5zdWJhcnJheSh0cmFja09mZnNldCArIDQsIHRyYWNrT2Zmc2V0ICsgOCkpO1xuXHRcdFx0XHR0aGlzLnRyYWNrcy5wdXNoKG5ldyBUcmFjayh0aGlzLnRyYWNrcy5sZW5ndGgsIHRoaXMuYnVmZmVyLnN1YmFycmF5KHRyYWNrT2Zmc2V0ICsgOCwgdHJhY2tPZmZzZXQgKyA4ICsgdHJhY2tMZW5ndGgpKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRyYWNrT2Zmc2V0ICs9IFV0aWxzLmJ5dGVzVG9OdW1iZXIodGhpcy5idWZmZXIuc3ViYXJyYXkodHJhY2tPZmZzZXQgKyA0LCB0cmFja09mZnNldCArIDgpKSArIDg7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuYWJsZXMgYSB0cmFjayBmb3IgcGxheWluZy5cblx0ICogQHBhcmFtIHtudW1iZXJ9IHRyYWNrTnVtYmVyIC0gVHJhY2sgbnVtYmVyXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGVuYWJsZVRyYWNrKHRyYWNrTnVtYmVyKSB7XG5cdFx0dGhpcy50cmFja3NbdHJhY2tOdW1iZXIgLSAxXS5lbmFibGUoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNhYmxlcyBhIHRyYWNrIGZvciBwbGF5aW5nLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gLSBUcmFjayBudW1iZXJcblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0ZGlzYWJsZVRyYWNrKHRyYWNrTnVtYmVyKSB7XG5cdFx0dGhpcy50cmFja3NbdHJhY2tOdW1iZXIgLSAxXS5kaXNhYmxlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBxdWFydGVyIG5vdGUgZGl2aXNpb24gb2YgbG9hZGVkIE1JREkgZmlsZS5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0Z2V0RGl2aXNpb24oKSB7XG5cdFx0dGhpcy5kaXZpc2lvbiA9IFV0aWxzLmJ5dGVzVG9OdW1iZXIodGhpcy5idWZmZXIuc3ViYXJyYXkoMTIsIDE0KSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gcGxheSBsb29wLlxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IC0gSW5kaWNhdGVzIHdoZXRoZXIgb3Igbm90IHRoaXMgaXMgYmVpbmcgY2FsbGVkIHNpbXBseSBmb3IgcGFyc2luZyBwdXJwb3Nlcy4gIERpc3JlZ2FyZHMgdGltaW5nIGlmIHNvLlxuXHQgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG5cdCAqL1xuXHRwbGF5TG9vcChkcnlSdW4pIHtcblx0XHRpZiAoIXRoaXMuaW5Mb29wKSB7XG5cdFx0XHR0aGlzLmluTG9vcCA9IHRydWU7XG5cdFx0XHR0aGlzLnRpY2sgPSB0aGlzLmdldEN1cnJlbnRUaWNrKCk7XG5cblx0XHRcdHRoaXMudHJhY2tzLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBuZXh0IGV2ZW50XG5cdFx0XHRcdGlmICghZHJ5UnVuICYmIHRoaXMuZW5kT2ZGaWxlKCkpIHtcblx0XHRcdFx0XHQvL2NvbnNvbGUubG9nKCdlbmQgb2YgZmlsZScpXG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyUGxheWVyRXZlbnQoJ2VuZE9mRmlsZScpO1xuXHRcdFx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxldCBldmVudCA9IHRyYWNrLmhhbmRsZUV2ZW50KHRoaXMudGljaywgZHJ5UnVuKTtcblxuXHRcdFx0XHRcdGlmIChkcnlSdW4gJiYgZXZlbnQpIHtcblx0XHRcdFx0XHRcdGlmIChldmVudC5oYXNPd25Qcm9wZXJ0eSgnbmFtZScpICYmIGV2ZW50Lm5hbWUgPT09ICdTZXQgVGVtcG8nKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEdyYWIgdGVtcG8gaWYgYXZhaWxhYmxlLlxuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFRlbXBvKGV2ZW50LmRhdGEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGV2ZW50Lmhhc093blByb3BlcnR5KCduYW1lJykgJiYgZXZlbnQubmFtZSA9PT0gJ1Byb2dyYW0gQ2hhbmdlJykge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMuaW5zdHJ1bWVudHMuaW5jbHVkZXMoZXZlbnQudmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5pbnN0cnVtZW50cy5wdXNoKGV2ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQpIHRoaXMuZW1pdEV2ZW50KGV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0aWYgKCFkcnlSdW4pIHRoaXMudHJpZ2dlclBsYXllckV2ZW50KCdwbGF5aW5nJywgeyB0aWNrOiB0aGlzLnRpY2sgfSk7XG5cdFx0XHR0aGlzLmluTG9vcCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZXR0ZXIgZm9yIHRlbXBvLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gLSBUZW1wbyBpbiBicG0gKGRlZmF1bHRzIHRvIDEyMClcblx0ICovXG5cdHNldFRlbXBvKHRlbXBvKSB7XG5cdFx0dGhpcy50ZW1wbyA9IHRlbXBvO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHRlciBmb3Igc3RhcnRUaW1lLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gLSBVVEMgdGltZXN0YW1wXG5cdCAqL1xuXHRzZXRTdGFydFRpbWUoc3RhcnRUaW1lKSB7XG5cdFx0dGhpcy5zdGFydFRpbWUgPSBzdGFydFRpbWU7XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnQgcGxheWluZyBsb2FkZWQgTUlESSBmaWxlIGlmIG5vdCBhbHJlYWR5IHBsYXlpbmcuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHBsYXkoKSB7XG5cdFx0aWYgKHRoaXMuaXNQbGF5aW5nKCkpXG5cdFx0XHR0aHJvdyAnQWxyZWFkeSBwbGF5aW5nLi4uJztcblxuXHRcdC8vIEluaXRpYWxpemVcblx0XHRpZiAoIXRoaXMuc3RhcnRUaW1lKVxuXHRcdFx0dGhpcy5zdGFydFRpbWUgPSAobmV3IERhdGUoKSkuZ2V0VGltZSgpO1xuXG5cdFx0Ly8gU3RhcnQgcGxheSBsb29wXG5cdFx0Ly93aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMucGxheUxvb3AuYmluZCh0aGlzKSk7XG5cdFx0dGhpcy5zZXRJbnRlcnZhbElkID0gd2luZG93LnNldEludGVydmFsKHRoaXMucGxheUxvb3AuYmluZCh0aGlzKSwgdGhpcy5zYW1wbGVSYXRlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhdXNlcyBwbGF5YmFjayBpZiBwbGF5aW5nLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRwYXVzZSgpIHtcblx0XHRjbGVhckludGVydmFsKHRoaXMuc2V0SW50ZXJ2YWxJZCk7XG5cdFx0dGhpcy5zZXRJbnRlcnZhbElkID0gZmFsc2U7XG5cdFx0dGhpcy5zdGFydFRpY2sgPSB0aGlzLnRpY2s7XG5cdFx0dGhpcy5zdGFydFRpbWUgPSAwO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3BzIHBsYXliYWNrIGlmIHBsYXlpbmcuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHN0b3AoKSB7XG5cdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLnNldEludGVydmFsSWQpO1xuXHRcdHRoaXMuc2V0SW50ZXJ2YWxJZCA9IGZhbHNlO1xuXHRcdHRoaXMuc3RhcnRUaWNrID0gMDtcblx0XHR0aGlzLnN0YXJ0VGltZSA9IDA7XG5cdFx0dGhpcy5yZXNldFRyYWNrcygpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNraXBzIHBsYXllciBwb2ludGVyIHRvIHNwZWNpZmllZCB0aWNrLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gLSBUaWNrIHRvIHNraXAgdG8uXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHNraXBUb1RpY2sodGljaykge1xuXHRcdHRoaXMuc3RvcCgpO1xuXHRcdHRoaXMuc3RhcnRUaWNrID0gdGljaztcblxuXHRcdC8vIE5lZWQgdG8gc2V0IHRyYWNrIGV2ZW50IGluZGV4ZXMgdG8gdGhlIG5lYXJlc3QgcG9zc2libGUgZXZlbnQgdG8gdGhlIHNwZWNpZmllZCB0aWNrLlxuXHRcdHRoaXMudHJhY2tzLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrKSB7XG5cdFx0XHR0cmFjay5zZXRFdmVudEluZGV4QnlUaWNrKHRpY2spO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNraXBzIHBsYXllciBwb2ludGVyIHRvIHNwZWNpZmllZCBwZXJjZW50YWdlLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gLSBQZXJjZW50IHZhbHVlIGluIGludGVnZXIgZm9ybWF0LlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRza2lwVG9QZXJjZW50KHBlcmNlbnQpIHtcblx0XHRpZiAocGVyY2VudCA8IDAgfHwgcGVyY2VudCA+IDEwMCkgdGhyb3cgJ1BlcmNlbnQgbXVzdCBiZSBudW1iZXIgYmV0d2VlbiAxIGFuZCAxMDAuJztcblx0XHR0aGlzLnNraXBUb1RpY2soTWF0aC5yb3VuZChwZXJjZW50IC8gMTAwICogdGhpcy50b3RhbFRpY2tzKSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2tpcHMgcGxheWVyIHBvaW50ZXIgdG8gc3BlY2lmaWVkIHNlY29uZHMuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFNlY29uZHMgdG8gc2tpcCB0by5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0c2tpcFRvU2Vjb25kcyhzZWNvbmRzKSB7XG5cdFx0Y29uc3Qgc29uZ1RpbWUgPSB0aGlzLmdldFNvbmdUaW1lKCk7XG5cdFx0aWYgKHNlY29uZHMgPCAwIHx8IHNlY29uZHMgPiBzb25nVGltZSlcblx0XHRcdHRocm93IGAke3NlY29uZHN9IHNlY29uZHMgbm90IHdpdGhpbiBzb25nIHRpbWUgb2YgJHtzb25nVGltZX1gO1xuXHRcdHRoaXMuc2tpcFRvUGVyY2VudChzZWNvbmRzIC8gc29uZ1RpbWUgKiAxMDApO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBwbGF5ZXIgaXMgcGxheWluZ1xuXHQgKiBAcmV0dXJuIHtib29sZWFufVxuXHQgKi9cblx0aXNQbGF5aW5nKCkge1xuXHRcdHJldHVybiB0aGlzLnNldEludGVydmFsSWQgPiAwIHx8IHR5cGVvZiB0aGlzLnNldEludGVydmFsSWQgPT09ICdvYmplY3QnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBsYXlzIHRoZSBsb2FkZWQgTUlESSBmaWxlIHdpdGhvdXQgcmVnYXJkIGZvciB0aW1pbmcgYW5kIHNhdmVzIGV2ZW50cyBpbiB0aGlzLmV2ZW50cy4gIEVzc2VudGlhbGx5IHVzZWQgYXMgYSBwYXJzZXIuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGRyeVJ1bigpIHtcblx0XHQvLyBSZXNldCB0cmFja3MgZmlyc3Rcblx0XHR0aGlzLnJlc2V0VHJhY2tzKCk7XG5cdFx0d2hpbGUgKCF0aGlzLmVuZE9mRmlsZSgpKVxuXHRcdFx0dGhpcy5wbGF5TG9vcCh0cnVlKTtcblx0XHR0aGlzLmV2ZW50cyA9IHRoaXMuZ2V0RXZlbnRzKCk7XG5cdFx0dGhpcy50b3RhbEV2ZW50cyA9IHRoaXMuZ2V0VG90YWxFdmVudHMoKTtcblx0XHR0aGlzLnRvdGFsVGlja3MgPSB0aGlzLmdldFRvdGFsVGlja3MoKTtcblx0XHR0aGlzLnN0YXJ0VGljayA9IDA7XG5cdFx0dGhpcy5zdGFydFRpbWUgPSAwO1xuXG5cdFx0Ly8gTGVhdmUgdHJhY2tzIGluIHByaXN0aW5lIGNvbmRpc2hcblx0XHR0aGlzLnJlc2V0VHJhY2tzKCk7XG5cblx0XHQvL2NvbnNvbGUubG9nKCdTb25nIHRpbWU6ICcgKyB0aGlzLmdldFNvbmdUaW1lKCkgKyAnIHNlY29uZHMgLyAnICsgdGhpcy50b3RhbFRpY2tzICsgJyB0aWNrcy4nKTtcblxuXHRcdHRoaXMudHJpZ2dlclBsYXllckV2ZW50KCdmaWxlTG9hZGVkJywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXRzIHBsYXkgcG9pbnRlcnMgZm9yIGFsbCB0cmFja3MuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHJlc2V0VHJhY2tzKCkge1xuXHRcdHRoaXMudHJhY2tzLmZvckVhY2godHJhY2sgPT4gdHJhY2sucmVzZXQoKSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbiBhcnJheSBvZiBldmVudHMgZ3JvdXBlZCBieSB0cmFjay5cblx0ICogQHJldHVybiB7YXJyYXl9XG5cdCAqL1xuXHRnZXRFdmVudHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJhY2tzLm1hcCh0cmFjayA9PiB0cmFjay5ldmVudHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdG90YWwgbnVtYmVyIG9mIHRpY2tzIGluIHRoZSBsb2FkZWQgTUlESSBmaWxlLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRUb3RhbFRpY2tzKCkge1xuXHRcdHJldHVybiBNYXRoLm1heC5hcHBseShudWxsLCB0aGlzLnRyYWNrcy5tYXAodHJhY2sgPT4gdHJhY2suZGVsdGEpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRvdGFsIG51bWJlciBvZiBldmVudHMgaW4gdGhlIGxvYWRlZCBNSURJIGZpbGUuXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldFRvdGFsRXZlbnRzKCkge1xuXHRcdHJldHVybiB0aGlzLnRyYWNrcy5yZWR1Y2UoXG5cdFx0XHQoYSwgYikgPT4geyByZXR1cm4geyBldmVudHM6IHsgbGVuZ3RoOiBhLmV2ZW50cy5sZW5ndGggKyBiLmV2ZW50cy5sZW5ndGggfSB9IH0sXG5cdFx0XHR7IGV2ZW50czogeyBsZW5ndGg6IDAgfSB9XG5cdFx0KS5ldmVudHMubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgc29uZyBkdXJhdGlvbiBpbiBzZWNvbmRzLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRTb25nVGltZSgpIHtcblx0XHRyZXR1cm4gdGhpcy50b3RhbFRpY2tzIC8gdGhpcy5kaXZpc2lvbiAvIHRoaXMudGVtcG8gKiA2MDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHJlbWFpbmluZyBudW1iZXIgb2Ygc2Vjb25kcyBpbiBwbGF5YmFjay5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0Z2V0U29uZ1RpbWVSZW1haW5pbmcoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQoKHRoaXMudG90YWxUaWNrcyAtIHRoaXMudGljaykgLyB0aGlzLmRpdmlzaW9uIC8gdGhpcy50ZW1wbyAqIDYwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHJlbWFpbmluZyBwZXJjZW50IG9mIHBsYXliYWNrLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRTb25nUGVyY2VudFJlbWFpbmluZygpIHtcblx0XHRyZXR1cm4gTWF0aC5yb3VuZCh0aGlzLmdldFNvbmdUaW1lUmVtYWluaW5nKCkgLyB0aGlzLmdldFNvbmdUaW1lKCkgKiAxMDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiBieXRlcyBwcm9jZXNzZWQgaW4gdGhlIGxvYWRlZCBNSURJIGZpbGUuXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGJ5dGVzUHJvY2Vzc2VkKCkge1xuXHRcdC8vIEN1cnJlbnRseSBhc3N1bWUgaGVhZGVyIGNodW5rIGlzIHN0cmljdGx5IDE0IGJ5dGVzXG5cdFx0cmV0dXJuIDE0ICsgdGhpcy50cmFja3MubGVuZ3RoICogOCArIHRoaXMudHJhY2tzLnJlZHVjZSgoYSwgYikgPT4geyByZXR1cm4geyBwb2ludGVyOiBhLnBvaW50ZXIgKyBiLnBvaW50ZXIgfSB9LCB7IHBvaW50ZXI6IDAgfSkucG9pbnRlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgZXZlbnRzIHBsYXllZCB1cCB0byB0aGlzIHBvaW50LlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRldmVudHNQbGF5ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJhY2tzLnJlZHVjZSgoYSwgYikgPT4geyByZXR1cm4geyBldmVudEluZGV4OiBhLmV2ZW50SW5kZXggKyBiLmV2ZW50SW5kZXggfSB9LCB7IGV2ZW50SW5kZXg6IDAgfSkuZXZlbnRJbmRleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgcG9pbnRlciBoYXMgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBsb2FkZWQgTUlESSBmaWxlLlxuXHQgKiBVc2VkIGluIHR3byB3YXlzOlxuXHQgKiAxLiBJZiBwbGF5aW5nIHJlc3VsdCBpcyBiYXNlZCBvbiBsb2FkZWQgSlNPTiBldmVudHMuXG5cdCAqIDIuIElmIHBhcnNpbmcgKGRyeVJ1bikgaXQncyBiYXNlZCBvbiB0aGUgYWN0dWFsIGJ1ZmZlciBsZW5ndGggdnMgYnl0ZXMgcHJvY2Vzc2VkLlxuXHQgKiBAcmV0dXJuIHtib29sZWFufVxuXHQgKi9cblx0ZW5kT2ZGaWxlKCkge1xuXHRcdGlmICh0aGlzLmlzUGxheWluZygpKVxuXHRcdFx0cmV0dXJuIHRoaXMuZXZlbnRzUGxheWVkKCkgPT0gdGhpcy50b3RhbEV2ZW50cztcblxuXHRcdHJldHVybiB0aGlzLmJ5dGVzUHJvY2Vzc2VkKCkgPT0gdGhpcy5idWZmZXIubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGN1cnJlbnQgdGljayBudW1iZXIgaW4gcGxheWJhY2suXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldEN1cnJlbnRUaWNrKCkge1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKCgobmV3IERhdGUoKSkuZ2V0VGltZSgpIC0gdGhpcy5zdGFydFRpbWUpIC8gMTAwMCAqICh0aGlzLmRpdmlzaW9uICogKHRoaXMudGVtcG8gLyA2MCkpKSArIHRoaXMuc3RhcnRUaWNrO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmRzIE1JREkgZXZlbnQgb3V0IHRvIGxpc3RlbmVyLlxuXHQgKiBAcGFyYW0ge29iamVjdH1cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0ZW1pdEV2ZW50KGV2ZW50KSB7XG5cdFx0dGhpcy50cmlnZ2VyUGxheWVyRXZlbnQoJ21pZGlFdmVudCcsIGV2ZW50KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJzY3JpYmVzIGV2ZW50cyB0byBsaXN0ZW5lcnNcblx0ICogQHBhcmFtIHtzdHJpbmd9IC0gTmFtZSBvZiBldmVudCB0byBzdWJzY3JpYmUgdG8uXG5cdCAqIEBwYXJhbSB7ZnVuY3Rpb259IC0gQ2FsbGJhY2sgdG8gZmlyZSB3aGVuIGV2ZW50IGlzIGJyb2FkY2FzdC5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0b24ocGxheWVyRXZlbnQsIGZuKSB7XG5cdFx0aWYgKCF0aGlzLmV2ZW50TGlzdGVuZXJzLmhhc093blByb3BlcnR5KHBsYXllckV2ZW50KSlcblx0XHRcdHRoaXMuZXZlbnRMaXN0ZW5lcnNbcGxheWVyRXZlbnRdID0gW107XG5cdFx0dGhpcy5ldmVudExpc3RlbmVyc1twbGF5ZXJFdmVudF0ucHVzaChmbik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogQnJvYWRjYXN0cyBldmVudCB0byB0cmlnZ2VyIHN1YnNjcmliZWQgY2FsbGJhY2tzLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gLSBOYW1lIG9mIGV2ZW50LlxuXHQgKiBAcGFyYW0ge29iamVjdH0gLSBEYXRhIHRvIGJlIHBhc3NlZCB0byBzdWJzY3JpYmVyIGNhbGxiYWNrLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHR0cmlnZ2VyUGxheWVyRXZlbnQocGxheWVyRXZlbnQsIGRhdGEpIHtcblx0XHRpZiAodGhpcy5ldmVudExpc3RlbmVycy5oYXNPd25Qcm9wZXJ0eShwbGF5ZXJFdmVudCkpXG5cdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzW3BsYXllckV2ZW50XS5mb3JFYWNoKGZuID0+IGZuKGRhdGEgfHwge30pKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBQbGF5ZXIgfVxuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgLyoqXG4gICAqIEFkZHMgYSBsaXN0ZW5lciBvZiBhbiBldmVudFxuICAgKiBAY2hhaW5hYmxlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAtIHRoZSBldmVudCBuYW1lXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIC0gdGhlIGV2ZW50IGhhbmRsZXJcbiAgICogQHJldHVybiB7U2FtcGxlUGxheWVyfSB0aGUgcGxheWVyXG4gICAqIEBleGFtcGxlXG4gICAqIHBsYXllci5vbignc3RhcnQnLCBmdW5jdGlvbih0aW1lLCBub3RlKSB7XG4gICAqICAgY29uc29sZS5sb2codGltZSwgbm90ZSlcbiAgICogfSlcbiAgICovXG4gIHBsYXllci5vbiA9IGZ1bmN0aW9uIChldmVudCwgY2IpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgZXZlbnQgPT09ICdmdW5jdGlvbicpIHJldHVybiBwbGF5ZXIub24oJ2V2ZW50JywgZXZlbnQpXG4gICAgdmFyIHByb3AgPSAnb24nICsgZXZlbnRcbiAgICB2YXIgb2xkID0gcGxheWVyW3Byb3BdXG4gICAgcGxheWVyW3Byb3BdID0gb2xkID8gY2hhaW4ob2xkLCBjYikgOiBjYlxuICAgIHJldHVybiBwbGF5ZXJcbiAgfVxuICByZXR1cm4gcGxheWVyXG59XG5cbmZ1bmN0aW9uIGNoYWluIChmbjEsIGZuMikge1xuICByZXR1cm4gZnVuY3Rpb24gKGEsIGIsIGMsIGQpIHsgZm4xKGEsIGIsIGMsIGQpOyBmbjIoYSwgYiwgYywgZCkgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuL3BsYXllcicpXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKVxudmFyIG5vdGVzID0gcmVxdWlyZSgnLi9ub3RlcycpXG52YXIgc2NoZWR1bGVyID0gcmVxdWlyZSgnLi9zY2hlZHVsZXInKVxuLy92YXIgbWlkaSA9IHJlcXVpcmUoJy4vbWlkaScpXG5cbmZ1bmN0aW9uIFNhbXBsZVBsYXllcihhYywgc291cmNlLCBvcHRpb25zKSB7XG4gIC8vcmV0dXJuIG1pZGkoc2NoZWR1bGVyKG5vdGVzKGV2ZW50cyhwbGF5ZXIoYWMsIHNvdXJjZSwgb3B0aW9ucykpKSkpXG4gIHJldHVybiBzY2hlZHVsZXIobm90ZXMoZXZlbnRzKHBsYXllcihhYywgc291cmNlLCBvcHRpb25zKSkpKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgU2FtcGxlUGxheWVyIH1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgbm90ZSA9IHJlcXVpcmUoJy4uL25vdGUtcGFyc2VyL2luZGV4JylcbnZhciBpc01pZGkgPSBmdW5jdGlvbiAobikgeyByZXR1cm4gbiAhPT0gbnVsbCAmJiBuICE9PSBbXSAmJiBuID49IDAgJiYgbiA8IDEyOSB9XG52YXIgdG9NaWRpID0gZnVuY3Rpb24gKG4pIHsgcmV0dXJuIGlzTWlkaShuKSA/ICtuIDogbm90ZS5taWRpKG4pIH1cblxuLy8gQWRkcyBub3RlIG5hbWUgdG8gbWlkaSBjb252ZXJzaW9uXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgaWYgKHBsYXllci5idWZmZXJzKSB7XG4gICAgdmFyIG1hcCA9IHBsYXllci5vcHRzLm1hcFxuICAgIHZhciB0b0tleSA9IHR5cGVvZiBtYXAgPT09ICdmdW5jdGlvbicgPyBtYXAgOiB0b01pZGlcbiAgICB2YXIgbWFwcGVyID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBuYW1lID8gdG9LZXkobmFtZSkgfHwgbmFtZSA6IG51bGxcbiAgICB9XG5cbiAgICBwbGF5ZXIuYnVmZmVycyA9IG1hcEJ1ZmZlcnMocGxheWVyLmJ1ZmZlcnMsIG1hcHBlcilcbiAgICB2YXIgc3RhcnQgPSBwbGF5ZXIuc3RhcnRcbiAgICBwbGF5ZXIuc3RhcnQgPSBmdW5jdGlvbiAobmFtZSwgd2hlbiwgb3B0aW9ucykge1xuICAgICAgdmFyIGtleSA9IG1hcHBlcihuYW1lKVxuICAgICAgdmFyIGRlYyA9IGtleSAlIDFcbiAgICAgIGlmIChkZWMpIHtcbiAgICAgICAga2V5ID0gTWF0aC5mbG9vcihrZXkpXG4gICAgICAgIG9wdGlvbnMgPSBPYmplY3QuYXNzaWduKG9wdGlvbnMgfHwge30sIHsgY2VudHM6IE1hdGguZmxvb3IoZGVjICogMTAwKSB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXJ0KGtleSwgd2hlbiwgb3B0aW9ucylcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHBsYXllclxufVxuXG5mdW5jdGlvbiBtYXBCdWZmZXJzKGJ1ZmZlcnMsIHRvS2V5KSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhidWZmZXJzKS5yZWR1Y2UoZnVuY3Rpb24gKG1hcHBlZCwgbmFtZSkge1xuICAgIG1hcHBlZFt0b0tleShuYW1lKV0gPSBidWZmZXJzW25hbWVdXG4gICAgcmV0dXJuIG1hcHBlZFxuICB9LCB7fSlcbn1cbiIsIi8qIGdsb2JhbCBBdWRpb0J1ZmZlciAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IEFEU1IgPSByZXF1aXJlKCcuLi9hZHNyL2luZGV4JylcblxuY29uc3QgRU1QVFkgPSB7fVxuY29uc3QgREVGQVVMVFMgPSB7XG4gIGdhaW46IDEsXG4gIGF0dGFjazogMC4wMSxcbiAgZGVjYXk6IDAuMSxcbiAgc3VzdGFpbjogMC45LFxuICByZWxlYXNlOiAwLjMsXG4gIGxvb3A6IGZhbHNlLFxuICBjZW50czogMCxcbiAgbG9vcFN0YXJ0OiAwLFxuICBsb29wRW5kOiAwXG59XG5cbi8qKlxuICogQ3JlYXRlIGEgc2FtcGxlIHBsYXllci5cbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYWMgLSB0aGUgYXVkaW8gY29udGV4dFxuICogQHBhcmFtIHtBcnJheUJ1ZmZlcnxPYmplY3Q8U3RyaW5nLEFycmF5QnVmZmVyPn0gc291cmNlXG4gKiBAcGFyYW0ge09uamVjdH0gb3B0aW9ucyAtIChPcHRpb25hbCkgYW4gb3B0aW9ucyBvYmplY3RcbiAqIEByZXR1cm4ge3BsYXllcn0gdGhlIHBsYXllclxuICogQGV4YW1wbGVcbiAqIGNvbnN0IFNhbXBsZVBsYXllciA9IHJlcXVpcmUoJ3NhbXBsZS1wbGF5ZXInKVxuICogY29uc3QgYWMgPSBuZXcgQXVkaW9Db250ZXh0KClcbiAqIGNvbnN0IHNuYXJlID0gU2FtcGxlUGxheWVyKGFjLCA8QXVkaW9CdWZmZXI+KVxuICogc25hcmUucGxheSgpXG4gKi9cbmZ1bmN0aW9uIFNhbXBsZVBsYXllcihhYywgc291cmNlLCBvcHRpb25zKSB7XG4gIGxldCBjb25uZWN0ZWQgPSBmYWxzZVxuICBsZXQgbmV4dElkID0gMFxuICBsZXQgdHJhY2tlZCA9IHt9XG4gIGNvbnN0IG91dCA9IGFjLmNyZWF0ZUdhaW4oKVxuICBvdXQuZ2Fpbi52YWx1ZSA9IDFcblxuICBjb25zdCBvcHRzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVFMsIG9wdGlvbnMpXG5cbiAgLyoqXG4gICAqIEBuYW1lc3BhY2VcbiAgICovXG4gIGNvbnN0IHBsYXllciA9IHsgY29udGV4dDogYWMsIG91dCwgb3B0cyB9XG4gIGlmIChzb3VyY2UgaW5zdGFuY2VvZiBBdWRpb0J1ZmZlcilcbiAgICBwbGF5ZXIuYnVmZmVyID0gc291cmNlXG4gIGVsc2VcbiAgICBwbGF5ZXIuYnVmZmVycyA9IHNvdXJjZVxuXG4gIC8qKlxuICAgKiBTdGFydCBhIHNhbXBsZSBidWZmZXIuXG4gICAqXG4gICAqIFRoZSByZXR1cm5lZCBvYmplY3QgaGFzIGEgZnVuY3Rpb24gYHN0b3Aod2hlbilgIHRvIHN0b3AgdGhlIHNvdW5kLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtIHRoZSBuYW1lIG9mIHRoZSBidWZmZXIuIElmIHRoZSBzb3VyY2Ugb2YgdGhlXG4gICAqIFNhbXBsZVBsYXllciBpcyBvbmUgc2FtcGxlIGJ1ZmZlciwgdGhpcyBwYXJhbWV0ZXIgaXMgbm90IHJlcXVpcmVkXG4gICAqIEBwYXJhbSB7RmxvYXR9IHdoZW4gLSAoT3B0aW9uYWwpIHdoZW4gdG8gc3RhcnQgKGN1cnJlbnQgdGltZSBpZiBieSBkZWZhdWx0KVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIGFkZGl0aW9uYWwgc2FtcGxlIHBsYXlpbmcgb3B0aW9uc1xuICAgKiBAcmV0dXJuIHtBdWRpb05vZGV9IGFuIGF1ZGlvIG5vZGUgd2l0aCBhIGBzdG9wYCBmdW5jdGlvblxuICAgKiBAZXhhbXBsZVxuICAgKiB2YXIgc2FtcGxlID0gcGxheWVyKGFjLCA8QXVkaW9CdWZmZXI+KS5jb25uZWN0KGFjLmRlc3RpbmF0aW9uKVxuICAgKiBzYW1wbGUuc3RhcnQoKVxuICAgKiBzYW1wbGUuc3RhcnQoNSwgeyBnYWluOiAwLjcgfSkgLy8gbmFtZSBub3QgcmVxdWlyZWQgc2luY2UgaXMgb25seSBvbmUgQXVkaW9CdWZmZXJcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIGRydW1zID0gcGxheWVyKGFjLCB7IHNuYXJlOiA8QXVkaW9CdWZmZXI+LCBraWNrOiA8QXVkaW9CdWZmZXI+LCAuLi4gfSkuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICogZHJ1bXMuc3RhcnQoJ3NuYXJlJylcbiAgICogZHJ1bXMuc3RhcnQoJ3NuYXJlJywgMCwgeyBnYWluOiAwLjMgfSlcbiAgICovXG4gIHBsYXllci5zdGFydCA9IGZ1bmN0aW9uIChuYW1lLCB3aGVuLCBvcHRpb25zKSB7XG4gICAgLy8gaWYgb25seSBvbmUgYnVmZmVyLCByZW9yZGVyIGFyZ3VtZW50c1xuICAgIGlmIChwbGF5ZXIuYnVmZmVyICYmIG5hbWUgIT09IG51bGwpXG4gICAgICByZXR1cm4gcGxheWVyLnN0YXJ0KG51bGwsIG5hbWUsIHdoZW4pXG5cbiAgICB2YXIgYnVmZmVyID0gbmFtZSA/IHBsYXllci5idWZmZXJzW25hbWVdIDogcGxheWVyLmJ1ZmZlclxuICAgIGlmICghYnVmZmVyKSB7XG4gICAgICBjb25zb2xlLndhcm4oYEJ1ZmZlciAke25hbWV9IG5vdCBmb3VuZC5gKVxuICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIGlmICghY29ubmVjdGVkKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1NhbXBsZVBsYXllciBub3QgY29ubmVjdGVkIHRvIGFueSBub2RlLicpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBvcHRzID0gb3B0aW9ucyB8fCBFTVBUWVxuICAgIHdoZW4gPSBNYXRoLm1heChhYy5jdXJyZW50VGltZSwgd2hlbiB8fCAwKVxuICAgIHBsYXllci5lbWl0KCdzdGFydCcsIHdoZW4sIG5hbWUsIG9wdHMpXG4gICAgdmFyIG5vZGUgPSBjcmVhdGVOb2RlKG5hbWUsIGJ1ZmZlciwgb3B0cylcbiAgICBub2RlLmlkID0gdHJhY2sobmFtZSwgbm9kZSlcbiAgICBub2RlLmVudi5zdGFydCh3aGVuKVxuICAgIG5vZGUuc291cmNlLnN0YXJ0KHdoZW4pXG4gICAgcGxheWVyLmVtaXQoJ3N0YXJ0ZWQnLCB3aGVuLCBub2RlLmlkLCBub2RlKVxuICAgIGlmIChvcHRzLmR1cmF0aW9uKVxuICAgICAgbm9kZS5zdG9wKHdoZW4gKyBvcHRzLmR1cmF0aW9uKVxuICAgIHJldHVybiBub2RlXG4gIH1cblxuICAvLyBOT1RFOiBzdGFydCB3aWxsIGJlIG92ZXJyaWRlIHNvIHdlIGNhbid0IGNvcHkgdGhlIGZ1bmN0aW9uIHJlZmVyZW5jZVxuICAvLyB0aGlzIGlzIG9idmlvdXNseSBub3QgYSBnb29kIGRlc2lnbiwgc28gdGhpcyBjb2RlIHdpbGwgYmUgZ29uZSBzb29uLlxuICAvKipcbiAgICogQW4gYWxpYXMgZm9yIGBwbGF5ZXIuc3RhcnRgXG4gICAqIEBzZWUgcGxheWVyLnN0YXJ0XG4gICAqIEBzaW5jZSAwLjMuMFxuICAgKi9cbiAgcGxheWVyLnBsYXkgPSBmdW5jdGlvbiAobmFtZSwgd2hlbiwgb3B0aW9ucykge1xuICAgIHJldHVybiBwbGF5ZXIuc3RhcnQobmFtZSwgd2hlbiwgb3B0aW9ucylcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHNvbWUgb3IgYWxsIHNhbXBsZXNcbiAgICpcbiAgICogQHBhcmFtIHtGbG9hdH0gd2hlbiAtIChPcHRpb25hbCkgYW4gYWJzb2x1dGUgdGltZSBpbiBzZWNvbmRzIChvciBjdXJyZW50VGltZVxuICAgKiBpZiBub3Qgc3BlY2lmaWVkKVxuICAgKiBAcGFyYW0ge0FycmF5fSBub2RlcyAtIChPcHRpb25hbCkgYW4gYXJyYXkgb2Ygbm9kZXMgb3Igbm9kZXMgaWRzIHRvIHN0b3BcbiAgICogQHJldHVybiB7QXJyYXl9IGFuIGFycmF5IG9mIGlkcyBvZiB0aGUgc3RvcGVkIHNhbXBsZXNcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIGxvbmdTb3VuZCA9IHBsYXllcihhYywgPEF1ZGlvQnVmZmVyPikuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICogbG9uZ1NvdW5kLnN0YXJ0KGFjLmN1cnJlbnRUaW1lKVxuICAgKiBsb25nU291bmQuc3RhcnQoYWMuY3VycmVudFRpbWUgKyAxKVxuICAgKiBsb25nU291bmQuc3RhcnQoYWMuY3VycmVudFRpbWUgKyAyKVxuICAgKiBsb25nU291bmQuc3RvcChhYy5jdXJyZW50VGltZSArIDMpIC8vIHN0b3AgdGhlIHRocmVlIHNvdW5kc1xuICAgKi9cbiAgcGxheWVyLnN0b3AgPSBmdW5jdGlvbiAod2hlbiwgaWRzKSB7XG4gICAgaWRzID0gaWRzIHx8IE9iamVjdC5rZXlzKHRyYWNrZWQpXG4gICAgcmV0dXJuIGlkcy5tYXAoZnVuY3Rpb24gKGlkKSB7XG4gICAgICBjb25zdCBub2RlID0gdHJhY2tlZFtpZF1cbiAgICAgIGlmICghbm9kZSkgcmV0dXJuIG51bGxcbiAgICAgIG5vZGUuc3RvcCh3aGVuKVxuICAgICAgcmV0dXJuIG5vZGUuaWRcbiAgICB9KVxuICB9XG4gIC8qKlxuICAgKiBDb25uZWN0IHRoZSBwbGF5ZXIgdG8gYSBkZXN0aW5hdGlvbiBub2RlXG4gICAqXG4gICAqIEBwYXJhbSB7QXVkaW9Ob2RlfSBkZXN0aW5hdGlvbiAtIHRoZSBkZXN0aW5hdGlvbiBub2RlXG4gICAqIEByZXR1cm4ge0F1ZGlvUGxheWVyfSB0aGUgcGxheWVyXG4gICAqIEBjaGFpbmFibGVcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIHNhbXBsZSA9IHBsYXllcihhYywgPEF1ZGlvQnVmZmVyPikuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICovXG4gIHBsYXllci5jb25uZWN0ID0gZnVuY3Rpb24gKGRlc3QpIHtcbiAgICBjb25uZWN0ZWQgPSB0cnVlXG4gICAgb3V0LmNvbm5lY3QoZGVzdClcbiAgICByZXR1cm4gcGxheWVyXG4gIH1cblxuICBwbGF5ZXIuZW1pdCA9IGZ1bmN0aW9uIChldmVudCwgd2hlbiwgb2JqLCBvcHRzKSB7XG4gICAgaWYgKHBsYXllci5vbmV2ZW50KSBwbGF5ZXIub25ldmVudChldmVudCwgd2hlbiwgb2JqLCBvcHRzKVxuICAgIGNvbnN0IGZuID0gcGxheWVyWydvbicgKyBldmVudF1cbiAgICBpZiAoZm4pIGZuKHdoZW4sIG9iaiwgb3B0cylcbiAgfVxuXG4gIHJldHVybiBwbGF5ZXJcblxuICAvLyA9PT09PT09PT09PT09PT0gUFJJVkFURSBGVU5DVElPTlMgPT09PT09PT09PT09PT0gLy9cblxuICBmdW5jdGlvbiB0cmFjayhuYW1lLCBub2RlKSB7XG4gICAgbm9kZS5pZCA9IG5leHRJZCsrXG4gICAgdHJhY2tlZFtub2RlLmlkXSA9IG5vZGVcbiAgICBub2RlLnNvdXJjZS5vbmVuZGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgY29uc3Qgbm93ID0gYWMuY3VycmVudFRpbWVcbiAgICAgIG5vZGUuc291cmNlLmRpc2Nvbm5lY3QoKVxuICAgICAgbm9kZS5lbnYuZGlzY29ubmVjdCgpXG4gICAgICBub2RlLmRpc2Nvbm5lY3QoKVxuICAgICAgcGxheWVyLmVtaXQoJ2VuZGVkJywgbm93LCBub2RlLmlkLCBub2RlKVxuICAgIH1cbiAgICByZXR1cm4gbm9kZS5pZFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlTm9kZShuYW1lLCBidWZmZXIsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBub2RlID0gYWMuY3JlYXRlR2FpbigpXG4gICAgbm9kZS5nYWluLnZhbHVlID0gMCAvLyB0aGUgZW52ZWxvcGUgd2lsbCBjb250cm9sIHRoZSBnYWluXG4gICAgbm9kZS5jb25uZWN0KG91dClcblxuICAgIG5vZGUuZW52ID0gZW52ZWxvcGUoYWMsIG9wdGlvbnMsIG9wdHMpXG4gICAgbm9kZS5lbnYuY29ubmVjdChub2RlLmdhaW4pXG5cbiAgICBub2RlLnNvdXJjZSA9IGFjLmNyZWF0ZUJ1ZmZlclNvdXJjZSgpXG4gICAgbm9kZS5zb3VyY2UuYnVmZmVyID0gYnVmZmVyXG4gICAgbm9kZS5zb3VyY2UuY29ubmVjdChub2RlKVxuICAgIG5vZGUuc291cmNlLmxvb3AgPSBvcHRpb25zLmxvb3AgfHwgb3B0cy5sb29wXG4gICAgbm9kZS5zb3VyY2UucGxheWJhY2tSYXRlLnZhbHVlID0gY2VudHNUb1JhdGUob3B0aW9ucy5jZW50cyB8fCBvcHRzLmNlbnRzKVxuICAgIG5vZGUuc291cmNlLmxvb3BTdGFydCA9IG9wdGlvbnMubG9vcFN0YXJ0IHx8IG9wdHMubG9vcFN0YXJ0XG4gICAgbm9kZS5zb3VyY2UubG9vcEVuZCA9IG9wdGlvbnMubG9vcEVuZCB8fCBvcHRzLmxvb3BFbmRcbiAgICBub2RlLnN0b3AgPSBmdW5jdGlvbiAod2hlbikge1xuICAgICAgY29uc3QgdGltZSA9IHdoZW4gfHwgYWMuY3VycmVudFRpbWVcbiAgICAgIHBsYXllci5lbWl0KCdzdG9wJywgdGltZSwgbmFtZSlcbiAgICAgIGNvbnN0IHN0b3BBdCA9IG5vZGUuZW52LnN0b3AodGltZSlcbiAgICAgIG5vZGUuc291cmNlLnN0b3Aoc3RvcEF0KVxuICAgIH1cbiAgICByZXR1cm4gbm9kZVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzTnVtKHgpIHsgcmV0dXJuIHR5cGVvZiB4ID09PSAnbnVtYmVyJyB9XG5cbmNvbnN0IFBBUkFNUyA9IFsnYXR0YWNrJywgJ2RlY2F5JywgJ3N1c3RhaW4nLCAncmVsZWFzZSddXG5cbmZ1bmN0aW9uIGVudmVsb3BlKGFjLCBvcHRpb25zLCBvcHRzKSB7XG4gIGNvbnN0IGVudiA9IEFEU1IoYWMpXG4gIGNvbnN0IGFkc3IgPSBvcHRpb25zLmFkc3IgfHwgb3B0cy5hZHNyXG4gIFBBUkFNUy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgaWYgKGFkc3IpIGVudltuYW1lXSA9IGFkc3JbaV1cbiAgICBlbHNlIGVudltuYW1lXSA9IG9wdGlvbnNbbmFtZV0gfHwgb3B0c1tuYW1lXVxuICB9KVxuICBlbnYudmFsdWUudmFsdWUgPSBpc051bShvcHRpb25zLmdhaW4pID8gb3B0aW9ucy5nYWluXG4gICAgOiBpc051bShvcHRzLmdhaW4pID8gb3B0cy5nYWluIDogMVxuICByZXR1cm4gZW52XG59XG5cbi8qXG4gKiBHZXQgcGxheWJhY2sgcmF0ZSBmb3IgYSBnaXZlbiBwaXRjaCBjaGFuZ2UgKGluIGNlbnRzKVxuICogQmFzaWMgW21hdGhdKGh0dHA6Ly93d3cuYmlyZHNvZnQuZGVtb24uY28udWsvbXVzaWMvc2FtcGxlcnQuaHRtKTpcbiAqIGYyID0gZjEgKiAyXiggQyAvIDEyMDAgKVxuICovXG5mdW5jdGlvbiBjZW50c1RvUmF0ZShjZW50cykgeyByZXR1cm4gY2VudHMgPyBNYXRoLnBvdygyLCBjZW50cyAvIDEyMDApIDogMSB9XG5cbm1vZHVsZS5leHBvcnRzID0gU2FtcGxlUGxheWVyXG4iLCIndXNlIHN0cmljdCdcblxudmFyIGlzQXJyID0gQXJyYXkuaXNBcnJheVxudmFyIGlzT2JqID0gZnVuY3Rpb24gKG8pIHsgcmV0dXJuIG8gJiYgdHlwZW9mIG8gPT09ICdvYmplY3QnIH1cbnZhciBPUFRTID0ge31cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGxheWVyKSB7XG4gIC8qKlxuICAgKiBTY2hlZHVsZSBhIGxpc3Qgb2YgZXZlbnRzIHRvIGJlIHBsYXllZCBhdCBzcGVjaWZpYyB0aW1lLlxuICAgKlxuICAgKiBJdCBzdXBwb3J0cyB0aHJlZSBmb3JtYXRzIG9mIGV2ZW50cyBmb3IgdGhlIGV2ZW50cyBsaXN0OlxuICAgKlxuICAgKiAtIEFuIGFycmF5IHdpdGggW3RpbWUsIG5vdGVdXG4gICAqIC0gQW4gYXJyYXkgd2l0aCBbdGltZSwgb2JqZWN0XVxuICAgKiAtIEFuIG9iamVjdCB3aXRoIHsgdGltZTogPywgW25hbWV8bm90ZXxtaWRpfGtleV06ID8gfVxuICAgKlxuICAgKiBAcGFyYW0ge0Zsb2F0fSB0aW1lIC0gYW4gYWJzb2x1dGUgdGltZSB0byBzdGFydCAob3IgQXVkaW9Db250ZXh0J3NcbiAgICogY3VycmVudFRpbWUgaWYgcHJvdmlkZWQgbnVtYmVyIGlzIDApXG4gICAqIEBwYXJhbSB7QXJyYXl9IGV2ZW50cyAtIHRoZSBldmVudHMgbGlzdC5cbiAgICogQHJldHVybiB7QXJyYXl9IGFuIGFycmF5IG9mIGlkc1xuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiAvLyBFdmVudCBmb3JtYXQ6IFt0aW1lLCBub3RlXVxuICAgKiB2YXIgcGlhbm8gPSBwbGF5ZXIoYWMsIC4uLikuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICogcGlhbm8uc2NoZWR1bGUoMCwgWyBbMCwgJ0MyJ10sIFswLjUsICdDMyddLCBbMSwgJ0M0J10gXSlcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogLy8gRXZlbnQgZm9ybWF0OiBhbiBvYmplY3QgeyB0aW1lOiA/LCBuYW1lOiA/IH1cbiAgICogdmFyIGRydW1zID0gcGxheWVyKGFjLCAuLi4pLmNvbm5lY3QoYWMuZGVzdGluYXRpb24pXG4gICAqIGRydW1zLnNjaGVkdWxlKDAsIFtcbiAgICogICB7IG5hbWU6ICdraWNrJywgdGltZTogMCB9LFxuICAgKiAgIHsgbmFtZTogJ3NuYXJlJywgdGltZTogMC41IH0sXG4gICAqICAgeyBuYW1lOiAna2ljaycsIHRpbWU6IDEgfSxcbiAgICogICB7IG5hbWU6ICdzbmFyZScsIHRpbWU6IDEuNSB9XG4gICAqIF0pXG4gICAqL1xuICBwbGF5ZXIuc2NoZWR1bGUgPSBmdW5jdGlvbiAodGltZSwgZXZlbnRzKSB7XG4gICAgdmFyIG5vdyA9IHBsYXllci5jb250ZXh0LmN1cnJlbnRUaW1lXG4gICAgdmFyIHdoZW4gPSB0aW1lIDwgbm93ID8gbm93IDogdGltZVxuICAgIHBsYXllci5lbWl0KCdzY2hlZHVsZScsIHdoZW4sIGV2ZW50cylcbiAgICB2YXIgdCwgbywgbm90ZSwgb3B0c1xuICAgIHJldHVybiBldmVudHMubWFwKGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgaWYgKCFldmVudCkgcmV0dXJuIG51bGxcbiAgICAgIGVsc2UgaWYgKGlzQXJyKGV2ZW50KSkge1xuICAgICAgICB0ID0gZXZlbnRbMF07IG8gPSBldmVudFsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdCA9IGV2ZW50LnRpbWU7IG8gPSBldmVudFxuICAgICAgfVxuXG4gICAgICBpZiAoaXNPYmoobykpIHtcbiAgICAgICAgbm90ZSA9IG8ubmFtZSB8fCBvLmtleSB8fCBvLm5vdGUgfHwgby5taWRpIHx8IG51bGxcbiAgICAgICAgb3B0cyA9IG9cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5vdGUgPSBvXG4gICAgICAgIG9wdHMgPSBPUFRTXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwbGF5ZXIuc3RhcnQobm90ZSwgd2hlbiArICh0IHx8IDApLCBvcHRzKVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHBsYXllclxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IGxvYWQgPSByZXF1aXJlKCcuLi9hdWRpby1sb2FkZXIvaW5kZXgnKS5sb2FkXG5jb25zdCBwbGF5ZXIgPSByZXF1aXJlKCcuLi9zYW1wbGUtcGxheWVyL2luZGV4JykuU2FtcGxlUGxheWVyXG5cbi8qKlxuICogTG9hZCBhIHNvdW5kZm9udCBpbnN0cnVtZW50LiBJdCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFcbiAqIGluc3RydW1lbnQgb2JqZWN0LlxuICpcbiAqIFRoZSBpbnN0cnVtZW50IG9iamVjdCByZXR1cm5lZCBieSB0aGUgcHJvbWlzZSBoYXMgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICpcbiAqIC0gbmFtZTogdGhlIGluc3RydW1lbnQgbmFtZVxuICogLSBwbGF5OiBBIGZ1bmN0aW9uIHRvIHBsYXkgbm90ZXMgZnJvbSB0aGUgYnVmZmVyIHdpdGggdGhlIHNpZ25hdHVyZVxuICogYHBsYXkobm90ZSwgdGltZSwgZHVyYXRpb24sIG9wdGlvbnMpYFxuICpcbiAqXG4gKiBUaGUgdmFsaWQgb3B0aW9ucyBhcmU6XG4gKlxuICogLSBgZm9ybWF0YDogdGhlIHNvdW5kZm9udCBmb3JtYXQuICdtcDMnIGJ5IGRlZmF1bHQuIENhbiBiZSAnb2dnJ1xuICogLSBgc291bmRmb250YDogdGhlIHNvdW5kZm9udCBuYW1lLiAnTXVzeW5nS2l0ZScgYnkgZGVmYXVsdC4gQ2FuIGJlICdGbHVpZFIzX0dNJ1xuICogLSBgbmFtZVRvVXJsYCA8RnVuY3Rpb24+OiBhIGZ1bmN0aW9uIHRvIGNvbnZlcnQgZnJvbSBpbnN0cnVtZW50IG5hbWVzIHRvIFVSTFxuICogLSBgZGVzdGluYXRpb25gOiBieSBkZWZhdWx0IFNvdW5kZm9udCB1c2VzIHRoZSBgYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uYCBidXQgeW91IGNhbiBvdmVycmlkZSBpdC5cbiAqIC0gYGdhaW5gOiB0aGUgZ2FpbiBvZiB0aGUgcGxheWVyICgxIGJ5IGRlZmF1bHQpXG4gKiAtIGBub3Rlc2A6IGFuIGFycmF5IG9mIHRoZSBub3RlcyB0byBkZWNvZGUuIEl0IGNhbiBiZSBhbiBhcnJheSBvZiBzdHJpbmdzXG4gKiB3aXRoIG5vdGUgbmFtZXMgb3IgYW4gYXJyYXkgb2YgbnVtYmVycyB3aXRoIG1pZGkgbm90ZSBudW1iZXJzLiBUaGlzIGlzIGFcbiAqIHBlcmZvcm1hbmNlIG9wdGlvbjogc2luY2UgZGVjb2RpbmcgbXAzIGlzIGEgY3B1IGludGVuc2l2ZSBwcm9jZXNzLCB5b3UgY2FuIGxpbWl0XG4gKiBsaW1pdCB0aGUgbnVtYmVyIG9mIG5vdGVzIHlvdSB3YW50IGFuZCByZWR1Y2UgdGhlIHRpbWUgdG8gbG9hZCB0aGUgaW5zdHJ1bWVudC5cbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYWMgLSB0aGUgYXVkaW8gY29udGV4dFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSB0aGUgaW5zdHJ1bWVudCBuYW1lLiBGb3IgZXhhbXBsZTogJ2Fjb3VzdGljX2dyYW5kX3BpYW5vJ1xuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSAoT3B0aW9uYWwpIHRoZSBzYW1lIG9wdGlvbnMgYXMgU291bmRmb250LmxvYWRCdWZmZXJzXG4gKiBAcmV0dXJuIHtQcm9taXNlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB2YXIgU291bmRmb250ID0gcmVxdWlyZSgnc291bmZvbnQtcGxheWVyJylcbiAqIFNvdW5kZm9udC5pbnN0cnVtZW50KCdtYXJpbWJhJykudGhlbihmdW5jdGlvbiAobWFyaW1iYSkge1xuICogICBtYXJpbWJhLnBsYXkoJ0M0JylcbiAqIH0pXG4gKi9cbmZ1bmN0aW9uIGluc3RydW1lbnQoYWMsIG5hbWUsIG9wdGlvbnMpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHJldHVybiBmdW5jdGlvbiAobiwgbykgeyByZXR1cm4gaW5zdHJ1bWVudChhYywgbiwgbykgfVxuICBjb25zdCBvcHRzID0gb3B0aW9ucyB8fCB7fVxuICBjb25zdCBpc1VybCA9IG9wdHMuaXNTb3VuZGZvbnRVUkwgfHwgaXNTb3VuZGZvbnRVUkxcbiAgY29uc3QgdG9VcmwgPSBvcHRzLm5hbWVUb1VybCB8fCBuYW1lVG9VcmxcbiAgY29uc3QgdXJsID0gaXNVcmwobmFtZSkgPyBuYW1lIDogdG9VcmwobmFtZSwgb3B0cy5zb3VuZGZvbnQsIG9wdHMuZm9ybWF0KVxuXG4gIHJldHVybiBsb2FkKGFjLCB1cmwsIHsgb25seTogb3B0cy5vbmx5IHx8IG9wdHMubm90ZXMgfSkudGhlbihmdW5jdGlvbiAoYnVmZmVycykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXIoYWMsIGJ1ZmZlcnMsIG9wdHMpLmNvbm5lY3Qob3B0cy5kZXN0aW5hdGlvbiA/IG9wdHMuZGVzdGluYXRpb24gOiBhYy5kZXN0aW5hdGlvbilcbiAgICBwLnVybCA9IHVybFxuICAgIHAubmFtZSA9IG5hbWVcbiAgICByZXR1cm4gcFxuICB9KVxufVxuXG5mdW5jdGlvbiBpc1NvdW5kZm9udFVSTChuYW1lKSB7XG4gIHJldHVybiAvXFwuanMoXFw/LiopPyQvaS50ZXN0KG5hbWUpXG59XG5cbi8qKlxuICogR2l2ZW4gYW4gaW5zdHJ1bWVudCBuYW1lIHJldHVybnMgYSBVUkwgdG8gdG8gdGhlIEJlbmphbWluIEdsZWl0em1hbidzXG4gKiBwYWNrYWdlIG9mIFtwcmUtcmVuZGVyZWQgc291bmQgZm9udHNdKGh0dHBzOi8vZ2l0aHViLmNvbS9nbGVpdHovbWlkaS1qcy1zb3VuZGZvbnRzKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gaW5zdHJ1bWVudCBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gc291bmRmb250IC0gKE9wdGlvbmFsKSB0aGUgc291bmRmb250IG5hbWUuIE9uZSBvZiAnRmx1aWRSM19HTSdcbiAqIG9yICdNdXN5bmdLaXRlJyAoJ011c3luZ0tpdGUnIGJ5IGRlZmF1bHQpXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9ybWF0IC0gKE9wdGlvbmFsKSBDYW4gYmUgJ21wMycgb3IgJ29nZycgKG1wMyBieSBkZWZhdWx0KVxuICogQHJldHVybnMge1N0cmluZ30gdGhlIFNvdW5kZm9udCBmaWxlIHVybFxuICogQGV4YW1wbGVcbiAqIHZhciBTb3VuZGZvbnQgPSByZXF1aXJlKCdzb3VuZGZvbnQtcGxheWVyJylcbiAqIFNvdW5kZm9udC5uYW1lVG9VcmwoJ21hcmltYmEnLCAnbXAzJylcbiAqL1xuZnVuY3Rpb24gbmFtZVRvVXJsKG5hbWUsIHNmLCBmb3JtYXQpIHtcbiAgZm9ybWF0ID0gZm9ybWF0ID09PSAnb2dnJyA/IGZvcm1hdCA6ICdtcDMnXG4gIHNmID0gc2YgPT09ICdGbHVpZFIzX0dNJyA/IHNmIDogJ011c3luZ0tpdGUnXG4gIHJldHVybiAnaHR0cHM6Ly9nbGVpdHouZ2l0aHViLmlvL21pZGktanMtc291bmRmb250cy8nICsgc2YgKyAnLycgKyBuYW1lICsgJy0nICsgZm9ybWF0ICsgJy5qcydcbn1cblxuY29uc3QgU291bmRmb250ID0ge1xuICBpbnN0cnVtZW50LFxuICBuYW1lVG9VcmwsXG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBTb3VuZGZvbnQgfVxuIiwiY29uc3QgQ29uc3RhbnRzID0gcmVxdWlyZSgnLi9jb25zdGFudHMnKS5Db25zdGFudHM7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKS5VdGlscztcblxuLyoqXG4gKiBDbGFzcyByZXByZXNlbnRpbmcgYSB0cmFjay4gIENvbnRhaW5zIG1ldGhvZHMgZm9yIHBhcnNpbmcgZXZlbnRzIGFuZCBrZWVwaW5nIHRyYWNrIG9mIHBvaW50ZXIuXG4gKi9cbmNsYXNzIFRyYWNrIHtcblx0Y29uc3RydWN0b3IoaW5kZXgsIGRhdGEpIHtcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuZXZlbnRJbmRleCA9IDA7XG5cdFx0dGhpcy5wb2ludGVyID0gMDtcblx0XHR0aGlzLmxhc3RUaWNrID0gMDtcblx0XHR0aGlzLmxhc3RTdGF0dXMgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXggPSBpbmRleDtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMuZGVsdGEgPSAwO1xuXHRcdHRoaXMucnVubmluZ0RlbHRhID0gMDtcblx0XHR0aGlzLmV2ZW50cyA9IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0cyBhbGwgc3RhdGVmdWwgdHJhY2sgaW5mb3JtYWlvbiB1c2VkIGR1cmluZyBwbGF5YmFjay5cblx0ICogQHJldHVybiB7VHJhY2t9XG5cdCAqL1xuXHRyZXNldCgpIHtcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuZXZlbnRJbmRleCA9IDA7XG5cdFx0dGhpcy5wb2ludGVyID0gMDtcblx0XHR0aGlzLmxhc3RUaWNrID0gMDtcblx0XHR0aGlzLmxhc3RTdGF0dXMgPSBudWxsO1xuXHRcdHRoaXMuZGVsdGEgPSAwO1xuXHRcdHRoaXMucnVubmluZ0RlbHRhID0gMDtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoaXMgdHJhY2sgdG8gYmUgZW5hYmxlZCBkdXJpbmcgcGxheWJhY2suXG5cdCAqIEByZXR1cm4ge1RyYWNrfVxuXHQgKi9cblx0ZW5hYmxlKCkge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGlzIHRyYWNrIHRvIGJlIGRpc2FibGVkIGR1cmluZyBwbGF5YmFjay5cblx0ICogQHJldHVybiB7VHJhY2t9XG5cdCAqL1xuXHRkaXNhYmxlKCkge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIHRyYWNrIGV2ZW50IGluZGV4IHRvIHRoZSBuZWFyZXN0IGV2ZW50IHRvIHRoZSBnaXZlbiB0aWNrLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gdGlja1xuXHQgKiBAcmV0dXJuIHtUcmFja31cblx0ICovXG5cdHNldEV2ZW50SW5kZXhCeVRpY2sodGljaykge1xuXHRcdHRpY2sgPSB0aWNrIHx8IDA7XG5cblx0XHRmb3IgKGxldCBpIGluIHRoaXMuZXZlbnRzKSB7XG5cdFx0XHRpZiAodGhpcy5ldmVudHNbaV0udGljayA+PSB0aWNrKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRJbmRleCA9IGk7XG5cdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGJ5dGUgbG9jYXRlZCBhdCBwb2ludGVyIHBvc2l0aW9uLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRDdXJyZW50Qnl0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhW3RoaXMucG9pbnRlcl07XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBjb3VudCBvZiBkZWx0YSBieXRlcyBhbmQgY3VycmVudCBwb2ludGVyIHBvc2l0aW9uLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXREZWx0YUJ5dGVDb3VudCgpIHtcblx0XHQvLyBHZXQgYnl0ZSBjb3VudCBvZiBkZWx0YSBWTFZcblx0XHQvLyBodHRwOi8vd3d3LmNjYXJoLm9yZy9jb3Vyc2VzLzI1My9oYW5kb3V0L3Zsdi9cblx0XHQvLyBJZiBieXRlIGlzIGdyZWF0ZXIgb3IgZXF1YWwgdG8gODBoICgxMjggZGVjaW1hbCkgdGhlbiB0aGUgbmV4dCBieXRlXG5cdFx0Ly8gaXMgYWxzbyBwYXJ0IG9mIHRoZSBWTFYsXG5cdFx0Ly8gZWxzZSBieXRlIGlzIHRoZSBsYXN0IGJ5dGUgaW4gYSBWTFYuXG5cdFx0bGV0IGN1cnJlbnRCeXRlID0gdGhpcy5nZXRDdXJyZW50Qnl0ZSgpO1xuXHRcdGxldCBieXRlQ291bnQgPSAxO1xuXG5cdFx0d2hpbGUgKGN1cnJlbnRCeXRlID49IDEyOCkge1xuXHRcdFx0Y3VycmVudEJ5dGUgPSB0aGlzLmRhdGFbdGhpcy5wb2ludGVyICsgYnl0ZUNvdW50XTtcblx0XHRcdGJ5dGVDb3VudCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBieXRlQ291bnQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGRlbHRhIHZhbHVlIGF0IGN1cnJlbnQgcG9pbnRlciBwb3NpdGlvbi5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0Z2V0RGVsdGEoKSB7XG5cdFx0cmV0dXJuIFV0aWxzLnJlYWRWYXJJbnQodGhpcy5kYXRhLnN1YmFycmF5KHRoaXMucG9pbnRlciwgdGhpcy5wb2ludGVyICsgdGhpcy5nZXREZWx0YUJ5dGVDb3VudCgpKSk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBldmVudCB3aXRoaW4gYSBnaXZlbiB0cmFjayBzdGFydGluZyBhdCBzcGVjaWZpZWQgaW5kZXhcblx0ICogQHBhcmFtIHtudW1iZXJ9IGN1cnJlbnRUaWNrXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gZHJ5UnVuIC0gSWYgdHJ1ZSBldmVudHMgd2lsbCBiZSBwYXJzZWQgYW5kIHJldHVybmVkIHJlZ2FyZGxlc3Mgb2YgdGltZS5cblx0ICovXG5cdGhhbmRsZUV2ZW50KGN1cnJlbnRUaWNrLCBkcnlSdW4pIHtcblx0XHRkcnlSdW4gPSBkcnlSdW4gfHwgZmFsc2U7XG5cblx0XHRpZiAoZHJ5UnVuKSB7XG5cdFx0XHRjb25zdCBlbGFwc2VkVGlja3MgPSBjdXJyZW50VGljayAtIHRoaXMubGFzdFRpY2s7XG5cdFx0XHRjb25zdCBkZWx0YSA9IHRoaXMuZ2V0RGVsdGEoKTtcblx0XHRcdGNvbnN0IGV2ZW50UmVhZHkgPSBlbGFwc2VkVGlja3MgPj0gZGVsdGE7XG5cblx0XHRcdGlmICh0aGlzLnBvaW50ZXIgPCB0aGlzLmRhdGEubGVuZ3RoICYmIChkcnlSdW4gfHwgZXZlbnRSZWFkeSkpIHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSB0aGlzLnBhcnNlRXZlbnQoKTtcblx0XHRcdFx0aWYgKHRoaXMuZW5hYmxlZClcblx0XHRcdFx0XHRyZXR1cm4gZXZlbnQ7XG5cdFx0XHRcdC8vIFJlY3Vyc2l2ZWx5IGNhbGwgdGhpcyBmdW5jdGlvbiBmb3IgZWFjaCBldmVudCBhaGVhZCB0aGF0IGhhcyAwIGRlbHRhIHRpbWU/XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTGV0J3MgYWN0dWFsbHkgcGxheSB0aGUgTUlESSBmcm9tIHRoZSBnZW5lcmF0ZWQgSlNPTiBldmVudHMgY3JlYXRlZCBieSB0aGUgZHJ5IHJ1bi5cblx0XHRcdGlmICh0aGlzLmV2ZW50c1t0aGlzLmV2ZW50SW5kZXhdICYmIHRoaXMuZXZlbnRzW3RoaXMuZXZlbnRJbmRleF0udGljayA8PSBjdXJyZW50VGljaykge1xuXHRcdFx0XHR0aGlzLmV2ZW50SW5kZXgrKztcblx0XHRcdFx0aWYgKHRoaXMuZW5hYmxlZClcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5ldmVudHNbdGhpcy5ldmVudEluZGV4IC0gMV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHN0cmluZyBkYXRhIGZyb20gZXZlbnQuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBldmVudFN0YXJ0SW5kZXhcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0Z2V0U3RyaW5nRGF0YShldmVudFN0YXJ0SW5kZXgpIHtcblx0XHQvL2NvbnN0IGN1cnJlbnRCeXRlID0gdGhpcy5wb2ludGVyO1xuXHRcdGNvbnN0IGJ5dGVDb3VudCA9IDE7XG5cdFx0Y29uc3QgbGVuZ3RoID0gVXRpbHMucmVhZFZhckludCh0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgMiwgZXZlbnRTdGFydEluZGV4ICsgMiArIGJ5dGVDb3VudCkpO1xuXHRcdC8vY29uc3Qgc3RyaW5nTGVuZ3RoID0gbGVuZ3RoO1xuXG5cdFx0cmV0dXJuIFV0aWxzLmJ5dGVzVG9MZXR0ZXJzKHRoaXMuZGF0YS5zdWJhcnJheShldmVudFN0YXJ0SW5kZXggKyBieXRlQ291bnQgKyAyLCBldmVudFN0YXJ0SW5kZXggKyBieXRlQ291bnQgKyBsZW5ndGggKyAyKSk7XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2VzIGV2ZW50IGludG8gSlNPTiBhbmQgYWR2YW5jZXMgcG9pbnRlciBmb3IgdGhlIHRyYWNrXG5cdCAqIEByZXR1cm4ge29iamVjdH1cblx0ICovXG5cdHBhcnNlRXZlbnQoKSB7XG5cdFx0Y29uc3QgZXZlbnRTdGFydEluZGV4ID0gdGhpcy5wb2ludGVyICsgdGhpcy5nZXREZWx0YUJ5dGVDb3VudCgpO1xuXHRcdGNvbnN0IGV2ZW50SnNvbiA9IHt9O1xuXHRcdGNvbnN0IGRlbHRhQnl0ZUNvdW50ID0gdGhpcy5nZXREZWx0YUJ5dGVDb3VudCgpO1xuXHRcdGV2ZW50SnNvbi50cmFjayA9IHRoaXMuaW5kZXggKyAxO1xuXHRcdGV2ZW50SnNvbi5kZWx0YSA9IHRoaXMuZ2V0RGVsdGEoKTtcblx0XHR0aGlzLmxhc3RUaWNrID0gdGhpcy5sYXN0VGljayArIGV2ZW50SnNvbi5kZWx0YTtcblx0XHR0aGlzLnJ1bm5pbmdEZWx0YSArPSBldmVudEpzb24uZGVsdGE7XG5cdFx0ZXZlbnRKc29uLnRpY2sgPSB0aGlzLnJ1bm5pbmdEZWx0YTtcblx0XHRldmVudEpzb24uYnl0ZUluZGV4ID0gdGhpcy5wb2ludGVyO1xuXG5cdFx0Ly9ldmVudEpzb24ucmF3ID0gZXZlbnQ7XG5cdFx0aWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdID09IDB4ZmYpIHtcblx0XHRcdC8vIE1ldGEgRXZlbnRcblxuXHRcdFx0Ly8gSWYgdGhpcyBpcyBhIG1ldGEgZXZlbnQgd2Ugc2hvdWxkIGVtaXQgdGhlIGRhdGEgYW5kIGltbWVkaWF0ZWx5IG1vdmUgdG8gdGhlIG5leHQgZXZlbnRcblx0XHRcdC8vIG90aGVyd2lzZSBpZiB3ZSBsZXQgaXQgcnVuIHRocm91Z2ggdGhlIG5leHQgY3ljbGUgYSBzbGlnaHQgZGVsYXkgd2lsbCBhY2N1bXVsYXRlIGlmIG11bHRpcGxlIHRyYWNrc1xuXHRcdFx0Ly8gYXJlIGJlaW5nIHBsYXllZCBzaW11bHRhbmVvdXNseVxuXG5cdFx0XHRzd2l0Y2ggKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXSkge1xuXHRcdFx0XHRjYXNlIDB4MDA6IC8vIFNlcXVlbmNlIE51bWJlclxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NlcXVlbmNlIE51bWJlcic7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwMTogLy8gVGV4dCBFdmVudFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1RleHQgRXZlbnQnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDAyOiAvLyBDb3B5cmlnaHQgTm90aWNlXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnQ29weXJpZ2h0IE5vdGljZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwMzogLy8gU2VxdWVuY2UvVHJhY2sgTmFtZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NlcXVlbmNlL1RyYWNrIE5hbWUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA0OiAvLyBJbnN0cnVtZW50IE5hbWVcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdJbnN0cnVtZW50IE5hbWUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA1OiAvLyBMeXJpY1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0x5cmljJztcblx0XHRcdFx0XHRldmVudEpzb24uc3RyaW5nID0gdGhpcy5nZXRTdHJpbmdEYXRhKGV2ZW50U3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwNjogLy8gTWFya2VyXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnTWFya2VyJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA3OiAvLyBDdWUgUG9pbnRcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdDdWUgUG9pbnQnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA5OiAvLyBEZXZpY2UgTmFtZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0RldmljZSBOYW1lJztcblx0XHRcdFx0XHRldmVudEpzb24uc3RyaW5nID0gdGhpcy5nZXRTdHJpbmdEYXRhKGV2ZW50U3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgyMDogLy8gTUlESSBDaGFubmVsIFByZWZpeFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ01JREkgQ2hhbm5lbCBQcmVmaXgnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIDB4MjE6IC8vIE1JREkgUG9ydFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ01JREkgUG9ydCc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSBVdGlscy5ieXRlc1RvTnVtYmVyKFt0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgM11dKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDJGOiAvLyBFbmQgb2YgVHJhY2tcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdFbmQgb2YgVHJhY2snO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIDB4NTE6IC8vIFNldCBUZW1wb1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NldCBUZW1wbyc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSBNYXRoLnJvdW5kKDYwMDAwMDAwIC8gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgMywgZXZlbnRTdGFydEluZGV4ICsgNikpKTtcblx0XHRcdFx0XHR0aGlzLnRlbXBvID0gZXZlbnRKc29uLmRhdGE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg1NDogLy8gU01UUEUgT2Zmc2V0XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnU01UUEUgT2Zmc2V0Jztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDU4OiAvLyBUaW1lIFNpZ25hdHVyZVxuXHRcdFx0XHRcdC8vIEZGIDU4IDA0IG5uIGRkIGNjIGJiXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnVGltZSBTaWduYXR1cmUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5kYXRhID0gdGhpcy5kYXRhLnN1YmFycmF5KGV2ZW50U3RhcnRJbmRleCArIDMsIGV2ZW50U3RhcnRJbmRleCArIDcpO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi50aW1lU2lnbmF0dXJlID0gXCJcIiArIGV2ZW50SnNvbi5kYXRhWzBdICsgXCIvXCIgKyBNYXRoLnBvdygyLCBldmVudEpzb24uZGF0YVsxXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg1OTogLy8gS2V5IFNpZ25hdHVyZVxuXHRcdFx0XHRcdC8vIEZGIDU5IDAyIHNmIG1pXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnS2V5IFNpZ25hdHVyZSc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSB0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgMywgZXZlbnRTdGFydEluZGV4ICsgNSk7XG5cblx0XHRcdFx0XHRpZiAoZXZlbnRKc29uLmRhdGFbMF0gPj0gMCkge1xuXHRcdFx0XHRcdFx0ZXZlbnRKc29uLmtleVNpZ25hdHVyZSA9IENvbnN0YW50cy5DSVJDTEVfT0ZfRklGVEhTW2V2ZW50SnNvbi5kYXRhWzBdXTtcblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnRKc29uLmRhdGFbMF0gPCAwKSB7XG5cdFx0XHRcdFx0XHRldmVudEpzb24ua2V5U2lnbmF0dXJlID0gQ29uc3RhbnRzLkNJUkNMRV9PRl9GT1VSVEhTW01hdGguYWJzKGV2ZW50SnNvbi5kYXRhWzBdKV07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGV2ZW50SnNvbi5kYXRhWzFdID09IDApIHtcblx0XHRcdFx0XHRcdGV2ZW50SnNvbi5rZXlTaWduYXR1cmUgKz0gJyBNYWpvcic7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50SnNvbi5kYXRhWzFdID09IDEpIHtcblx0XHRcdFx0XHRcdGV2ZW50SnNvbi5rZXlTaWduYXR1cmUgKz0gJyBNaW5vcic7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg3RjogLy8gU2VxdWVuY2VyLVNwZWNpZmljIE1ldGEtZXZlbnRcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdTZXF1ZW5jZXItU3BlY2lmaWMgTWV0YS1ldmVudCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSBgVW5rbm93bjogJHt0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV0udG9TdHJpbmcoMTYpfWA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxlbmd0aCA9IHRoaXMuZGF0YVt0aGlzLnBvaW50ZXIgKyBkZWx0YUJ5dGVDb3VudCArIDJdO1xuXHRcdFx0Ly8gU29tZSBtZXRhIGV2ZW50cyB3aWxsIGhhdmUgdmx2IHRoYXQgbmVlZHMgdG8gYmUgaGFuZGxlZFxuXG5cdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAzICsgbGVuZ3RoO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA9PSAweGYwKSB7XG5cdFx0XHQvLyBTeXNleFxuXHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnU3lzZXgnO1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gdGhpcy5kYXRhW3RoaXMucG9pbnRlciArIGRlbHRhQnl0ZUNvdW50ICsgMV07XG5cdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAyICsgbGVuZ3RoO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFZvaWNlIGV2ZW50XG5cdFx0XHRpZiAodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF0gPCAweDgwKSB7XG5cdFx0XHRcdC8vIFJ1bm5pbmcgc3RhdHVzXG5cdFx0XHRcdGV2ZW50SnNvbi5ydW5uaW5nID0gdHJ1ZTtcblx0XHRcdFx0ZXZlbnRKc29uLm5vdGVOdW1iZXIgPSB0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XTtcblx0XHRcdFx0ZXZlbnRKc29uLm5vdGVOYW1lID0gQ29uc3RhbnRzLk5PVEVTW3RoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdXTtcblx0XHRcdFx0ZXZlbnRKc29uLnZlbG9jaXR5ID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdO1xuXG5cdFx0XHRcdGlmICh0aGlzLmxhc3RTdGF0dXMgPD0gMHg4Zikge1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ05vdGUgb2ZmJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4ODAgKyAxO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5sYXN0U3RhdHVzIDw9IDB4OWYpIHtcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdOb3RlIG9uJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4OTAgKyAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMjtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXN0U3RhdHVzID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF07XG5cblx0XHRcdFx0aWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4OGYpIHtcblx0XHRcdFx0XHQvLyBOb3RlIG9mZlxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ05vdGUgb2ZmJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4ODAgKyAxO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5ub3RlTnVtYmVyID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5ub3RlTmFtZSA9IENvbnN0YW50cy5OT1RFU1t0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV1dO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi52ZWxvY2l0eSA9IE1hdGgucm91bmQodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDJdIC8gMTI3ICogMTAwKTtcblx0XHRcdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAzO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF0gPD0gMHg5Zikge1xuXHRcdFx0XHRcdC8vIE5vdGUgb25cblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdOb3RlIG9uJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4OTAgKyAxO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5ub3RlTnVtYmVyID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5ub3RlTmFtZSA9IENvbnN0YW50cy5OT1RFU1t0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV1dO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi52ZWxvY2l0eSA9IE1hdGgucm91bmQodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDJdIC8gMTI3ICogMTAwKTtcblx0XHRcdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAzO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF0gPD0gMHhhZikge1xuXHRcdFx0XHRcdC8vIFBvbHlwaG9uaWMgS2V5IFByZXNzdXJlXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnUG9seXBob25pYyBLZXkgUHJlc3N1cmUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5jaGFubmVsID0gdGhpcy5sYXN0U3RhdHVzIC0gMHhhMCArIDE7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5vdGUgPSBDb25zdGFudHMuTk9URVNbdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdXTtcblx0XHRcdFx0XHRldmVudEpzb24ucHJlc3N1cmUgPSBldmVudFsyXTtcblx0XHRcdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAzO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF0gPD0gMHhiZikge1xuXHRcdFx0XHRcdC8vIENvbnRyb2xsZXIgQ2hhbmdlXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnQ29udHJvbGxlciBDaGFuZ2UnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5jaGFubmVsID0gdGhpcy5sYXN0U3RhdHVzIC0gMHhiMCArIDE7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm51bWJlciA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXTtcblx0XHRcdFx0XHRldmVudEpzb24udmFsdWUgPSB0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMl07XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMztcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4Y2YpIHtcblx0XHRcdFx0XHQvLyBQcm9ncmFtIENoYW5nZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1Byb2dyYW0gQ2hhbmdlJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4YzAgKyAxO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi52YWx1ZSA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXTtcblx0XHRcdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAyO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF0gPD0gMHhkZikge1xuXHRcdFx0XHRcdC8vIENoYW5uZWwgS2V5IFByZXNzdXJlXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnQ2hhbm5lbCBLZXkgUHJlc3N1cmUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5jaGFubmVsID0gdGhpcy5sYXN0U3RhdHVzIC0gMHhkMCArIDE7XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMjtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4ZWYpIHtcblx0XHRcdFx0XHQvLyBQaXRjaCBCZW5kXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnUGl0Y2ggQmVuZCc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweGUwICsgMTtcblx0XHRcdFx0XHR0aGlzLnBvaW50ZXIgKz0gZGVsdGFCeXRlQ291bnQgKyAzO1xuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSBgVW5rbm93bi4gIFBvaW50ZXI6ICR7dGhpcy5wb2ludGVyLnRvU3RyaW5nKCl9ICR7ZXZlbnRTdGFydEluZGV4LnRvU3RyaW5nKCl9ICR7dGhpcy5kYXRhLmxlbmd0aH1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kZWx0YSArPSBldmVudEpzb24uZGVsdGE7XG5cdFx0dGhpcy5ldmVudHMucHVzaChldmVudEpzb24pO1xuXG5cdFx0cmV0dXJuIGV2ZW50SnNvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgcG9pbnRlciBoYXMgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSB0cmFjay5cblx0ICogQHBhcmFtIHtib29sZWFufVxuXHQgKi9cblx0ZW5kT2ZUcmFjaygpIHtcblx0XHRpZiAodGhpcy5kYXRhW3RoaXMucG9pbnRlciArIDFdID09IDB4ZmYgJiYgdGhpcy5kYXRhW3RoaXMucG9pbnRlciArIDJdID09IDB4MmYgJiYgdGhpcy5kYXRhW3RoaXMucG9pbnRlciArIDNdID09IDB4MDApXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgVHJhY2sgfVxuIiwiLyoqXG4gKiBDb250YWlucyBtaXNjIHN0YXRpYyB1dGlsaXR5IG1ldGhvZHMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzaW5nbGUgYnl0ZSB0byBhIGhleCBzdHJpbmcuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBieXRlXG5cdCAqIEByZXR1cm4ge3N0cmluZ31cblx0ICovXG5cdHN0YXRpYyBieXRlVG9IZXgoYnl0ZSkge1xuXHRcdC8vIEVuc3VyZSBoZXggc3RyaW5nIGFsd2F5cyBoYXMgdHdvIGNoYXJzXG5cdFx0cmV0dXJuIGAwJHtieXRlLnRvU3RyaW5nKDE2KX1gLnNsaWNlKC0yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhbiBhcnJheSBvZiBieXRlcyB0byBhIGhleCBzdHJpbmcuXG5cdCAqIEBwYXJhbSB7YXJyYXl9IGJ5dGVBcnJheVxuXHQgKiBAcmV0dXJuIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0aWMgYnl0ZXNUb0hleChieXRlQXJyYXkpIHtcblx0XHRjb25zdCBoZXggPSBbXTtcblx0XHRieXRlQXJyYXkuZm9yRWFjaChieXRlID0+IGhleC5wdXNoKFV0aWxzLmJ5dGVUb0hleChieXRlKSkpO1xuXHRcdHJldHVybiBoZXguam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBoZXggc3RyaW5nIHRvIGEgbnVtYmVyLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gaGV4U3RyaW5nXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdHN0YXRpYyBoZXhUb051bWJlcihoZXhTdHJpbmcpIHtcblx0XHRyZXR1cm4gcGFyc2VJbnQoaGV4U3RyaW5nLCAxNik7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYW4gYXJyYXkgb2YgYnl0ZXMgdG8gYSBudW1iZXIuXG5cdCAqIEBwYXJhbSB7YXJyYXl9IGJ5dGVBcnJheVxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRzdGF0aWMgYnl0ZXNUb051bWJlcihieXRlQXJyYXkpIHtcblx0XHRyZXR1cm4gVXRpbHMuaGV4VG9OdW1iZXIoVXRpbHMuYnl0ZXNUb0hleChieXRlQXJyYXkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhbiBhcnJheSBvZiBieXRlcyB0byBsZXR0ZXJzLlxuXHQgKiBAcGFyYW0ge2FycmF5fSBieXRlQXJyYXlcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGljIGJ5dGVzVG9MZXR0ZXJzKGJ5dGVBcnJheSkge1xuXHRcdGNvbnN0IGxldHRlcnMgPSBbXTtcblx0XHRieXRlQXJyYXkuZm9yRWFjaChieXRlID0+IGxldHRlcnMucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGUpKSk7XG5cdFx0cmV0dXJuIGxldHRlcnMuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBkZWNpbWFsIHRvIGl0J3MgYmluYXJ5IHJlcHJlc2VudGF0aW9uLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gZGVjXG5cdCAqIEByZXR1cm4ge3N0cmluZ31cblx0ICovXG5cdHN0YXRpYyBkZWNUb0JpbmFyeShkZWMpIHtcblx0XHRyZXR1cm4gKGRlYyA+Pj4gMCkudG9TdHJpbmcoMik7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYSB2YXJpYWJsZSBsZW5ndGggdmFsdWUuXG5cdCAqIEBwYXJhbSB7YXJyYXl9IGJ5dGVBcnJheVxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRzdGF0aWMgcmVhZFZhckludChieXRlQXJyYXkpIHtcblx0XHRsZXQgcmVzdWx0ID0gMDtcblx0XHRieXRlQXJyYXkuZm9yRWFjaChudW1iZXIgPT4ge1xuXHRcdFx0dmFyIGIgPSBudW1iZXI7XG5cdFx0XHRpZiAoYiAmIDB4ODApIHtcblx0XHRcdFx0cmVzdWx0ICs9IChiICYgMHg3Zik7XG5cdFx0XHRcdHJlc3VsdCA8PD0gNztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8qIGIgaXMgdGhlIGxhc3QgYnl0ZSAqL1xuXHRcdFx0XHRyZXN1bHQgKz0gYjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVjb2RlcyBiYXNlLTY0IGVuY29kZWQgc3RyaW5nXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdHJpbmdcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0LyogT25seSBmb3IgTm9kZUpTIVxuXHRzdGF0aWMgYXRvYihzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIGF0b2IgPT09ICdmdW5jdGlvbicpIHJldHVybiBhdG9iKHN0cmluZyk7XG5cdFx0cmV0dXJuIG5ldyBCdWZmZXIoc3RyaW5nLCAnYmFzZTY0JykudG9TdHJpbmcoJ2JpbmFyeScpO1xuXHR9XG5cdCovXG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBVdGlscyB9Il19
