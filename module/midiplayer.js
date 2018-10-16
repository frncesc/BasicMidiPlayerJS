(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.MidiPlayer = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = ADSR

function ADSR(audioContext){
  var node = audioContext.createGain()

  var voltage = node._voltage = getVoltage(audioContext)
  var value = scale(voltage)
  var startValue = scale(voltage)
  var endValue = scale(voltage)

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

var props = {

  attack: { value: 0, writable: true },
  decay: { value: 0, writable: true },
  sustain: { value: 1, writable: true },
  release: {value: 0, writable: true },

  getReleaseDuration: {
    value: function(){
      return this.release
    }
  },

  start: {
    value: function(at){
      var target = this._multiplier.gain
      var startAmount = this._startAmount.gain
      var endAmount = this._endAmount.gain

      this._voltage.start(at)
      this._decayFrom = this._decayFrom = at+this.attack
      this._startedAt = at

      var sustain = this.sustain

      target.cancelScheduledValues(at)
      startAmount.cancelScheduledValues(at)
      endAmount.cancelScheduledValues(at)

      endAmount.setValueAtTime(0, at)

      if (this.attack){
        target.setValueAtTime(0, at)
        target.linearRampToValueAtTime(1, at + this.attack)

        startAmount.setValueAtTime(1, at)
        startAmount.linearRampToValueAtTime(0, at + this.attack)
      } else {
        target.setValueAtTime(1, at)
        startAmount.setValueAtTime(0, at)
      }

      if (this.decay){
        target.setTargetAtTime(sustain, this._decayFrom, getTimeConstant(this.decay))
      }
    }
  },

  stop: {
    value: function(at, isTarget){
      if (isTarget){
        at = at - this.release
      }

      var endTime = at + this.release
      if (this.release){

        var target = this._multiplier.gain
        var startAmount = this._startAmount.gain
        var endAmount = this._endAmount.gain

        target.cancelScheduledValues(at)
        startAmount.cancelScheduledValues(at)
        endAmount.cancelScheduledValues(at)

        var expFalloff = getTimeConstant(this.release)

        // truncate attack (required as linearRamp is removed by cancelScheduledValues)
        if (this.attack && at < this._decayFrom){
          var valueAtTime = getValue(0, 1, this._startedAt, this._decayFrom, at)
          target.linearRampToValueAtTime(valueAtTime, at)
          startAmount.linearRampToValueAtTime(1-valueAtTime, at)
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
    get: function(){
      return this._voltage.onended
    },
    set: function(value){
      this._voltage.onended = value
    }
  }

}

var flat = new Float32Array([1,1])
function getVoltage(context){
  var voltage = context.createBufferSource()
  var buffer = context.createBuffer(1, 2, context.sampleRate)
  buffer.getChannelData(0).set(flat)
  voltage.buffer = buffer
  voltage.loop = true
  return voltage
}

function scale(node){
  var gain = node.context.createGain()
  node.connect(gain)
  return gain
}

function getTimeConstant(time){
  return Math.log(time+1)/Math.log(100)
}

function getValue(start, end, fromTime, toTime, at){
  var difference = end - start
  var time = toTime - fromTime
  var truncateTime = at - fromTime
  var phase = truncateTime / time
  var value = start + phase * difference

  if (value <= start) {
      value = start
  }
  if (value >= end) {
      value = end
  }

  return value
}

},{}],2:[function(require,module,exports){
'use strict'

// DECODE UTILITIES
function b64ToUint6 (nChr) {
  return nChr > 64 && nChr < 91 ? nChr - 65
    : nChr > 96 && nChr < 123 ? nChr - 71
    : nChr > 47 && nChr < 58 ? nChr + 4
    : nChr === 43 ? 62
    : nChr === 47 ? 63
    : 0
}

// Decode Base64 to Uint8Array
// ---------------------------
function decode (sBase64, nBlocksSize) {
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
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255
      }
      nUint24 = 0
    }
  }
  return taBytes
}

module.exports = { decode: decode }

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
function fromRegex (r) {
  return function (o) { return typeof o === 'string' && r.test(o) }
}
// Try to apply a prefix to a name
function prefix (pre, name) {
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
function load (ac, source, options, defVal) {
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
function isArrayBuffer (o) { return o instanceof ArrayBuffer }
function loadArrayBuffer (ac, array, options) {
  return new Promise(function (done, reject) {
    ac.decodeAudioData(array,
      function (buffer) { done(buffer) },
      function () { reject("Can't decode audio data (" + array.slice(0, 30) + '...)') }
    )
  })
}

// Load an audio filename
var isAudioFileName = fromRegex(/\.(mp3|wav|ogg)(\?.*)?$/i)
function loadAudioFile (ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'arraybuffer'), options)
}

// Load the result of a promise
function isPromise (o) { return o && typeof o.then === 'function' }
function loadPromise (ac, promise, options) {
  return promise.then(function (value) {
    return load(ac, value, options)
  })
}

// COMPOUND OBJECTS
// ================

// Try to load all the items of an array
var isArray = Array.isArray
function loadArrayData (ac, array, options) {
  return Promise.all(array.map(function (data) {
    return load(ac, data, options, data)
  }))
}

// Try to load all the values of a key/value object
function isObject (o) { return o && typeof o === 'object' }
function loadObjectData (ac, obj, options) {
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
function loadJsonFile (ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'text').then(JSON.parse), options)
}

// BASE64 ENCODED FORMATS
// ======================

// Load strings with Base64 encoded audio
var isBase64Audio = fromRegex(/^data:audio/)
function loadBase64Audio (ac, source, options) {
  var i = source.indexOf(',')
  return load(ac, base64.decode(source.slice(i + 1)).buffer, options)
}

// Load .js files with MidiJS soundfont prerendered audio
var isJsFileName = fromRegex(/\.js(\?.*)?$/i)
function loadMidiJSFile (ac, name, options) {
  var url = prefix(options.from, name)
  return load(ac, load.fetch(url, 'text').then(midiJsToJson), options)
}

// convert a MIDI.js javascript soundfont file to json
function midiJsToJson (data) {
  var begin = data.indexOf('MIDI.Soundfont.')
  if (begin < 0) throw Error('Invalid MIDI.js Soundfont format')
  begin = data.indexOf('=', begin) + 2
  var end = data.lastIndexOf(',')
  return JSON.parse(data.slice(begin, end) + '}')
}

//if (typeof module === 'object' && module.exports) module.exports = load
//if (typeof window !== 'undefined') window.loadAudio = load
module.exports.load = load


},{"./base64":2,"./fetch":3}],5:[function(require,module,exports){
/**
 * Constants used in player.
 */
var Constants = {
	VERSION: '2.0.4',
	NOTES: [],
	CIRCLE_OF_FOURTHS: ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb', 'Bbb', 'Ebb', 'Abb'],
	CIRCLE_OF_FIFTHS: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#']
};

// Builds notes object for reference against binary values.
var allNotes = [['C'], ['C#','Db'], ['D'], ['D#','Eb'], ['E'],['F'], ['F#','Gb'], ['G'], ['G#','Ab'], ['A'], ['A#','Bb'], ['B']];
var counter = 0;

// All available octaves.
for (let i = -1; i <= 9; i++) {
	allNotes.forEach(noteGroup => {
		noteGroup.forEach(note => Constants.NOTES[counter] = note + i);
		counter ++;
	});
}

exports.Constants = Constants;
},{}],6:[function(require,module,exports){
const Player = require('./player');
const Soundfont = require('./soundfont-player/index');
const Utils = require('./utils');
const Constants = require('./constants');
const load = require('./audio-loader/index');
const SamplePlayer = require('./sample-player/index');

module.exports = {
    Player: Player.Player,
    Soundfont: Soundfont.Soundfont,
    Utils: Utils.Utils,
    Constants: Constants.Constants,
    load: load.load,
    SamplePlayer: SamplePlayer.SamplePlayer,
}


},{"./audio-loader/index":4,"./constants":5,"./player":8,"./sample-player/index":10,"./soundfont-player/index":14,"./utils":17}],7:[function(require,module,exports){
'use strict'

module.exports = {}

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
module.exports.regex = () => REGEX;

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
module.exports.parse = (str, isTonic, tuning) => {
  if (typeof str !== 'string') return null
  const m = REGEX.exec(str)
  if (!m || (!isTonic && m[4])) return null

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
  if (isTonic) p.tonicOf = m[4]
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
module.exports.build = (s, a, o) => {
  if (s === null || typeof s === 'undefined') return null
  if (s.step) return build(s.step, s.alt, s.oct)
  if (s < 0 || s > 6) return null
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
module.exports.midi = note => {
  if ((isNum(note) || isStr(note)) && note >= 0 && note < 128) return +note
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
module.exports.freq = (note, tuning) => {
  const m = midi(note)
  return m === null ? null : midiToFreq(m, tuning)
}

module.exports.letter = src => (parse(src) || {}).letter
module.exports.acc = src => (parse(src) || {}).acc
module.exports.pc = src => (parse(src) || {}).pc
module.exports.step = src => (parse(src) || {}).step
module.exports.alt = src => (parse(src) || {}).alt
module.exports.chroma = src => (parse(src) || {}).chroma
module.exports.oct = src => (parse(src) || {}).oct

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
	/*
	loadFile(path) {
		var fs = require('fs');
		this.buffer = fs.readFileSync(path);
		return this.fileLoaded();
	}
	*/

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
		var byteString = Utils.atob(dataUri.split(',')[1]);

		// write the bytes of the string to an ArrayBuffer
		var ia = new Uint8Array(byteString.length);
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}

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
		if (this.isPlaying()) throw 'Already playing...';

		// Initialize
		if (!this.startTime) this.startTime = (new Date()).getTime();

		// Start play loop
		//window.requestAnimationFrame(this.playLoop.bind(this));
		this.setIntervalId = setInterval(this.playLoop.bind(this), this.sampleRate);

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
		var songTime = this.getSongTime();
		if (seconds < 0 || seconds > songTime) throw `${seconds} seconds not within song time of ${songTime}`;
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
		while (!this.endOfFile()) this.playLoop(true);
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
		return this.tracks.reduce((a, b) => { return { events: { length: a.events.length + b.events.length } } }, { events: { length: 0 } }).events.length;
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
		if (this.isPlaying()) {
			return this.eventsPlayed() == this.totalEvents;
		}

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
		if (!this.eventListeners.hasOwnProperty(playerEvent)) this.eventListeners[playerEvent] = [];
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
		if (this.eventListeners.hasOwnProperty(playerEvent)) this.eventListeners[playerEvent].forEach(fn => fn(data || {}));
		return this;
	}

}

exports.Player = Player;

},{"./track":16,"./utils":17}],9:[function(require,module,exports){

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

function SamplePlayer (ac, source, options) {
  //return midi(scheduler(notes(events(player(ac, source, options)))))
  return scheduler(notes(events(player(ac, source, options))))
}

//if (typeof module === 'object' && module.exports) module.exports = SamplePlayer
//if (typeof window !== 'undefined') window.SamplePlayer = SamplePlayer
module.exports.SamplePlayer = SamplePlayer

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

function mapBuffers (buffers, toKey) {
  return Object.keys(buffers).reduce(function (mapped, name) {
    mapped[toKey(name)] = buffers[name]
    return mapped
  }, {})
}

},{"../note-parser/index":7}],12:[function(require,module,exports){
/* global AudioBuffer */
'use strict'

var ADSR = require('../adsr/index')

var EMPTY = {}
var DEFAULTS = {
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
 * var SamplePlayer = require('sample-player')
 * var ac = new AudioContext()
 * var snare = SamplePlayer(ac, <AudioBuffer>)
 * snare.play()
 */
function SamplePlayer (ac, source, options) {
  var connected = false
  var nextId = 0
  var tracked = {}
  var out = ac.createGain()
  out.gain.value = 1

  var opts = Object.assign({}, DEFAULTS, options)

  /**
   * @namespace
   */
  var player = { context: ac, out: out, opts: opts }
  if (source instanceof AudioBuffer) player.buffer = source
  else player.buffers = source

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
    if (player.buffer && name !== null) return player.start(null, name, when)

    var buffer = name ? player.buffers[name] : player.buffer
    if (!buffer) {
      console.warn('Buffer ' + name + ' not found.')
      return
    } else if (!connected) {
      console.warn('SamplePlayer not connected to any node.')
      return
    }

    var opts = options || EMPTY
    when = Math.max(ac.currentTime, when || 0)
    player.emit('start', when, name, opts)
    var node = createNode(name, buffer, opts)
    node.id = track(name, node)
    node.env.start(when)
    node.source.start(when)
    player.emit('started', when, node.id, node)
    if (opts.duration) node.stop(when + opts.duration)
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
    var node
    ids = ids || Object.keys(tracked)
    return ids.map(function (id) {
      node = tracked[id]
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
    var fn = player['on' + event]
    if (fn) fn(when, obj, opts)
  }

  return player

  // =============== PRIVATE FUNCTIONS ============== //

  function track (name, node) {
    node.id = nextId++
    tracked[node.id] = node
    node.source.onended = function () {
      var now = ac.currentTime
      node.source.disconnect()
      node.env.disconnect()
      node.disconnect()
      player.emit('ended', now, node.id, node)
    }
    return node.id
  }

  function createNode (name, buffer, options) {
    var node = ac.createGain()
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
      var time = when || ac.currentTime
      player.emit('stop', time, name)
      var stopAt = node.env.stop(time)
      node.source.stop(stopAt)
    }
    return node
  }
}

function isNum (x) { return typeof x === 'number' }
var PARAMS = ['attack', 'decay', 'sustain', 'release']
function envelope (ac, options, opts) {
  var env = ADSR(ac)
  var adsr = options.adsr || opts.adsr
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
function centsToRate (cents) { return cents ? Math.pow(2, cents / 1200) : 1 }

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

var load = require('../audio-loader/index')
var player = require('../sample-player/index')

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
function instrument (ac, name, options) {
  if (arguments.length === 1) return function (n, o) { return instrument(ac, n, o) }
  var opts = options || {}
  var isUrl = opts.isSoundfontURL || isSoundfontURL
  var toUrl = opts.nameToUrl || nameToUrl
  var url = isUrl(name) ? name : toUrl(name, opts.soundfont, opts.format)

  return load(ac, url, { only: opts.only || opts.notes }).then(function (buffers) {
    var p = player(ac, buffers, opts).connect(opts.destination ? opts.destination : ac.destination)
    p.url = url
    p.name = name
    return p
  })
}

function isSoundfontURL (name) {
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
function nameToUrl (name, sf, format) {
  format = format === 'ogg' ? format : 'mp3'
  sf = sf === 'FluidR3_GM' ? sf : 'MusyngKite'
  return 'https://gleitz.github.io/midi-js-soundfonts/' + sf + '/' + name + '-' + format + '.js'
}

// In the 1.0.0 release it will be:
// var Soundfont = {}
var Soundfont = require('./legacy')
Soundfont.instrument = instrument
Soundfont.nameToUrl = nameToUrl

//if (typeof module === 'object' && module.exports) module.exports = Soundfont
//if (typeof window !== 'undefined') window.Soundfont = Soundfont
module.exports.Soundfont = Soundfont


},{"../audio-loader/index":4,"../sample-player/index":10,"./legacy":15}],15:[function(require,module,exports){
'use strict'

var parser = require('../note-parser/index')

/**
 * Create a Soundfont object
 *
 * @param {AudioContext} context - the [audio context](https://developer.mozilla.org/en/docs/Web/API/AudioContext)
 * @param {Function} nameToUrl - (Optional) a function that maps the sound font name to the url
 * @return {Soundfont} a soundfont object
 */
function Soundfont (ctx, nameToUrl) {
  console.warn('new Soundfont() is deprected')
  console.log('Please use Soundfont.instrument() instead of new Soundfont().instrument()')
  if (!(this instanceof Soundfont)) return new Soundfont(ctx)

  this.nameToUrl = nameToUrl || Soundfont.nameToUrl
  this.ctx = ctx
  this.instruments = {}
  this.promises = []
}

Soundfont.prototype.onready = function (callback) {
  console.warn('deprecated API')
  console.log('Please use Promise.all(Soundfont.instrument(), Soundfont.instrument()).then() instead of new Soundfont().onready()')
  Promise.all(this.promises).then(callback)
}

Soundfont.prototype.instrument = function (name, options) {
  console.warn('new Soundfont().instrument() is deprecated.')
  console.log('Please use Soundfont.instrument() instead.')
  var ctx = this.ctx
  name = name || 'default'
  if (name in this.instruments) return this.instruments[name]
  var inst = {name: name, play: oscillatorPlayer(ctx, options)}
  this.instruments[name] = inst
  if (name !== 'default') {
    var promise = Soundfont.instrument(ctx, name, options).then(function (instrument) {
      inst.play = instrument.play
      return inst
    })
    this.promises.push(promise)
    inst.onready = function (cb) {
      console.warn('onready is deprecated. Use Soundfont.instrument().then()')
      promise.then(cb)
    }
  } else {
    inst.onready = function (cb) {
      console.warn('onready is deprecated. Use Soundfont.instrument().then()')
      cb()
    }
  }
  return inst
}

/*
 * Load the buffers of a given instrument name. It returns a promise that resolves
 * to a hash with midi note numbers as keys, and audio buffers as values.
 *
 * @param {AudioContext} ac - the audio context
 * @param {String} name - the instrument name (it accepts an url if starts with "http")
 * @param {Object} options - (Optional) options object
 * @return {Promise} a promise that resolves to a Hash of { midiNoteNum: <AudioBuffer> }
 *
 * The options object accepts the following keys:
 *
 * - nameToUrl {Function}: a function to convert from instrument names to urls.
 * By default it uses Benjamin Gleitzman's package of
 * [pre-rendered sound fonts](https://github.com/gleitz/midi-js-soundfonts)
 * - notes {Array}: the list of note names to be decoded (all by default)
 *
 * @example
 * var Soundfont = require('soundfont-player')
 * Soundfont.loadBuffers(ctx, 'acoustic_grand_piano').then(function(buffers) {
 *  buffers[60] // => An <AudioBuffer> corresponding to note C4
 * })
 */
function loadBuffers (ac, name, options) {
  console.warn('Soundfont.loadBuffers is deprecate.')
  console.log('Use Soundfont.instrument(..) and get buffers properties from the result.')
  return Soundfont.instrument(ac, name, options).then(function (inst) {
    return inst.buffers
  })
}
Soundfont.loadBuffers = loadBuffers

/**
 * Returns a function that plays an oscillator
 *
 * @param {AudioContext} ac - the audio context
 * @param {Hash} defaultOptions - (Optional) a hash of options:
 * - vcoType: the oscillator type (default: 'sine')
 * - gain: the output gain value (default: 0.4)
  * - destination: the player destination (default: ac.destination)
 */
function oscillatorPlayer (ctx, defaultOptions) {
  defaultOptions = defaultOptions || {}
  return function (note, time, duration, options) {
    console.warn('The oscillator player is deprecated.')
    console.log('Starting with version 0.9.0 you will have to wait until the soundfont is loaded to play sounds.')
    var midi = note > 0 && note < 129 ? +note : parser.midi(note)
    var freq = midi ? parser.midiToFreq(midi, 440) : null
    if (!freq) return

    duration = duration || 0.2

    options = options || {}
    var destination = options.destination || defaultOptions.destination || ctx.destination
    var vcoType = options.vcoType || defaultOptions.vcoType || 'sine'
    var gain = options.gain || defaultOptions.gain || 0.4

    var vco = ctx.createOscillator()
    vco.type = vcoType
    vco.frequency.value = freq

    /* VCA */
    var vca = ctx.createGain()
    vca.gain.value = gain

    /* Connections */
    vco.connect(vca)
    vca.connect(destination)

    vco.start(time)
    if (duration > 0) vco.stop(time + duration)
    return vco
  }
}

/**
 * Given a note name, return the note midi number
 *
 * @name noteToMidi
 * @function
 * @param {String} noteName
 * @return {Integer} the note midi number or null if not a valid note name
 */
Soundfont.noteToMidi = parser.midi

module.exports = Soundfont

},{"../note-parser/index":7}],16:[function(require,module,exports){
const Constants = require('./constants').Constants;
const Utils = require('./utils').Utils;

/**
 * Class representing a track.  Contains methods for parsing events and keeping track of pointer.
 */
class Track	{
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

		for (var i in this.events) {
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
	   	var currentByte = this.getCurrentByte();
	   	var byteCount = 1;

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
			var elapsedTicks = currentTick - this.lastTick;
			var delta = this.getDelta();
			var eventReady = elapsedTicks >= delta;

			if (this.pointer < this.data.length && (dryRun || eventReady)) {
				let event = this.parseEvent();
				if (this.enabled) return event;
				// Recursively call this function for each event ahead that has 0 delta time?
			}

		} else {
			// Let's actually play the MIDI from the generated JSON events created by the dry run.
			if (this.events[this.eventIndex] && this.events[this.eventIndex].tick <= currentTick) {
				this.eventIndex++;
				if (this.enabled) return this.events[this.eventIndex - 1];
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
		var currentByte = this.pointer;
		var byteCount = 1;
		var length = Utils.readVarInt(this.data.subarray(eventStartIndex + 2, eventStartIndex + 2 + byteCount));
		var stringLength = length;

		return Utils.bytesToLetters(this.data.subarray(eventStartIndex + byteCount + 2, eventStartIndex + byteCount + length + 2));
	}

	/**
	 * Parses event into JSON and advances pointer for the track
	 * @return {object}
	 */
	parseEvent() {
		var eventStartIndex = this.pointer + this.getDeltaByteCount();
		var eventJson = {};
		var deltaByteCount = this.getDeltaByteCount();
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

			switch(this.data[eventStartIndex + 1]) {
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

			var length = this.data[this.pointer + deltaByteCount + 2];
			// Some meta events will have vlv that needs to be handled

			this.pointer += deltaByteCount + 3 + length;

		} else if(this.data[eventStartIndex] == 0xf0) {
			// Sysex
			eventJson.name = 'Sysex';
			var length = this.data[this.pointer + deltaByteCount + 1];
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
		if (this.data[this.pointer + 1] == 0xff && this.data[this.pointer + 2] == 0x2f && this.data[this.pointer + 3] == 0x00) {
			return true;
		}

		return false;
	}
}

module.exports.Track = Track;
},{"./constants":5,"./utils":17}],17:[function(require,module,exports){
(function (Buffer){
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
		var hex = [];
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
		var letters = [];
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
		var result = 0;
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
	static atob(string) {
		if (typeof atob === 'function') return atob(string);
		return new Buffer(string, 'base64').toString('binary');
	}
}

exports.Utils = Utils;
}).call(this,require("buffer").Buffer)

},{"buffer":undefined}]},{},[6])(6)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWRzci9pbmRleC5qcyIsInNyYy9hdWRpby1sb2FkZXIvYmFzZTY0LmpzIiwic3JjL2F1ZGlvLWxvYWRlci9mZXRjaC5qcyIsInNyYy9hdWRpby1sb2FkZXIvaW5kZXguanMiLCJzcmMvY29uc3RhbnRzLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL25vdGUtcGFyc2VyL2luZGV4LmpzIiwic3JjL3BsYXllci5qcyIsInNyYy9zYW1wbGUtcGxheWVyL2V2ZW50cy5qcyIsInNyYy9zYW1wbGUtcGxheWVyL2luZGV4LmpzIiwic3JjL3NhbXBsZS1wbGF5ZXIvbm90ZXMuanMiLCJzcmMvc2FtcGxlLXBsYXllci9wbGF5ZXIuanMiLCJzcmMvc2FtcGxlLXBsYXllci9zY2hlZHVsZXIuanMiLCJzcmMvc291bmRmb250LXBsYXllci9pbmRleC5qcyIsInNyYy9zb3VuZGZvbnQtcGxheWVyL2xlZ2FjeS5qcyIsInNyYy90cmFjay5qcyIsInNyYy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJtb2R1bGUuZXhwb3J0cyA9IEFEU1JcblxuZnVuY3Rpb24gQURTUihhdWRpb0NvbnRleHQpe1xuICB2YXIgbm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKClcblxuICB2YXIgdm9sdGFnZSA9IG5vZGUuX3ZvbHRhZ2UgPSBnZXRWb2x0YWdlKGF1ZGlvQ29udGV4dClcbiAgdmFyIHZhbHVlID0gc2NhbGUodm9sdGFnZSlcbiAgdmFyIHN0YXJ0VmFsdWUgPSBzY2FsZSh2b2x0YWdlKVxuICB2YXIgZW5kVmFsdWUgPSBzY2FsZSh2b2x0YWdlKVxuXG4gIG5vZGUuX3N0YXJ0QW1vdW50ID0gc2NhbGUoc3RhcnRWYWx1ZSlcbiAgbm9kZS5fZW5kQW1vdW50ID0gc2NhbGUoZW5kVmFsdWUpXG5cbiAgbm9kZS5fbXVsdGlwbGllciA9IHNjYWxlKHZhbHVlKVxuICBub2RlLl9tdWx0aXBsaWVyLmNvbm5lY3Qobm9kZSlcbiAgbm9kZS5fc3RhcnRBbW91bnQuY29ubmVjdChub2RlKVxuICBub2RlLl9lbmRBbW91bnQuY29ubmVjdChub2RlKVxuXG4gIG5vZGUudmFsdWUgPSB2YWx1ZS5nYWluXG4gIG5vZGUuc3RhcnRWYWx1ZSA9IHN0YXJ0VmFsdWUuZ2FpblxuICBub2RlLmVuZFZhbHVlID0gZW5kVmFsdWUuZ2FpblxuXG4gIG5vZGUuc3RhcnRWYWx1ZS52YWx1ZSA9IDBcbiAgbm9kZS5lbmRWYWx1ZS52YWx1ZSA9IDBcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhub2RlLCBwcm9wcylcbiAgcmV0dXJuIG5vZGVcbn1cblxudmFyIHByb3BzID0ge1xuXG4gIGF0dGFjazogeyB2YWx1ZTogMCwgd3JpdGFibGU6IHRydWUgfSxcbiAgZGVjYXk6IHsgdmFsdWU6IDAsIHdyaXRhYmxlOiB0cnVlIH0sXG4gIHN1c3RhaW46IHsgdmFsdWU6IDEsIHdyaXRhYmxlOiB0cnVlIH0sXG4gIHJlbGVhc2U6IHt2YWx1ZTogMCwgd3JpdGFibGU6IHRydWUgfSxcblxuICBnZXRSZWxlYXNlRHVyYXRpb246IHtcbiAgICB2YWx1ZTogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0aGlzLnJlbGVhc2VcbiAgICB9XG4gIH0sXG5cbiAgc3RhcnQ6IHtcbiAgICB2YWx1ZTogZnVuY3Rpb24oYXQpe1xuICAgICAgdmFyIHRhcmdldCA9IHRoaXMuX211bHRpcGxpZXIuZ2FpblxuICAgICAgdmFyIHN0YXJ0QW1vdW50ID0gdGhpcy5fc3RhcnRBbW91bnQuZ2FpblxuICAgICAgdmFyIGVuZEFtb3VudCA9IHRoaXMuX2VuZEFtb3VudC5nYWluXG5cbiAgICAgIHRoaXMuX3ZvbHRhZ2Uuc3RhcnQoYXQpXG4gICAgICB0aGlzLl9kZWNheUZyb20gPSB0aGlzLl9kZWNheUZyb20gPSBhdCt0aGlzLmF0dGFja1xuICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gYXRcblxuICAgICAgdmFyIHN1c3RhaW4gPSB0aGlzLnN1c3RhaW5cblxuICAgICAgdGFyZ2V0LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhhdClcbiAgICAgIHN0YXJ0QW1vdW50LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhhdClcbiAgICAgIGVuZEFtb3VudC5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMoYXQpXG5cbiAgICAgIGVuZEFtb3VudC5zZXRWYWx1ZUF0VGltZSgwLCBhdClcblxuICAgICAgaWYgKHRoaXMuYXR0YWNrKXtcbiAgICAgICAgdGFyZ2V0LnNldFZhbHVlQXRUaW1lKDAsIGF0KVxuICAgICAgICB0YXJnZXQubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMSwgYXQgKyB0aGlzLmF0dGFjaylcblxuICAgICAgICBzdGFydEFtb3VudC5zZXRWYWx1ZUF0VGltZSgxLCBhdClcbiAgICAgICAgc3RhcnRBbW91bnQubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMCwgYXQgKyB0aGlzLmF0dGFjaylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRhcmdldC5zZXRWYWx1ZUF0VGltZSgxLCBhdClcbiAgICAgICAgc3RhcnRBbW91bnQuc2V0VmFsdWVBdFRpbWUoMCwgYXQpXG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmRlY2F5KXtcbiAgICAgICAgdGFyZ2V0LnNldFRhcmdldEF0VGltZShzdXN0YWluLCB0aGlzLl9kZWNheUZyb20sIGdldFRpbWVDb25zdGFudCh0aGlzLmRlY2F5KSlcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgc3RvcDoge1xuICAgIHZhbHVlOiBmdW5jdGlvbihhdCwgaXNUYXJnZXQpe1xuICAgICAgaWYgKGlzVGFyZ2V0KXtcbiAgICAgICAgYXQgPSBhdCAtIHRoaXMucmVsZWFzZVxuICAgICAgfVxuXG4gICAgICB2YXIgZW5kVGltZSA9IGF0ICsgdGhpcy5yZWxlYXNlXG4gICAgICBpZiAodGhpcy5yZWxlYXNlKXtcblxuICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy5fbXVsdGlwbGllci5nYWluXG4gICAgICAgIHZhciBzdGFydEFtb3VudCA9IHRoaXMuX3N0YXJ0QW1vdW50LmdhaW5cbiAgICAgICAgdmFyIGVuZEFtb3VudCA9IHRoaXMuX2VuZEFtb3VudC5nYWluXG5cbiAgICAgICAgdGFyZ2V0LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhhdClcbiAgICAgICAgc3RhcnRBbW91bnQuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKGF0KVxuICAgICAgICBlbmRBbW91bnQuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKGF0KVxuXG4gICAgICAgIHZhciBleHBGYWxsb2ZmID0gZ2V0VGltZUNvbnN0YW50KHRoaXMucmVsZWFzZSlcblxuICAgICAgICAvLyB0cnVuY2F0ZSBhdHRhY2sgKHJlcXVpcmVkIGFzIGxpbmVhclJhbXAgaXMgcmVtb3ZlZCBieSBjYW5jZWxTY2hlZHVsZWRWYWx1ZXMpXG4gICAgICAgIGlmICh0aGlzLmF0dGFjayAmJiBhdCA8IHRoaXMuX2RlY2F5RnJvbSl7XG4gICAgICAgICAgdmFyIHZhbHVlQXRUaW1lID0gZ2V0VmFsdWUoMCwgMSwgdGhpcy5fc3RhcnRlZEF0LCB0aGlzLl9kZWNheUZyb20sIGF0KVxuICAgICAgICAgIHRhcmdldC5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2YWx1ZUF0VGltZSwgYXQpXG4gICAgICAgICAgc3RhcnRBbW91bnQubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMS12YWx1ZUF0VGltZSwgYXQpXG4gICAgICAgICAgc3RhcnRBbW91bnQuc2V0VGFyZ2V0QXRUaW1lKDAsIGF0LCBleHBGYWxsb2ZmKVxuICAgICAgICB9XG5cbiAgICAgICAgZW5kQW1vdW50LnNldFRhcmdldEF0VGltZSgxLCBhdCwgZXhwRmFsbG9mZilcbiAgICAgICAgdGFyZ2V0LnNldFRhcmdldEF0VGltZSgwLCBhdCwgZXhwRmFsbG9mZilcbiAgICAgIH1cblxuICAgICAgdGhpcy5fdm9sdGFnZS5zdG9wKGVuZFRpbWUpXG4gICAgICByZXR1cm4gZW5kVGltZVxuICAgIH1cbiAgfSxcblxuICBvbmVuZGVkOiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHRoaXMuX3ZvbHRhZ2Uub25lbmRlZFxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICB0aGlzLl92b2x0YWdlLm9uZW5kZWQgPSB2YWx1ZVxuICAgIH1cbiAgfVxuXG59XG5cbnZhciBmbGF0ID0gbmV3IEZsb2F0MzJBcnJheShbMSwxXSlcbmZ1bmN0aW9uIGdldFZvbHRhZ2UoY29udGV4dCl7XG4gIHZhciB2b2x0YWdlID0gY29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKVxuICB2YXIgYnVmZmVyID0gY29udGV4dC5jcmVhdGVCdWZmZXIoMSwgMiwgY29udGV4dC5zYW1wbGVSYXRlKVxuICBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCkuc2V0KGZsYXQpXG4gIHZvbHRhZ2UuYnVmZmVyID0gYnVmZmVyXG4gIHZvbHRhZ2UubG9vcCA9IHRydWVcbiAgcmV0dXJuIHZvbHRhZ2Vcbn1cblxuZnVuY3Rpb24gc2NhbGUobm9kZSl7XG4gIHZhciBnYWluID0gbm9kZS5jb250ZXh0LmNyZWF0ZUdhaW4oKVxuICBub2RlLmNvbm5lY3QoZ2FpbilcbiAgcmV0dXJuIGdhaW5cbn1cblxuZnVuY3Rpb24gZ2V0VGltZUNvbnN0YW50KHRpbWUpe1xuICByZXR1cm4gTWF0aC5sb2codGltZSsxKS9NYXRoLmxvZygxMDApXG59XG5cbmZ1bmN0aW9uIGdldFZhbHVlKHN0YXJ0LCBlbmQsIGZyb21UaW1lLCB0b1RpbWUsIGF0KXtcbiAgdmFyIGRpZmZlcmVuY2UgPSBlbmQgLSBzdGFydFxuICB2YXIgdGltZSA9IHRvVGltZSAtIGZyb21UaW1lXG4gIHZhciB0cnVuY2F0ZVRpbWUgPSBhdCAtIGZyb21UaW1lXG4gIHZhciBwaGFzZSA9IHRydW5jYXRlVGltZSAvIHRpbWVcbiAgdmFyIHZhbHVlID0gc3RhcnQgKyBwaGFzZSAqIGRpZmZlcmVuY2VcblxuICBpZiAodmFsdWUgPD0gc3RhcnQpIHtcbiAgICAgIHZhbHVlID0gc3RhcnRcbiAgfVxuICBpZiAodmFsdWUgPj0gZW5kKSB7XG4gICAgICB2YWx1ZSA9IGVuZFxuICB9XG5cbiAgcmV0dXJuIHZhbHVlXG59XG4iLCIndXNlIHN0cmljdCdcblxuLy8gREVDT0RFIFVUSUxJVElFU1xuZnVuY3Rpb24gYjY0VG9VaW50NiAobkNocikge1xuICByZXR1cm4gbkNociA+IDY0ICYmIG5DaHIgPCA5MSA/IG5DaHIgLSA2NVxuICAgIDogbkNociA+IDk2ICYmIG5DaHIgPCAxMjMgPyBuQ2hyIC0gNzFcbiAgICA6IG5DaHIgPiA0NyAmJiBuQ2hyIDwgNTggPyBuQ2hyICsgNFxuICAgIDogbkNociA9PT0gNDMgPyA2MlxuICAgIDogbkNociA9PT0gNDcgPyA2M1xuICAgIDogMFxufVxuXG4vLyBEZWNvZGUgQmFzZTY0IHRvIFVpbnQ4QXJyYXlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGVjb2RlIChzQmFzZTY0LCBuQmxvY2tzU2l6ZSkge1xuICB2YXIgc0I2NEVuYyA9IHNCYXNlNjQucmVwbGFjZSgvW15BLVphLXowLTlcXCtcXC9dL2csICcnKVxuICB2YXIgbkluTGVuID0gc0I2NEVuYy5sZW5ndGhcbiAgdmFyIG5PdXRMZW4gPSBuQmxvY2tzU2l6ZVxuICAgID8gTWF0aC5jZWlsKChuSW5MZW4gKiAzICsgMSA+PiAyKSAvIG5CbG9ja3NTaXplKSAqIG5CbG9ja3NTaXplXG4gICAgOiBuSW5MZW4gKiAzICsgMSA+PiAyXG4gIHZhciB0YUJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkobk91dExlbilcblxuICBmb3IgKHZhciBuTW9kMywgbk1vZDQsIG5VaW50MjQgPSAwLCBuT3V0SWR4ID0gMCwgbkluSWR4ID0gMDsgbkluSWR4IDwgbkluTGVuOyBuSW5JZHgrKykge1xuICAgIG5Nb2Q0ID0gbkluSWR4ICYgM1xuICAgIG5VaW50MjQgfD0gYjY0VG9VaW50NihzQjY0RW5jLmNoYXJDb2RlQXQobkluSWR4KSkgPDwgMTggLSA2ICogbk1vZDRcbiAgICBpZiAobk1vZDQgPT09IDMgfHwgbkluTGVuIC0gbkluSWR4ID09PSAxKSB7XG4gICAgICBmb3IgKG5Nb2QzID0gMDsgbk1vZDMgPCAzICYmIG5PdXRJZHggPCBuT3V0TGVuOyBuTW9kMysrLCBuT3V0SWR4KyspIHtcbiAgICAgICAgdGFCeXRlc1tuT3V0SWR4XSA9IG5VaW50MjQgPj4+ICgxNiA+Pj4gbk1vZDMgJiAyNCkgJiAyNTVcbiAgICAgIH1cbiAgICAgIG5VaW50MjQgPSAwXG4gICAgfVxuICB9XG4gIHJldHVybiB0YUJ5dGVzXG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBkZWNvZGU6IGRlY29kZSB9XG4iLCIvKiBnbG9iYWwgWE1MSHR0cFJlcXVlc3QgKi9cbid1c2Ugc3RyaWN0J1xuXG4vKipcbiAqIEdpdmVuIGEgdXJsIGFuZCBhIHJldHVybiB0eXBlLCByZXR1cm5zIGEgcHJvbWlzZSB0byB0aGUgY29udGVudCBvZiB0aGUgdXJsXG4gKiBCYXNpY2FsbHkgaXQgd3JhcHMgYSBYTUxIdHRwUmVxdWVzdCBpbnRvIGEgUHJvbWlzZVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gY2FuIGJlICd0ZXh0JyBvciAnYXJyYXlidWZmZXInXG4gKiBAcmV0dXJuIHtQcm9taXNlfVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh1cmwsIHR5cGUpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChkb25lLCByZWplY3QpIHtcbiAgICB2YXIgcmVxID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICBpZiAodHlwZSkgcmVxLnJlc3BvbnNlVHlwZSA9IHR5cGVcblxuICAgIHJlcS5vcGVuKCdHRVQnLCB1cmwpXG4gICAgcmVxLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlcS5zdGF0dXMgPT09IDIwMCA/IGRvbmUocmVxLnJlc3BvbnNlKSA6IHJlamVjdChFcnJvcihyZXEuc3RhdHVzVGV4dCkpXG4gICAgfVxuICAgIHJlcS5vbmVycm9yID0gZnVuY3Rpb24gKCkgeyByZWplY3QoRXJyb3IoJ05ldHdvcmsgRXJyb3InKSkgfVxuICAgIHJlcS5zZW5kKClcbiAgfSlcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnLi9iYXNlNjQnKVxudmFyIGZldGNoID0gcmVxdWlyZSgnLi9mZXRjaCcpXG5cbi8vIEdpdmVuIGEgcmVnZXgsIHJldHVybiBhIGZ1bmN0aW9uIHRoYXQgdGVzdCBpZiBhZ2FpbnN0IGEgc3RyaW5nXG5mdW5jdGlvbiBmcm9tUmVnZXggKHIpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChvKSB7IHJldHVybiB0eXBlb2YgbyA9PT0gJ3N0cmluZycgJiYgci50ZXN0KG8pIH1cbn1cbi8vIFRyeSB0byBhcHBseSBhIHByZWZpeCB0byBhIG5hbWVcbmZ1bmN0aW9uIHByZWZpeCAocHJlLCBuYW1lKSB7XG4gIHJldHVybiB0eXBlb2YgcHJlID09PSAnc3RyaW5nJyA/IHByZSArIG5hbWVcbiAgICA6IHR5cGVvZiBwcmUgPT09ICdmdW5jdGlvbicgPyBwcmUobmFtZSlcbiAgICA6IG5hbWVcbn1cblxuLyoqXG4gKiBMb2FkIG9uZSBvciBtb3JlIGF1ZGlvIGZpbGVzXG4gKlxuICpcbiAqIFBvc3NpYmxlIG9wdGlvbiBrZXlzOlxuICpcbiAqIC0gX19mcm9tX18ge0Z1bmN0aW9ufFN0cmluZ306IGEgZnVuY3Rpb24gb3Igc3RyaW5nIHRvIGNvbnZlcnQgZnJvbSBmaWxlIG5hbWVzIHRvIHVybHMuXG4gKiBJZiBpcyBhIHN0cmluZyBpdCB3aWxsIGJlIHByZWZpeGVkIHRvIHRoZSBuYW1lOlxuICogYGxvYWQoYWMsICdzbmFyZS5tcDMnLCB7IGZyb206ICdodHRwOi8vYXVkaW8ubmV0L3NhbXBsZXMvJyB9KWBcbiAqIElmIGl0J3MgYSBmdW5jdGlvbiBpdCByZWNlaXZlcyB0aGUgZmlsZSBuYW1lIGFuZCBzaG91bGQgcmV0dXJuIHRoZSB1cmwgYXMgc3RyaW5nLlxuICogLSBfX29ubHlfXyB7QXJyYXl9IC0gd2hlbiBsb2FkaW5nIG9iamVjdHMsIGlmIHByb3ZpZGVkLCBvbmx5IHRoZSBnaXZlbiBrZXlzXG4gKiB3aWxsIGJlIGluY2x1ZGVkIGluIHRoZSBkZWNvZGVkIG9iamVjdDpcbiAqIGBsb2FkKGFjLCAncGlhbm8uanNvbicsIHsgb25seTogWydDMicsICdEMiddIH0pYFxuICpcbiAqIEBwYXJhbSB7QXVkaW9Db250ZXh0fSBhYyAtIHRoZSBhdWRpbyBjb250ZXh0XG4gKiBAcGFyYW0ge09iamVjdH0gc291cmNlIC0gdGhlIG9iamVjdCB0byBiZSBsb2FkZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gKE9wdGlvbmFsKSB0aGUgbG9hZCBvcHRpb25zIGZvciB0aGF0IG9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IGRlZmF1bHRWYWx1ZSAtIChPcHRpb25hbCkgdGhlIGRlZmF1bHQgdmFsdWUgdG8gcmV0dXJuIGFzXG4gKiBpbiBhIHByb21pc2UgaWYgbm90IHZhbGlkIGxvYWRlciBmb3VuZFxuICovXG5mdW5jdGlvbiBsb2FkIChhYywgc291cmNlLCBvcHRpb25zLCBkZWZWYWwpIHtcbiAgdmFyIGxvYWRlciA9XG4gICAgLy8gQmFzaWMgYXVkaW8gbG9hZGluZ1xuICAgICAgaXNBcnJheUJ1ZmZlcihzb3VyY2UpID8gbG9hZEFycmF5QnVmZmVyXG4gICAgOiBpc0F1ZGlvRmlsZU5hbWUoc291cmNlKSA/IGxvYWRBdWRpb0ZpbGVcbiAgICA6IGlzUHJvbWlzZShzb3VyY2UpID8gbG9hZFByb21pc2VcbiAgICAvLyBDb21wb3VuZCBvYmplY3RzXG4gICAgOiBpc0FycmF5KHNvdXJjZSkgPyBsb2FkQXJyYXlEYXRhXG4gICAgOiBpc09iamVjdChzb3VyY2UpID8gbG9hZE9iamVjdERhdGFcbiAgICA6IGlzSnNvbkZpbGVOYW1lKHNvdXJjZSkgPyBsb2FkSnNvbkZpbGVcbiAgICAvLyBCYXNlNjQgZW5jb2RlZCBhdWRpb1xuICAgIDogaXNCYXNlNjRBdWRpbyhzb3VyY2UpID8gbG9hZEJhc2U2NEF1ZGlvXG4gICAgOiBpc0pzRmlsZU5hbWUoc291cmNlKSA/IGxvYWRNaWRpSlNGaWxlXG4gICAgOiBudWxsXG5cbiAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9XG4gIHJldHVybiBsb2FkZXIgPyBsb2FkZXIoYWMsIHNvdXJjZSwgb3B0cylcbiAgICA6IGRlZlZhbCA/IFByb21pc2UucmVzb2x2ZShkZWZWYWwpXG4gICAgOiBQcm9taXNlLnJlamVjdCgnU291cmNlIG5vdCB2YWxpZCAoJyArIHNvdXJjZSArICcpJylcbn1cbmxvYWQuZmV0Y2ggPSBmZXRjaFxuXG4vLyBCQVNJQyBBVURJTyBMT0FESU5HXG4vLyA9PT09PT09PT09PT09PT09PT09XG5cbi8vIExvYWQgKGRlY29kZSkgYW4gYXJyYXkgYnVmZmVyXG5mdW5jdGlvbiBpc0FycmF5QnVmZmVyIChvKSB7IHJldHVybiBvIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgfVxuZnVuY3Rpb24gbG9hZEFycmF5QnVmZmVyIChhYywgYXJyYXksIG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChkb25lLCByZWplY3QpIHtcbiAgICBhYy5kZWNvZGVBdWRpb0RhdGEoYXJyYXksXG4gICAgICBmdW5jdGlvbiAoYnVmZmVyKSB7IGRvbmUoYnVmZmVyKSB9LFxuICAgICAgZnVuY3Rpb24gKCkgeyByZWplY3QoXCJDYW4ndCBkZWNvZGUgYXVkaW8gZGF0YSAoXCIgKyBhcnJheS5zbGljZSgwLCAzMCkgKyAnLi4uKScpIH1cbiAgICApXG4gIH0pXG59XG5cbi8vIExvYWQgYW4gYXVkaW8gZmlsZW5hbWVcbnZhciBpc0F1ZGlvRmlsZU5hbWUgPSBmcm9tUmVnZXgoL1xcLihtcDN8d2F2fG9nZykoXFw/LiopPyQvaSlcbmZ1bmN0aW9uIGxvYWRBdWRpb0ZpbGUgKGFjLCBuYW1lLCBvcHRpb25zKSB7XG4gIHZhciB1cmwgPSBwcmVmaXgob3B0aW9ucy5mcm9tLCBuYW1lKVxuICByZXR1cm4gbG9hZChhYywgbG9hZC5mZXRjaCh1cmwsICdhcnJheWJ1ZmZlcicpLCBvcHRpb25zKVxufVxuXG4vLyBMb2FkIHRoZSByZXN1bHQgb2YgYSBwcm9taXNlXG5mdW5jdGlvbiBpc1Byb21pc2UgKG8pIHsgcmV0dXJuIG8gJiYgdHlwZW9mIG8udGhlbiA9PT0gJ2Z1bmN0aW9uJyB9XG5mdW5jdGlvbiBsb2FkUHJvbWlzZSAoYWMsIHByb21pc2UsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIHByb21pc2UudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gbG9hZChhYywgdmFsdWUsIG9wdGlvbnMpXG4gIH0pXG59XG5cbi8vIENPTVBPVU5EIE9CSkVDVFNcbi8vID09PT09PT09PT09PT09PT1cblxuLy8gVHJ5IHRvIGxvYWQgYWxsIHRoZSBpdGVtcyBvZiBhbiBhcnJheVxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5XG5mdW5jdGlvbiBsb2FkQXJyYXlEYXRhIChhYywgYXJyYXksIG9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UuYWxsKGFycmF5Lm1hcChmdW5jdGlvbiAoZGF0YSkge1xuICAgIHJldHVybiBsb2FkKGFjLCBkYXRhLCBvcHRpb25zLCBkYXRhKVxuICB9KSlcbn1cblxuLy8gVHJ5IHRvIGxvYWQgYWxsIHRoZSB2YWx1ZXMgb2YgYSBrZXkvdmFsdWUgb2JqZWN0XG5mdW5jdGlvbiBpc09iamVjdCAobykgeyByZXR1cm4gbyAmJiB0eXBlb2YgbyA9PT0gJ29iamVjdCcgfVxuZnVuY3Rpb24gbG9hZE9iamVjdERhdGEgKGFjLCBvYmosIG9wdGlvbnMpIHtcbiAgdmFyIGRlc3QgPSB7fVxuICB2YXIgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKG9wdGlvbnMub25seSAmJiBvcHRpb25zLm9ubHkuaW5kZXhPZihrZXkpID09PSAtMSkgcmV0dXJuIG51bGxcbiAgICB2YXIgdmFsdWUgPSBvYmpba2V5XVxuICAgIHJldHVybiBsb2FkKGFjLCB2YWx1ZSwgb3B0aW9ucywgdmFsdWUpLnRoZW4oZnVuY3Rpb24gKGF1ZGlvKSB7XG4gICAgICBkZXN0W2tleV0gPSBhdWRpb1xuICAgIH0pXG4gIH0pXG4gIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbiAoKSB7IHJldHVybiBkZXN0IH0pXG59XG5cbi8vIExvYWQgdGhlIGNvbnRlbnQgb2YgYSBKU09OIGZpbGVcbnZhciBpc0pzb25GaWxlTmFtZSA9IGZyb21SZWdleCgvXFwuanNvbihcXD8uKik/JC9pKVxuZnVuY3Rpb24gbG9hZEpzb25GaWxlIChhYywgbmFtZSwgb3B0aW9ucykge1xuICB2YXIgdXJsID0gcHJlZml4KG9wdGlvbnMuZnJvbSwgbmFtZSlcbiAgcmV0dXJuIGxvYWQoYWMsIGxvYWQuZmV0Y2godXJsLCAndGV4dCcpLnRoZW4oSlNPTi5wYXJzZSksIG9wdGlvbnMpXG59XG5cbi8vIEJBU0U2NCBFTkNPREVEIEZPUk1BVFNcbi8vID09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gTG9hZCBzdHJpbmdzIHdpdGggQmFzZTY0IGVuY29kZWQgYXVkaW9cbnZhciBpc0Jhc2U2NEF1ZGlvID0gZnJvbVJlZ2V4KC9eZGF0YTphdWRpby8pXG5mdW5jdGlvbiBsb2FkQmFzZTY0QXVkaW8gKGFjLCBzb3VyY2UsIG9wdGlvbnMpIHtcbiAgdmFyIGkgPSBzb3VyY2UuaW5kZXhPZignLCcpXG4gIHJldHVybiBsb2FkKGFjLCBiYXNlNjQuZGVjb2RlKHNvdXJjZS5zbGljZShpICsgMSkpLmJ1ZmZlciwgb3B0aW9ucylcbn1cblxuLy8gTG9hZCAuanMgZmlsZXMgd2l0aCBNaWRpSlMgc291bmRmb250IHByZXJlbmRlcmVkIGF1ZGlvXG52YXIgaXNKc0ZpbGVOYW1lID0gZnJvbVJlZ2V4KC9cXC5qcyhcXD8uKik/JC9pKVxuZnVuY3Rpb24gbG9hZE1pZGlKU0ZpbGUgKGFjLCBuYW1lLCBvcHRpb25zKSB7XG4gIHZhciB1cmwgPSBwcmVmaXgob3B0aW9ucy5mcm9tLCBuYW1lKVxuICByZXR1cm4gbG9hZChhYywgbG9hZC5mZXRjaCh1cmwsICd0ZXh0JykudGhlbihtaWRpSnNUb0pzb24pLCBvcHRpb25zKVxufVxuXG4vLyBjb252ZXJ0IGEgTUlESS5qcyBqYXZhc2NyaXB0IHNvdW5kZm9udCBmaWxlIHRvIGpzb25cbmZ1bmN0aW9uIG1pZGlKc1RvSnNvbiAoZGF0YSkge1xuICB2YXIgYmVnaW4gPSBkYXRhLmluZGV4T2YoJ01JREkuU291bmRmb250LicpXG4gIGlmIChiZWdpbiA8IDApIHRocm93IEVycm9yKCdJbnZhbGlkIE1JREkuanMgU291bmRmb250IGZvcm1hdCcpXG4gIGJlZ2luID0gZGF0YS5pbmRleE9mKCc9JywgYmVnaW4pICsgMlxuICB2YXIgZW5kID0gZGF0YS5sYXN0SW5kZXhPZignLCcpXG4gIHJldHVybiBKU09OLnBhcnNlKGRhdGEuc2xpY2UoYmVnaW4sIGVuZCkgKyAnfScpXG59XG5cbi8vaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSBtb2R1bGUuZXhwb3J0cyA9IGxvYWRcbi8vaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB3aW5kb3cubG9hZEF1ZGlvID0gbG9hZFxubW9kdWxlLmV4cG9ydHMubG9hZCA9IGxvYWRcblxuIiwiLyoqXG4gKiBDb25zdGFudHMgdXNlZCBpbiBwbGF5ZXIuXG4gKi9cbnZhciBDb25zdGFudHMgPSB7XG5cdFZFUlNJT046ICcyLjAuNCcsXG5cdE5PVEVTOiBbXSxcblx0Q0lSQ0xFX09GX0ZPVVJUSFM6IFsnQycsICdGJywgJ0JiJywgJ0ViJywgJ0FiJywgJ0RiJywgJ0diJywgJ0NiJywgJ0ZiJywgJ0JiYicsICdFYmInLCAnQWJiJ10sXG5cdENJUkNMRV9PRl9GSUZUSFM6IFsnQycsICdHJywgJ0QnLCAnQScsICdFJywgJ0InLCAnRiMnLCAnQyMnLCAnRyMnLCAnRCMnLCAnQSMnLCAnRSMnXVxufTtcblxuLy8gQnVpbGRzIG5vdGVzIG9iamVjdCBmb3IgcmVmZXJlbmNlIGFnYWluc3QgYmluYXJ5IHZhbHVlcy5cbnZhciBhbGxOb3RlcyA9IFtbJ0MnXSwgWydDIycsJ0RiJ10sIFsnRCddLCBbJ0QjJywnRWInXSwgWydFJ10sWydGJ10sIFsnRiMnLCdHYiddLCBbJ0cnXSwgWydHIycsJ0FiJ10sIFsnQSddLCBbJ0EjJywnQmInXSwgWydCJ11dO1xudmFyIGNvdW50ZXIgPSAwO1xuXG4vLyBBbGwgYXZhaWxhYmxlIG9jdGF2ZXMuXG5mb3IgKGxldCBpID0gLTE7IGkgPD0gOTsgaSsrKSB7XG5cdGFsbE5vdGVzLmZvckVhY2gobm90ZUdyb3VwID0+IHtcblx0XHRub3RlR3JvdXAuZm9yRWFjaChub3RlID0+IENvbnN0YW50cy5OT1RFU1tjb3VudGVyXSA9IG5vdGUgKyBpKTtcblx0XHRjb3VudGVyICsrO1xuXHR9KTtcbn1cblxuZXhwb3J0cy5Db25zdGFudHMgPSBDb25zdGFudHM7IiwiY29uc3QgUGxheWVyID0gcmVxdWlyZSgnLi9wbGF5ZXInKTtcbmNvbnN0IFNvdW5kZm9udCA9IHJlcXVpcmUoJy4vc291bmRmb250LXBsYXllci9pbmRleCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5jb25zdCBDb25zdGFudHMgPSByZXF1aXJlKCcuL2NvbnN0YW50cycpO1xuY29uc3QgbG9hZCA9IHJlcXVpcmUoJy4vYXVkaW8tbG9hZGVyL2luZGV4Jyk7XG5jb25zdCBTYW1wbGVQbGF5ZXIgPSByZXF1aXJlKCcuL3NhbXBsZS1wbGF5ZXIvaW5kZXgnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGxheWVyOiBQbGF5ZXIuUGxheWVyLFxuICAgIFNvdW5kZm9udDogU291bmRmb250LlNvdW5kZm9udCxcbiAgICBVdGlsczogVXRpbHMuVXRpbHMsXG4gICAgQ29uc3RhbnRzOiBDb25zdGFudHMuQ29uc3RhbnRzLFxuICAgIGxvYWQ6IGxvYWQubG9hZCxcbiAgICBTYW1wbGVQbGF5ZXI6IFNhbXBsZVBsYXllci5TYW1wbGVQbGF5ZXIsXG59XG5cbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IHt9XG5cbi8vIHV0aWxcbmNvbnN0IGZpbGxTdHIgPSAocywgbnVtKSA9PiBBcnJheShudW0gKyAxKS5qb2luKHMpXG5jb25zdCBpc051bSA9IHggPT4gdHlwZW9mIHggPT09ICdudW1iZXInXG5jb25zdCBpc1N0ciA9IHggPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnXG5jb25zdCBpc0RlZiA9IHggPT4gdHlwZW9mIHggIT09ICd1bmRlZmluZWQnXG5jb25zdCBtaWRpVG9GcmVxID0gKG1pZGksIHR1bmluZykgPT4gTWF0aC5wb3coMiwgKG1pZGkgLSA2OSkgLyAxMikgKiAodHVuaW5nIHx8IDQ0MClcblxuY29uc3QgUkVHRVggPSAvXihbYS1nQS1HXSkoI3sxLH18YnsxLH18eHsxLH18KSgtP1xcZCopXFxzKiguKilcXHMqJC9cbi8qKlxuICogQSByZWdleCBmb3IgbWF0Y2hpbmcgbm90ZSBzdHJpbmdzIGluIHNjaWVudGlmaWMgbm90YXRpb24uXG4gKlxuICogQG5hbWUgcmVnZXhcbiAqIEBmdW5jdGlvblxuICogQHJldHVybiB7UmVnRXhwfSB0aGUgcmVnZXhwIHVzZWQgdG8gcGFyc2UgdGhlIG5vdGUgbmFtZVxuICpcbiAqIFRoZSBub3RlIHN0cmluZyBzaG91bGQgaGF2ZSB0aGUgZm9ybSBgbGV0dGVyW2FjY2lkZW50YWxzXVtvY3RhdmVdW2VsZW1lbnRdYFxuICogd2hlcmU6XG4gKlxuICogLSBsZXR0ZXI6IChSZXF1aXJlZCkgaXMgYSBsZXR0ZXIgZnJvbSBBIHRvIEcgZWl0aGVyIHVwcGVyIG9yIGxvd2VyIGNhc2VcbiAqIC0gYWNjaWRlbnRhbHM6IChPcHRpb25hbCkgY2FuIGJlIG9uZSBvciBtb3JlIGBiYCAoZmxhdHMpLCBgI2AgKHNoYXJwcykgb3IgYHhgIChkb3VibGUgc2hhcnBzKS5cbiAqIFRoZXkgY2FuIE5PVCBiZSBtaXhlZC5cbiAqIC0gb2N0YXZlOiAoT3B0aW9uYWwpIGEgcG9zaXRpdmUgb3IgbmVnYXRpdmUgaW50ZWdlclxuICogLSBlbGVtZW50OiAoT3B0aW9uYWwpIGFkZGl0aW9uYWxseSBhbnl0aGluZyBhZnRlciB0aGUgZHVyYXRpb24gaXMgY29uc2lkZXJlZCB0b1xuICogYmUgdGhlIGVsZW1lbnQgbmFtZSAoZm9yIGV4YW1wbGU6ICdDMiBkb3JpYW4nKVxuICpcbiAqIFRoZSBleGVjdXRlZCByZWdleCBjb250YWlucyAoYnkgYXJyYXkgaW5kZXgpOlxuICpcbiAqIC0gMDogdGhlIGNvbXBsZXRlIHN0cmluZ1xuICogLSAxOiB0aGUgbm90ZSBsZXR0ZXJcbiAqIC0gMjogdGhlIG9wdGlvbmFsIGFjY2lkZW50YWxzXG4gKiAtIDM6IHRoZSBvcHRpb25hbCBvY3RhdmVcbiAqIC0gNDogdGhlIHJlc3Qgb2YgdGhlIHN0cmluZyAodHJpbW1lZClcbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIHBhcnNlciA9IHJlcXVpcmUoJ25vdGUtcGFyc2VyJylcbiAqIHBhcnNlci5yZWdleC5leGVjKCdjIzQnKVxuICogLy8gPT4gWydjIzQnLCAnYycsICcjJywgJzQnLCAnJ11cbiAqIHBhcnNlci5yZWdleC5leGVjKCdjIzQgbWFqb3InKVxuICogLy8gPT4gWydjIzRtYWpvcicsICdjJywgJyMnLCAnNCcsICdtYWpvciddXG4gKiBwYXJzZXIucmVnZXgoKS5leGVjKCdDTWFqNycpXG4gKiAvLyA9PiBbJ0NNYWo3JywgJ0MnLCAnJywgJycsICdNYWo3J11cbiAqL1xubW9kdWxlLmV4cG9ydHMucmVnZXggPSAoKSA9PiBSRUdFWDtcblxuY29uc3QgU0VNSVRPTkVTID0gWzAsIDIsIDQsIDUsIDcsIDksIDExXVxuLyoqXG4gKiBQYXJzZSBhIG5vdGUgbmFtZSBpbiBzY2llbnRpZmljIG5vdGF0aW9uIGFuIHJldHVybiBpdCdzIGNvbXBvbmVudHMsXG4gKiBhbmQgc29tZSBudW1lcmljIHByb3BlcnRpZXMgaW5jbHVkaW5nIG1pZGkgbnVtYmVyIGFuZCBmcmVxdWVuY3kuXG4gKlxuICogQG5hbWUgcGFyc2VcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmd9IG5vdGUgLSB0aGUgbm90ZSBzdHJpbmcgdG8gYmUgcGFyc2VkXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzVG9uaWMgLSB0cnVlIHRoZSBzdHJpbmdzIGl0J3Mgc3VwcG9zZWQgdG8gY29udGFpbiBhIG5vdGUgbnVtYmVyXG4gKiBhbmQgc29tZSBjYXRlZ29yeSAoZm9yIGV4YW1wbGUgYW4gc2NhbGU6ICdDIyBtYWpvcicpLiBJdCdzIGZhbHNlIGJ5IGRlZmF1bHQsXG4gKiBidXQgd2hlbiB0cnVlLCBlbiBleHRyYSB0b25pY09mIHByb3BlcnR5IGlzIHJldHVybmVkIHdpdGggdGhlIGNhdGVnb3J5ICgnbWFqb3InKVxuICogQHBhcmFtIHtGbG9hdH0gdHVubmluZyAtIFRoZSBmcmVxdWVuY3kgb2YgQTQgbm90ZSB0byBjYWxjdWxhdGUgZnJlcXVlbmNpZXMuXG4gKiBCeSBkZWZhdWx0IGl0IDQ0MC5cbiAqIEByZXR1cm4ge09iamVjdH0gdGhlIHBhcnNlZCBub3RlIG5hbWUgb3IgbnVsbCBpZiBub3QgYSB2YWxpZCBub3RlXG4gKlxuICogVGhlIHBhcnNlZCBub3RlIG5hbWUgb2JqZWN0IHdpbGwgQUxXQVlTIGNvbnRhaW5zOlxuICogLSBsZXR0ZXI6IHRoZSB1cHBlcmNhc2UgbGV0dGVyIG9mIHRoZSBub3RlXG4gKiAtIGFjYzogdGhlIGFjY2lkZW50YWxzIG9mIHRoZSBub3RlIChvbmx5IHNoYXJwcyBvciBmbGF0cylcbiAqIC0gcGM6IHRoZSBwaXRjaCBjbGFzcyAobGV0dGVyICsgYWNjKVxuICogLSBzdGVwOiBzIGEgbnVtZXJpYyByZXByZXNlbnRhdGlvbiBvZiB0aGUgbGV0dGVyLiBJdCdzIGFuIGludGVnZXIgZnJvbSAwIHRvIDZcbiAqIHdoZXJlIDAgPSBDLCAxID0gRCAuLi4gNiA9IEJcbiAqIC0gYWx0OiBhIG51bWVyaWMgcmVwcmVzZW50YXRpb24gb2YgdGhlIGFjY2lkZW50YWxzLiAwIG1lYW5zIG5vIGFsdGVyYXRpb24sXG4gKiBwb3NpdGl2ZSBudW1iZXJzIGFyZSBmb3Igc2hhcnBzIGFuZCBuZWdhdGl2ZSBmb3IgZmxhdHNcbiAqIC0gY2hyb21hOiBhIG51bWVyaWMgcmVwcmVzZW50YXRpb24gb2YgdGhlIHBpdGNoIGNsYXNzLiBJdCdzIGxpa2UgbWlkaSBmb3JcbiAqIHBpdGNoIGNsYXNzZXMuIDAgPSBDLCAxID0gQyMsIDIgPSBEIC4uLiAxMSA9IEIuIENhbiBiZSB1c2VkIHRvIGZpbmQgZW5oYXJtb25pY3NcbiAqIHNpbmNlLCBmb3IgZXhhbXBsZSwgY2hyb21hIG9mICdDYicgYW5kICdCJyBhcmUgYm90aCAxMVxuICpcbiAqIElmIHRoZSBub3RlIGhhcyBvY3RhdmUsIHRoZSBwYXJzZXIgb2JqZWN0IHdpbGwgY29udGFpbjpcbiAqIC0gb2N0OiB0aGUgb2N0YXZlIG51bWJlciAoYXMgaW50ZWdlcilcbiAqIC0gbWlkaTogdGhlIG1pZGkgbnVtYmVyXG4gKiAtIGZyZXE6IHRoZSBmcmVxdWVuY3kgKHVzaW5nIHR1bmluZyBwYXJhbWV0ZXIgYXMgYmFzZSlcbiAqXG4gKiBJZiB0aGUgcGFyYW1ldGVyIGBpc1RvbmljYCBpcyBzZXQgdG8gdHJ1ZSwgdGhlIHBhcnNlZCBvYmplY3Qgd2lsbCBjb250YWluOlxuICogLSB0b25pY09mOiB0aGUgcmVzdCBvZiB0aGUgc3RyaW5nIHRoYXQgZm9sbG93cyBub3RlIG5hbWUgKGxlZnQgYW5kIHJpZ2h0IHRyaW1tZWQpXG4gKlxuICogQGV4YW1wbGVcbiAqIHZhciBwYXJzZSA9IHJlcXVpcmUoJ25vdGUtcGFyc2VyJykucGFyc2VcbiAqIHBhcnNlKCdDYjQnKVxuICogLy8gPT4geyBsZXR0ZXI6ICdDJywgYWNjOiAnYicsIHBjOiAnQ2InLCBzdGVwOiAwLCBhbHQ6IC0xLCBjaHJvbWE6IC0xLFxuICogICAgICAgICBvY3Q6IDQsIG1pZGk6IDU5LCBmcmVxOiAyNDYuOTQxNjUwNjI4MDYyMDYgfVxuICogLy8gaWYgbm8gb2N0YXZlLCBubyBtaWRpLCBubyBmcmVxXG4gKiBwYXJzZSgnZngnKVxuICogLy8gPT4geyBsZXR0ZXI6ICdGJywgYWNjOiAnIyMnLCBwYzogJ0YjIycsIHN0ZXA6IDMsIGFsdDogMiwgY2hyb21hOiA3IH0pXG4gKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlID0gKHN0ciwgaXNUb25pYywgdHVuaW5nKSA9PiB7XG4gIGlmICh0eXBlb2Ygc3RyICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcbiAgY29uc3QgbSA9IFJFR0VYLmV4ZWMoc3RyKVxuICBpZiAoIW0gfHwgKCFpc1RvbmljICYmIG1bNF0pKSByZXR1cm4gbnVsbFxuXG4gIGNvbnN0IHAgPSB7IGxldHRlcjogbVsxXS50b1VwcGVyQ2FzZSgpLCBhY2M6IG1bMl0ucmVwbGFjZSgveC9nLCAnIyMnKSB9XG4gIHAucGMgPSBwLmxldHRlciArIHAuYWNjXG4gIHAuc3RlcCA9IChwLmxldHRlci5jaGFyQ29kZUF0KDApICsgMykgJSA3XG4gIHAuYWx0ID0gcC5hY2NbMF0gPT09ICdiJyA/IC1wLmFjYy5sZW5ndGggOiBwLmFjYy5sZW5ndGhcbiAgY29uc3QgcG9zID0gU0VNSVRPTkVTW3Auc3RlcF0gKyBwLmFsdFxuICBwLmNocm9tYSA9IHBvcyA8IDAgPyAxMiArIHBvcyA6IHBvcyAlIDEyXG4gIGlmIChtWzNdKSB7IC8vIGhhcyBvY3RhdmVcbiAgICBwLm9jdCA9ICttWzNdXG4gICAgcC5taWRpID0gcG9zICsgMTIgKiAocC5vY3QgKyAxKVxuICAgIHAuZnJlcSA9IG1pZGlUb0ZyZXEocC5taWRpLCB0dW5pbmcpXG4gIH1cbiAgaWYgKGlzVG9uaWMpIHAudG9uaWNPZiA9IG1bNF1cbiAgcmV0dXJuIHBcbn1cblxuY29uc3QgTEVUVEVSUyA9ICdDREVGR0FCJ1xuY29uc3QgYWNjU3RyID0gbiA9PiAhaXNOdW0obikgPyAnJyA6IG4gPCAwID8gZmlsbFN0cignYicsIC1uKSA6IGZpbGxTdHIoJyMnLCBuKVxuY29uc3Qgb2N0U3RyID0gbiA9PiAhaXNOdW0obikgPyAnJyA6ICcnICsgblxuXG4vKipcbiAqIENyZWF0ZSBhIHN0cmluZyBmcm9tIGEgcGFyc2VkIG9iamVjdCBvciBgc3RlcCwgYWx0ZXJhdGlvbiwgb2N0YXZlYCBwYXJhbWV0ZXJzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIC0gdGhlIHBhcnNlZCBkYXRhIG9iamVjdFxuICogQHJldHVybiB7U3RyaW5nfSBhIG5vdGUgc3RyaW5nIG9yIG51bGwgaWYgbm90IHZhbGlkIHBhcmFtZXRlcnNcbiAqIEBzaW5jZSAxLjJcbiAqIEBleGFtcGxlXG4gKiBwYXJzZXIuYnVpbGQocGFyc2VyLnBhcnNlKCdjYjInKSkgLy8gPT4gJ0NiMidcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gaXQgYWNjZXB0cyAoc3RlcCwgYWx0ZXJhdGlvbiwgb2N0YXZlKSBwYXJhbWV0ZXJzOlxuICogcGFyc2VyLmJ1aWxkKDMpIC8vID0+ICdGJ1xuICogcGFyc2VyLmJ1aWxkKDMsIC0xKSAvLyA9PiAnRmInXG4gKiBwYXJzZXIuYnVpbGQoMywgLTEsIDQpIC8vID0+ICdGYjQnXG4gKi9cbm1vZHVsZS5leHBvcnRzLmJ1aWxkID0gKHMsIGEsIG8pID0+IHtcbiAgaWYgKHMgPT09IG51bGwgfHwgdHlwZW9mIHMgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gbnVsbFxuICBpZiAocy5zdGVwKSByZXR1cm4gYnVpbGQocy5zdGVwLCBzLmFsdCwgcy5vY3QpXG4gIGlmIChzIDwgMCB8fCBzID4gNikgcmV0dXJuIG51bGxcbiAgcmV0dXJuIExFVFRFUlMuY2hhckF0KHMpICsgYWNjU3RyKGEpICsgb2N0U3RyKG8pXG59XG5cbi8qKlxuICogR2V0IG1pZGkgb2YgYSBub3RlXG4gKlxuICogQG5hbWUgbWlkaVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ3xJbnRlZ2VyfSBub3RlIC0gdGhlIG5vdGUgbmFtZSBvciBtaWRpIG51bWJlclxuICogQHJldHVybiB7SW50ZWdlcn0gdGhlIG1pZGkgbnVtYmVyIG9mIHRoZSBub3RlIG9yIG51bGwgaWYgbm90IGEgdmFsaWQgbm90ZVxuICogb3IgdGhlIG5vdGUgZG9lcyBOT1QgY29udGFpbnMgb2N0YXZlXG4gKiBAZXhhbXBsZVxuICogdmFyIHBhcnNlciA9IHJlcXVpcmUoJ25vdGUtcGFyc2VyJylcbiAqIHBhcnNlci5taWRpKCdBNCcpIC8vID0+IDY5XG4gKiBwYXJzZXIubWlkaSgnQScpIC8vID0+IG51bGxcbiAqIEBleGFtcGxlXG4gKiAvLyBtaWRpIG51bWJlcnMgYXJlIGJ5cGFzc2VkIChldmVuIGFzIHN0cmluZ3MpXG4gKiBwYXJzZXIubWlkaSg2MCkgLy8gPT4gNjBcbiAqIHBhcnNlci5taWRpKCc2MCcpIC8vID0+IDYwXG4gKi9cbm1vZHVsZS5leHBvcnRzLm1pZGkgPSBub3RlID0+IHtcbiAgaWYgKChpc051bShub3RlKSB8fCBpc1N0cihub3RlKSkgJiYgbm90ZSA+PSAwICYmIG5vdGUgPCAxMjgpIHJldHVybiArbm90ZVxuICBjb25zdCBwID0gcGFyc2Uobm90ZSlcbiAgcmV0dXJuIHAgJiYgaXNEZWYocC5taWRpKSA/IHAubWlkaSA6IG51bGxcbn1cblxuLyoqXG4gKiBHZXQgZnJlcSBvZiBhIG5vdGUgaW4gaGVydHpzIChpbiBhIHdlbGwgdGVtcGVyZWQgNDQwSHogQTQpXG4gKlxuICogQG5hbWUgZnJlcVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gbm90ZSAtIHRoZSBub3RlIG5hbWUgb3Igbm90ZSBtaWRpIG51bWJlclxuICogQHBhcmFtIHtTdHJpbmd9IHR1bmluZyAtIChPcHRpb25hbCkgdGhlIEE0IGZyZXF1ZW5jeSAoNDQwIGJ5IGRlZmF1bHQpXG4gKiBAcmV0dXJuIHtGbG9hdH0gdGhlIGZyZXEgb2YgdGhlIG51bWJlciBpZiBoZXJ0enMgb3IgbnVsbCBpZiBub3QgdmFsaWQgbm90ZVxuICogQGV4YW1wbGVcbiAqIHZhciBwYXJzZXIgPSByZXF1aXJlKCdub3RlLXBhcnNlcicpXG4gKiBwYXJzZXIuZnJlcSgnQTQnKSAvLyA9PiA0NDBcbiAqIHBhcnNlci5mcmVxKCdBJykgLy8gPT4gbnVsbFxuICogQGV4YW1wbGVcbiAqIC8vIGNhbiBjaGFuZ2UgdHVuaW5nICg0NDAgYnkgZGVmYXVsdClcbiAqIHBhcnNlci5mcmVxKCdBNCcsIDQ0NCkgLy8gPT4gNDQ0XG4gKiBwYXJzZXIuZnJlcSgnQTMnLCA0NDQpIC8vID0+IDIyMlxuICogQGV4YW1wbGVcbiAqIC8vIGl0IGFjY2VwdHMgbWlkaSBudW1iZXJzIChhcyBudW1iZXJzIGFuZCBhcyBzdHJpbmdzKVxuICogcGFyc2VyLmZyZXEoNjkpIC8vID0+IDQ0MFxuICogcGFyc2VyLmZyZXEoJzY5JywgNDQyKSAvLyA9PiA0NDJcbiAqL1xubW9kdWxlLmV4cG9ydHMuZnJlcSA9IChub3RlLCB0dW5pbmcpID0+IHtcbiAgY29uc3QgbSA9IG1pZGkobm90ZSlcbiAgcmV0dXJuIG0gPT09IG51bGwgPyBudWxsIDogbWlkaVRvRnJlcShtLCB0dW5pbmcpXG59XG5cbm1vZHVsZS5leHBvcnRzLmxldHRlciA9IHNyYyA9PiAocGFyc2Uoc3JjKSB8fCB7fSkubGV0dGVyXG5tb2R1bGUuZXhwb3J0cy5hY2MgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLmFjY1xubW9kdWxlLmV4cG9ydHMucGMgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLnBjXG5tb2R1bGUuZXhwb3J0cy5zdGVwID0gc3JjID0+IChwYXJzZShzcmMpIHx8IHt9KS5zdGVwXG5tb2R1bGUuZXhwb3J0cy5hbHQgPSBzcmMgPT4gKHBhcnNlKHNyYykgfHwge30pLmFsdFxubW9kdWxlLmV4cG9ydHMuY2hyb21hID0gc3JjID0+IChwYXJzZShzcmMpIHx8IHt9KS5jaHJvbWFcbm1vZHVsZS5leHBvcnRzLm9jdCA9IHNyYyA9PiAocGFyc2Uoc3JjKSB8fCB7fSkub2N0XG4iLCJjb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKS5VdGlscztcbmNvbnN0IFRyYWNrID0gcmVxdWlyZSgnLi90cmFjaycpLlRyYWNrO1xuXG4vLyBQb2x5ZmlsbCBVaW50OEFycmF5LmZvckVhY2g6IERvZXNuJ3QgZXhpc3Qgb24gU2FmYXJpIDwxMFxuaWYgKCFVaW50OEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShVaW50OEFycmF5LnByb3RvdHlwZSwgJ2ZvckVhY2gnLCB7XG5cdFx0dmFsdWU6IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoXG5cdH0pO1xufVxuXG4vKipcbiAqIE1haW4gcGxheWVyIGNsYXNzLiAgQ29udGFpbnMgbWV0aG9kcyB0byBsb2FkIGZpbGVzLCBzdGFydCwgc3RvcC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IC0gQ2FsbGJhY2sgdG8gZmlyZSBmb3IgZWFjaCBNSURJIGV2ZW50LiAgQ2FuIGFsc28gYmUgYWRkZWQgd2l0aCBvbignbWlkaUV2ZW50JywgZm4pXG4gKiBAcGFyYW0ge2FycmF5fSAtIEFycmF5IGJ1ZmZlciBvZiBNSURJIGZpbGUgKG9wdGlvbmFsKS5cbiAqL1xuY2xhc3MgUGxheWVyIHtcblx0Y29uc3RydWN0b3IoZXZlbnRIYW5kbGVyLCBidWZmZXIpIHtcblx0XHR0aGlzLnNhbXBsZVJhdGUgPSA1OyAvLyBtaWxsaXNlY29uZHNcblx0XHR0aGlzLnN0YXJ0VGltZSA9IDA7XG5cdFx0dGhpcy5idWZmZXIgPSBidWZmZXIgfHwgbnVsbDtcblx0XHR0aGlzLmRpdmlzaW9uO1xuXHRcdHRoaXMuZm9ybWF0O1xuXHRcdHRoaXMuc2V0SW50ZXJ2YWxJZCA9IGZhbHNlO1xuXHRcdHRoaXMudHJhY2tzID0gW107XG5cdFx0dGhpcy5pbnN0cnVtZW50cyA9IFtdO1xuXHRcdHRoaXMuZGVmYXVsdFRlbXBvID0gMTIwO1xuXHRcdHRoaXMudGVtcG8gPSBudWxsO1xuXHRcdHRoaXMuc3RhcnRUaWNrID0gMDtcblx0XHR0aGlzLnRpY2sgPSAwO1xuXHRcdHRoaXMubGFzdFRpY2sgPSBudWxsO1xuXHRcdHRoaXMuaW5Mb29wID0gZmFsc2U7XG5cdFx0dGhpcy50b3RhbFRpY2tzID0gMDtcblx0XHR0aGlzLmV2ZW50cyA9IFtdO1xuXHRcdHRoaXMudG90YWxFdmVudHMgPSAwO1xuXHRcdHRoaXMuZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuXHRcdGlmICh0eXBlb2YgKGV2ZW50SGFuZGxlcikgPT09ICdmdW5jdGlvbicpIHRoaXMub24oJ21pZGlFdmVudCcsIGV2ZW50SGFuZGxlcik7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZCBhIGZpbGUgaW50byB0aGUgcGxheWVyIChOb2RlLmpzIG9ubHkpLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gcGF0aCAtIFBhdGggb2YgZmlsZS5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0Lypcblx0bG9hZEZpbGUocGF0aCkge1xuXHRcdHZhciBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cdFx0dGhpcy5idWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMocGF0aCk7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUxvYWRlZCgpO1xuXHR9XG5cdCovXG5cblx0LyoqXG5cdCAqIExvYWQgYW4gYXJyYXkgYnVmZmVyIGludG8gdGhlIHBsYXllci5cblx0ICogQHBhcmFtIHthcnJheX0gYXJyYXlCdWZmZXIgLSBBcnJheSBidWZmZXIgb2YgZmlsZSB0byBiZSBsb2FkZWQuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGxvYWRBcnJheUJ1ZmZlcihhcnJheUJ1ZmZlcikge1xuXHRcdHRoaXMuYnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIpO1xuXHRcdHJldHVybiB0aGlzLmZpbGVMb2FkZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2FkIGEgZGF0YSBVUkkgaW50byB0aGUgcGxheWVyLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gZGF0YVVyaSAtIERhdGEgVVJJIHRvIGJlIGxvYWRlZC5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0bG9hZERhdGFVcmkoZGF0YVVyaSkge1xuXHRcdC8vIGNvbnZlcnQgYmFzZTY0IHRvIHJhdyBiaW5hcnkgZGF0YSBoZWxkIGluIGEgc3RyaW5nLlxuXHRcdC8vIGRvZXNuJ3QgaGFuZGxlIFVSTEVuY29kZWQgRGF0YVVSSXMgLSBzZWUgU08gYW5zd2VyICM2ODUwMjc2IGZvciBjb2RlIHRoYXQgZG9lcyB0aGlzXG5cdFx0dmFyIGJ5dGVTdHJpbmcgPSBVdGlscy5hdG9iKGRhdGFVcmkuc3BsaXQoJywnKVsxXSk7XG5cblx0XHQvLyB3cml0ZSB0aGUgYnl0ZXMgb2YgdGhlIHN0cmluZyB0byBhbiBBcnJheUJ1ZmZlclxuXHRcdHZhciBpYSA9IG5ldyBVaW50OEFycmF5KGJ5dGVTdHJpbmcubGVuZ3RoKTtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVTdHJpbmcubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlhW2ldID0gYnl0ZVN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYnVmZmVyID0gaWE7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUxvYWRlZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBmaWxlc2l6ZSBvZiBsb2FkZWQgZmlsZSBpbiBudW1iZXIgb2YgYnl0ZXMuXG5cdCAqIEByZXR1cm4ge251bWJlcn0gLSBUaGUgZmlsZXNpemUuXG5cdCAqL1xuXHRnZXRGaWxlc2l6ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5idWZmZXIgPyB0aGlzLmJ1ZmZlci5sZW5ndGggOiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgZGVmYXVsdCB0ZW1wbywgcGFyc2VzIGZpbGUgZm9yIG5lY2Vzc2FyeSBpbmZvcm1hdGlvbiwgYW5kIGRvZXMgYSBkcnkgcnVuIHRvIGNhbGN1bGF0ZSB0b3RhbCBsZW5ndGguXG5cdCAqIFBvcHVsYXRlcyB0aGlzLmV2ZW50cyAmIHRoaXMudG90YWxUaWNrcy5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0ZmlsZUxvYWRlZCgpIHtcblx0XHRpZiAoIXRoaXMudmFsaWRhdGUoKSkgdGhyb3cgJ0ludmFsaWQgTUlESSBmaWxlOyBzaG91bGQgc3RhcnQgd2l0aCBNVGhkJztcblx0XHRyZXR1cm4gdGhpcy5zZXRUZW1wbyh0aGlzLmRlZmF1bHRUZW1wbykuZ2V0RGl2aXNpb24oKS5nZXRGb3JtYXQoKS5nZXRUcmFja3MoKS5kcnlSdW4oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBWYWxpZGF0ZXMgZmlsZSB1c2luZyBzaW1wbGUgbWVhbnMgLSBmaXJzdCBmb3VyIGJ5dGVzIHNob3VsZCA9PSBNVGhkLlxuXHQgKiBAcmV0dXJuIHtib29sZWFufVxuXHQgKi9cblx0dmFsaWRhdGUoKSB7XG5cdFx0cmV0dXJuIFV0aWxzLmJ5dGVzVG9MZXR0ZXJzKHRoaXMuYnVmZmVyLnN1YmFycmF5KDAsIDQpKSA9PT0gJ01UaGQnO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgTUlESSBmaWxlIGZvcm1hdCBmb3IgbG9hZGVkIGZpbGUuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGdldEZvcm1hdCgpIHtcblx0XHQvKlxuXHRcdE1JREkgZmlsZXMgY29tZSBpbiAzIHZhcmlhdGlvbnM6XG5cdFx0Rm9ybWF0IDAgd2hpY2ggY29udGFpbiBhIHNpbmdsZSB0cmFja1xuXHRcdEZvcm1hdCAxIHdoaWNoIGNvbnRhaW4gb25lIG9yIG1vcmUgc2ltdWx0YW5lb3VzIHRyYWNrc1xuXHRcdChpZSBhbGwgdHJhY2tzIGFyZSB0byBiZSBwbGF5ZWQgc2ltdWx0YW5lb3VzbHkpLlxuXHRcdEZvcm1hdCAyIHdoaWNoIGNvbnRhaW4gb25lIG9yIG1vcmUgaW5kZXBlbmRhbnQgdHJhY2tzXG5cdFx0KGllIGVhY2ggdHJhY2sgaXMgdG8gYmUgcGxheWVkIGluZGVwZW5kYW50bHkgb2YgdGhlIG90aGVycykuXG5cdFx0cmV0dXJuIFV0aWxzLmJ5dGVzVG9OdW1iZXIodGhpcy5idWZmZXIuc3ViYXJyYXkoOCwgMTApKTtcblx0XHQqL1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBVdGlscy5ieXRlc1RvTnVtYmVyKHRoaXMuYnVmZmVyLnN1YmFycmF5KDgsIDEwKSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2VzIG91dCB0cmFja3MsIHBsYWNlcyB0aGVtIGluIHRoaXMudHJhY2tzIGFuZCBpbml0aWFsaXplcyB0aGlzLnBvaW50ZXJzXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGdldFRyYWNrcygpIHtcblx0XHR0aGlzLnRyYWNrcyA9IFtdO1xuXHRcdGxldCB0cmFja09mZnNldCA9IDA7XG5cdFx0d2hpbGUgKHRyYWNrT2Zmc2V0IDwgdGhpcy5idWZmZXIubGVuZ3RoKSB7XG5cdFx0XHRpZiAoVXRpbHMuYnl0ZXNUb0xldHRlcnModGhpcy5idWZmZXIuc3ViYXJyYXkodHJhY2tPZmZzZXQsIHRyYWNrT2Zmc2V0ICsgNCkpID09ICdNVHJrJykge1xuXHRcdFx0XHRsZXQgdHJhY2tMZW5ndGggPSBVdGlscy5ieXRlc1RvTnVtYmVyKHRoaXMuYnVmZmVyLnN1YmFycmF5KHRyYWNrT2Zmc2V0ICsgNCwgdHJhY2tPZmZzZXQgKyA4KSk7XG5cdFx0XHRcdHRoaXMudHJhY2tzLnB1c2gobmV3IFRyYWNrKHRoaXMudHJhY2tzLmxlbmd0aCwgdGhpcy5idWZmZXIuc3ViYXJyYXkodHJhY2tPZmZzZXQgKyA4LCB0cmFja09mZnNldCArIDggKyB0cmFja0xlbmd0aCkpKTtcblx0XHRcdH1cblxuXHRcdFx0dHJhY2tPZmZzZXQgKz0gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmJ1ZmZlci5zdWJhcnJheSh0cmFja09mZnNldCArIDQsIHRyYWNrT2Zmc2V0ICsgOCkpICsgODtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogRW5hYmxlcyBhIHRyYWNrIGZvciBwbGF5aW5nLlxuXHQgKiBAcGFyYW0ge251bWJlcn0gdHJhY2tOdW1iZXIgLSBUcmFjayBudW1iZXJcblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0ZW5hYmxlVHJhY2sodHJhY2tOdW1iZXIpIHtcblx0XHR0aGlzLnRyYWNrc1t0cmFja051bWJlciAtIDFdLmVuYWJsZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc2FibGVzIGEgdHJhY2sgZm9yIHBsYXlpbmcuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFRyYWNrIG51bWJlclxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRkaXNhYmxlVHJhY2sodHJhY2tOdW1iZXIpIHtcblx0XHR0aGlzLnRyYWNrc1t0cmFja051bWJlciAtIDFdLmRpc2FibGUoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHF1YXJ0ZXIgbm90ZSBkaXZpc2lvbiBvZiBsb2FkZWQgTUlESSBmaWxlLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRnZXREaXZpc2lvbigpIHtcblx0XHR0aGlzLmRpdmlzaW9uID0gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmJ1ZmZlci5zdWJhcnJheSgxMiwgMTQpKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBwbGF5IGxvb3AuXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gLSBJbmRpY2F0ZXMgd2hldGhlciBvciBub3QgdGhpcyBpcyBiZWluZyBjYWxsZWQgc2ltcGx5IGZvciBwYXJzaW5nIHB1cnBvc2VzLiAgRGlzcmVnYXJkcyB0aW1pbmcgaWYgc28uXG5cdCAqIEByZXR1cm4ge3VuZGVmaW5lZH1cblx0ICovXG5cdHBsYXlMb29wKGRyeVJ1bikge1xuXHRcdGlmICghdGhpcy5pbkxvb3ApIHtcblx0XHRcdHRoaXMuaW5Mb29wID0gdHJ1ZTtcblx0XHRcdHRoaXMudGljayA9IHRoaXMuZ2V0Q3VycmVudFRpY2soKTtcblxuXHRcdFx0dGhpcy50cmFja3MuZm9yRWFjaChmdW5jdGlvbiAodHJhY2spIHtcblx0XHRcdFx0Ly8gSGFuZGxlIG5leHQgZXZlbnRcblx0XHRcdFx0aWYgKCFkcnlSdW4gJiYgdGhpcy5lbmRPZkZpbGUoKSkge1xuXHRcdFx0XHRcdC8vY29uc29sZS5sb2coJ2VuZCBvZiBmaWxlJylcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXJQbGF5ZXJFdmVudCgnZW5kT2ZGaWxlJyk7XG5cdFx0XHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IGV2ZW50ID0gdHJhY2suaGFuZGxlRXZlbnQodGhpcy50aWNrLCBkcnlSdW4pO1xuXG5cdFx0XHRcdFx0aWYgKGRyeVJ1biAmJiBldmVudCkge1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50Lmhhc093blByb3BlcnR5KCduYW1lJykgJiYgZXZlbnQubmFtZSA9PT0gJ1NldCBUZW1wbycpIHtcblx0XHRcdFx0XHRcdFx0Ly8gR3JhYiB0ZW1wbyBpZiBhdmFpbGFibGUuXG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0VGVtcG8oZXZlbnQuZGF0YSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuaGFzT3duUHJvcGVydHkoJ25hbWUnKSAmJiBldmVudC5uYW1lID09PSAnUHJvZ3JhbSBDaGFuZ2UnKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghdGhpcy5pbnN0cnVtZW50cy5pbmNsdWRlcyhldmVudC52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmluc3RydW1lbnRzLnB1c2goZXZlbnQudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChldmVudCkgdGhpcy5lbWl0RXZlbnQoZXZlbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRpZiAoIWRyeVJ1bikgdGhpcy50cmlnZ2VyUGxheWVyRXZlbnQoJ3BsYXlpbmcnLCB7IHRpY2s6IHRoaXMudGljayB9KTtcblx0XHRcdHRoaXMuaW5Mb29wID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHRlciBmb3IgdGVtcG8uXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFRlbXBvIGluIGJwbSAoZGVmYXVsdHMgdG8gMTIwKVxuXHQgKi9cblx0c2V0VGVtcG8odGVtcG8pIHtcblx0XHR0aGlzLnRlbXBvID0gdGVtcG87XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2V0dGVyIGZvciBzdGFydFRpbWUuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFVUQyB0aW1lc3RhbXBcblx0ICovXG5cdHNldFN0YXJ0VGltZShzdGFydFRpbWUpIHtcblx0XHR0aGlzLnN0YXJ0VGltZSA9IHN0YXJ0VGltZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydCBwbGF5aW5nIGxvYWRlZCBNSURJIGZpbGUgaWYgbm90IGFscmVhZHkgcGxheWluZy5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0cGxheSgpIHtcblx0XHRpZiAodGhpcy5pc1BsYXlpbmcoKSkgdGhyb3cgJ0FscmVhZHkgcGxheWluZy4uLic7XG5cblx0XHQvLyBJbml0aWFsaXplXG5cdFx0aWYgKCF0aGlzLnN0YXJ0VGltZSkgdGhpcy5zdGFydFRpbWUgPSAobmV3IERhdGUoKSkuZ2V0VGltZSgpO1xuXG5cdFx0Ly8gU3RhcnQgcGxheSBsb29wXG5cdFx0Ly93aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMucGxheUxvb3AuYmluZCh0aGlzKSk7XG5cdFx0dGhpcy5zZXRJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwodGhpcy5wbGF5TG9vcC5iaW5kKHRoaXMpLCB0aGlzLnNhbXBsZVJhdGUpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogUGF1c2VzIHBsYXliYWNrIGlmIHBsYXlpbmcuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHBhdXNlKCkge1xuXHRcdGNsZWFySW50ZXJ2YWwodGhpcy5zZXRJbnRlcnZhbElkKTtcblx0XHR0aGlzLnNldEludGVydmFsSWQgPSBmYWxzZTtcblx0XHR0aGlzLnN0YXJ0VGljayA9IHRoaXMudGljaztcblx0XHR0aGlzLnN0YXJ0VGltZSA9IDA7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcHMgcGxheWJhY2sgaWYgcGxheWluZy5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0c3RvcCgpIHtcblx0XHRjbGVhckludGVydmFsKHRoaXMuc2V0SW50ZXJ2YWxJZCk7XG5cdFx0dGhpcy5zZXRJbnRlcnZhbElkID0gZmFsc2U7XG5cdFx0dGhpcy5zdGFydFRpY2sgPSAwO1xuXHRcdHRoaXMuc3RhcnRUaW1lID0gMDtcblx0XHR0aGlzLnJlc2V0VHJhY2tzKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2tpcHMgcGxheWVyIHBvaW50ZXIgdG8gc3BlY2lmaWVkIHRpY2suXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFRpY2sgdG8gc2tpcCB0by5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0c2tpcFRvVGljayh0aWNrKSB7XG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0dGhpcy5zdGFydFRpY2sgPSB0aWNrO1xuXG5cdFx0Ly8gTmVlZCB0byBzZXQgdHJhY2sgZXZlbnQgaW5kZXhlcyB0byB0aGUgbmVhcmVzdCBwb3NzaWJsZSBldmVudCB0byB0aGUgc3BlY2lmaWVkIHRpY2suXG5cdFx0dGhpcy50cmFja3MuZm9yRWFjaChmdW5jdGlvbiAodHJhY2spIHtcblx0XHRcdHRyYWNrLnNldEV2ZW50SW5kZXhCeVRpY2sodGljayk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2tpcHMgcGxheWVyIHBvaW50ZXIgdG8gc3BlY2lmaWVkIHBlcmNlbnRhZ2UuXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSAtIFBlcmNlbnQgdmFsdWUgaW4gaW50ZWdlciBmb3JtYXQuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdHNraXBUb1BlcmNlbnQocGVyY2VudCkge1xuXHRcdGlmIChwZXJjZW50IDwgMCB8fCBwZXJjZW50ID4gMTAwKSB0aHJvdyAnUGVyY2VudCBtdXN0IGJlIG51bWJlciBiZXR3ZWVuIDEgYW5kIDEwMC4nO1xuXHRcdHRoaXMuc2tpcFRvVGljayhNYXRoLnJvdW5kKHBlcmNlbnQgLyAxMDAgKiB0aGlzLnRvdGFsVGlja3MpKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTa2lwcyBwbGF5ZXIgcG9pbnRlciB0byBzcGVjaWZpZWQgc2Vjb25kcy5cblx0ICogQHBhcmFtIHtudW1iZXJ9IC0gU2Vjb25kcyB0byBza2lwIHRvLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRza2lwVG9TZWNvbmRzKHNlY29uZHMpIHtcblx0XHR2YXIgc29uZ1RpbWUgPSB0aGlzLmdldFNvbmdUaW1lKCk7XG5cdFx0aWYgKHNlY29uZHMgPCAwIHx8IHNlY29uZHMgPiBzb25nVGltZSkgdGhyb3cgYCR7c2Vjb25kc30gc2Vjb25kcyBub3Qgd2l0aGluIHNvbmcgdGltZSBvZiAke3NvbmdUaW1lfWA7XG5cdFx0dGhpcy5za2lwVG9QZXJjZW50KHNlY29uZHMgLyBzb25nVGltZSAqIDEwMCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHBsYXllciBpcyBwbGF5aW5nXG5cdCAqIEByZXR1cm4ge2Jvb2xlYW59XG5cdCAqL1xuXHRpc1BsYXlpbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0SW50ZXJ2YWxJZCA+IDAgfHwgdHlwZW9mIHRoaXMuc2V0SW50ZXJ2YWxJZCA9PT0gJ29iamVjdCc7XG5cdH1cblxuXHQvKipcblx0ICogUGxheXMgdGhlIGxvYWRlZCBNSURJIGZpbGUgd2l0aG91dCByZWdhcmQgZm9yIHRpbWluZyBhbmQgc2F2ZXMgZXZlbnRzIGluIHRoaXMuZXZlbnRzLiAgRXNzZW50aWFsbHkgdXNlZCBhcyBhIHBhcnNlci5cblx0ICogQHJldHVybiB7UGxheWVyfVxuXHQgKi9cblx0ZHJ5UnVuKCkge1xuXHRcdC8vIFJlc2V0IHRyYWNrcyBmaXJzdFxuXHRcdHRoaXMucmVzZXRUcmFja3MoKTtcblx0XHR3aGlsZSAoIXRoaXMuZW5kT2ZGaWxlKCkpIHRoaXMucGxheUxvb3AodHJ1ZSk7XG5cdFx0dGhpcy5ldmVudHMgPSB0aGlzLmdldEV2ZW50cygpO1xuXHRcdHRoaXMudG90YWxFdmVudHMgPSB0aGlzLmdldFRvdGFsRXZlbnRzKCk7XG5cdFx0dGhpcy50b3RhbFRpY2tzID0gdGhpcy5nZXRUb3RhbFRpY2tzKCk7XG5cdFx0dGhpcy5zdGFydFRpY2sgPSAwO1xuXHRcdHRoaXMuc3RhcnRUaW1lID0gMDtcblxuXHRcdC8vIExlYXZlIHRyYWNrcyBpbiBwcmlzdGluZSBjb25kaXNoXG5cdFx0dGhpcy5yZXNldFRyYWNrcygpO1xuXG5cdFx0Ly9jb25zb2xlLmxvZygnU29uZyB0aW1lOiAnICsgdGhpcy5nZXRTb25nVGltZSgpICsgJyBzZWNvbmRzIC8gJyArIHRoaXMudG90YWxUaWNrcyArICcgdGlja3MuJyk7XG5cblx0XHR0aGlzLnRyaWdnZXJQbGF5ZXJFdmVudCgnZmlsZUxvYWRlZCcsIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0cyBwbGF5IHBvaW50ZXJzIGZvciBhbGwgdHJhY2tzLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHRyZXNldFRyYWNrcygpIHtcblx0XHR0aGlzLnRyYWNrcy5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnJlc2V0KCkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgYW4gYXJyYXkgb2YgZXZlbnRzIGdyb3VwZWQgYnkgdHJhY2suXG5cdCAqIEByZXR1cm4ge2FycmF5fVxuXHQgKi9cblx0Z2V0RXZlbnRzKCkge1xuXHRcdHJldHVybiB0aGlzLnRyYWNrcy5tYXAodHJhY2sgPT4gdHJhY2suZXZlbnRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRvdGFsIG51bWJlciBvZiB0aWNrcyBpbiB0aGUgbG9hZGVkIE1JREkgZmlsZS5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0Z2V0VG90YWxUaWNrcygpIHtcblx0XHRyZXR1cm4gTWF0aC5tYXguYXBwbHkobnVsbCwgdGhpcy50cmFja3MubWFwKHRyYWNrID0+IHRyYWNrLmRlbHRhKSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0b3RhbCBudW1iZXIgb2YgZXZlbnRzIGluIHRoZSBsb2FkZWQgTUlESSBmaWxlLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRUb3RhbEV2ZW50cygpIHtcblx0XHRyZXR1cm4gdGhpcy50cmFja3MucmVkdWNlKChhLCBiKSA9PiB7IHJldHVybiB7IGV2ZW50czogeyBsZW5ndGg6IGEuZXZlbnRzLmxlbmd0aCArIGIuZXZlbnRzLmxlbmd0aCB9IH0gfSwgeyBldmVudHM6IHsgbGVuZ3RoOiAwIH0gfSkuZXZlbnRzLmxlbmd0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHNvbmcgZHVyYXRpb24gaW4gc2Vjb25kcy5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0Z2V0U29uZ1RpbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMudG90YWxUaWNrcyAvIHRoaXMuZGl2aXNpb24gLyB0aGlzLnRlbXBvICogNjA7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyByZW1haW5pbmcgbnVtYmVyIG9mIHNlY29uZHMgaW4gcGxheWJhY2suXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldFNvbmdUaW1lUmVtYWluaW5nKCkge1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKCh0aGlzLnRvdGFsVGlja3MgLSB0aGlzLnRpY2spIC8gdGhpcy5kaXZpc2lvbiAvIHRoaXMudGVtcG8gKiA2MCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyByZW1haW5pbmcgcGVyY2VudCBvZiBwbGF5YmFjay5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0Z2V0U29uZ1BlcmNlbnRSZW1haW5pbmcoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5nZXRTb25nVGltZVJlbWFpbmluZygpIC8gdGhpcy5nZXRTb25nVGltZSgpICogMTAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgYnl0ZXMgcHJvY2Vzc2VkIGluIHRoZSBsb2FkZWQgTUlESSBmaWxlLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRieXRlc1Byb2Nlc3NlZCgpIHtcblx0XHQvLyBDdXJyZW50bHkgYXNzdW1lIGhlYWRlciBjaHVuayBpcyBzdHJpY3RseSAxNCBieXRlc1xuXHRcdHJldHVybiAxNCArIHRoaXMudHJhY2tzLmxlbmd0aCAqIDggKyB0aGlzLnRyYWNrcy5yZWR1Y2UoKGEsIGIpID0+IHsgcmV0dXJuIHsgcG9pbnRlcjogYS5wb2ludGVyICsgYi5wb2ludGVyIH0gfSwgeyBwb2ludGVyOiAwIH0pLnBvaW50ZXI7XG5cdH1cblxuXHQvKipcblx0ICogTnVtYmVyIG9mIGV2ZW50cyBwbGF5ZWQgdXAgdG8gdGhpcyBwb2ludC5cblx0ICogQHJldHVybiB7bnVtYmVyfVxuXHQgKi9cblx0ZXZlbnRzUGxheWVkKCkge1xuXHRcdHJldHVybiB0aGlzLnRyYWNrcy5yZWR1Y2UoKGEsIGIpID0+IHsgcmV0dXJuIHsgZXZlbnRJbmRleDogYS5ldmVudEluZGV4ICsgYi5ldmVudEluZGV4IH0gfSwgeyBldmVudEluZGV4OiAwIH0pLmV2ZW50SW5kZXg7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyBpZiB0aGUgcGxheWVyIHBvaW50ZXIgaGFzIHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgbG9hZGVkIE1JREkgZmlsZS5cblx0ICogVXNlZCBpbiB0d28gd2F5czpcblx0ICogMS4gSWYgcGxheWluZyByZXN1bHQgaXMgYmFzZWQgb24gbG9hZGVkIEpTT04gZXZlbnRzLlxuXHQgKiAyLiBJZiBwYXJzaW5nIChkcnlSdW4pIGl0J3MgYmFzZWQgb24gdGhlIGFjdHVhbCBidWZmZXIgbGVuZ3RoIHZzIGJ5dGVzIHByb2Nlc3NlZC5cblx0ICogQHJldHVybiB7Ym9vbGVhbn1cblx0ICovXG5cdGVuZE9mRmlsZSgpIHtcblx0XHRpZiAodGhpcy5pc1BsYXlpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXZlbnRzUGxheWVkKCkgPT0gdGhpcy50b3RhbEV2ZW50cztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5ieXRlc1Byb2Nlc3NlZCgpID09IHRoaXMuYnVmZmVyLmxlbmd0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IHRpY2sgbnVtYmVyIGluIHBsYXliYWNrLlxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRnZXRDdXJyZW50VGljaygpIHtcblx0XHRyZXR1cm4gTWF0aC5yb3VuZCgoKG5ldyBEYXRlKCkpLmdldFRpbWUoKSAtIHRoaXMuc3RhcnRUaW1lKSAvIDEwMDAgKiAodGhpcy5kaXZpc2lvbiAqICh0aGlzLnRlbXBvIC8gNjApKSkgKyB0aGlzLnN0YXJ0VGljaztcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kcyBNSURJIGV2ZW50IG91dCB0byBsaXN0ZW5lci5cblx0ICogQHBhcmFtIHtvYmplY3R9XG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdGVtaXRFdmVudChldmVudCkge1xuXHRcdHRoaXMudHJpZ2dlclBsYXllckV2ZW50KCdtaWRpRXZlbnQnLCBldmVudCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlcyBldmVudHMgdG8gbGlzdGVuZXJzXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSAtIE5hbWUgb2YgZXZlbnQgdG8gc3Vic2NyaWJlIHRvLlxuXHQgKiBAcGFyYW0ge2Z1bmN0aW9ufSAtIENhbGxiYWNrIHRvIGZpcmUgd2hlbiBldmVudCBpcyBicm9hZGNhc3QuXG5cdCAqIEByZXR1cm4ge1BsYXllcn1cblx0ICovXG5cdG9uKHBsYXllckV2ZW50LCBmbikge1xuXHRcdGlmICghdGhpcy5ldmVudExpc3RlbmVycy5oYXNPd25Qcm9wZXJ0eShwbGF5ZXJFdmVudCkpIHRoaXMuZXZlbnRMaXN0ZW5lcnNbcGxheWVyRXZlbnRdID0gW107XG5cdFx0dGhpcy5ldmVudExpc3RlbmVyc1twbGF5ZXJFdmVudF0ucHVzaChmbik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogQnJvYWRjYXN0cyBldmVudCB0byB0cmlnZ2VyIHN1YnNjcmliZWQgY2FsbGJhY2tzLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gLSBOYW1lIG9mIGV2ZW50LlxuXHQgKiBAcGFyYW0ge29iamVjdH0gLSBEYXRhIHRvIGJlIHBhc3NlZCB0byBzdWJzY3JpYmVyIGNhbGxiYWNrLlxuXHQgKiBAcmV0dXJuIHtQbGF5ZXJ9XG5cdCAqL1xuXHR0cmlnZ2VyUGxheWVyRXZlbnQocGxheWVyRXZlbnQsIGRhdGEpIHtcblx0XHRpZiAodGhpcy5ldmVudExpc3RlbmVycy5oYXNPd25Qcm9wZXJ0eShwbGF5ZXJFdmVudCkpIHRoaXMuZXZlbnRMaXN0ZW5lcnNbcGxheWVyRXZlbnRdLmZvckVhY2goZm4gPT4gZm4oZGF0YSB8fCB7fSkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cbn1cblxuZXhwb3J0cy5QbGF5ZXIgPSBQbGF5ZXI7XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsYXllcikge1xuICAvKipcbiAgICogQWRkcyBhIGxpc3RlbmVyIG9mIGFuIGV2ZW50XG4gICAqIEBjaGFpbmFibGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IC0gdGhlIGV2ZW50IG5hbWVcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgLSB0aGUgZXZlbnQgaGFuZGxlclxuICAgKiBAcmV0dXJuIHtTYW1wbGVQbGF5ZXJ9IHRoZSBwbGF5ZXJcbiAgICogQGV4YW1wbGVcbiAgICogcGxheWVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKHRpbWUsIG5vdGUpIHtcbiAgICogICBjb25zb2xlLmxvZyh0aW1lLCBub3RlKVxuICAgKiB9KVxuICAgKi9cbiAgcGxheWVyLm9uID0gZnVuY3Rpb24gKGV2ZW50LCBjYikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxICYmIHR5cGVvZiBldmVudCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHBsYXllci5vbignZXZlbnQnLCBldmVudClcbiAgICB2YXIgcHJvcCA9ICdvbicgKyBldmVudFxuICAgIHZhciBvbGQgPSBwbGF5ZXJbcHJvcF1cbiAgICBwbGF5ZXJbcHJvcF0gPSBvbGQgPyBjaGFpbihvbGQsIGNiKSA6IGNiXG4gICAgcmV0dXJuIHBsYXllclxuICB9XG4gIHJldHVybiBwbGF5ZXJcbn1cblxuZnVuY3Rpb24gY2hhaW4gKGZuMSwgZm4yKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoYSwgYiwgYywgZCkgeyBmbjEoYSwgYiwgYywgZCk7IGZuMihhLCBiLCBjLCBkKSB9XG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIHBsYXllciA9IHJlcXVpcmUoJy4vcGxheWVyJylcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpXG52YXIgbm90ZXMgPSByZXF1aXJlKCcuL25vdGVzJylcbnZhciBzY2hlZHVsZXIgPSByZXF1aXJlKCcuL3NjaGVkdWxlcicpXG4vL3ZhciBtaWRpID0gcmVxdWlyZSgnLi9taWRpJylcblxuZnVuY3Rpb24gU2FtcGxlUGxheWVyIChhYywgc291cmNlLCBvcHRpb25zKSB7XG4gIC8vcmV0dXJuIG1pZGkoc2NoZWR1bGVyKG5vdGVzKGV2ZW50cyhwbGF5ZXIoYWMsIHNvdXJjZSwgb3B0aW9ucykpKSkpXG4gIHJldHVybiBzY2hlZHVsZXIobm90ZXMoZXZlbnRzKHBsYXllcihhYywgc291cmNlLCBvcHRpb25zKSkpKVxufVxuXG4vL2lmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykgbW9kdWxlLmV4cG9ydHMgPSBTYW1wbGVQbGF5ZXJcbi8vaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB3aW5kb3cuU2FtcGxlUGxheWVyID0gU2FtcGxlUGxheWVyXG5tb2R1bGUuZXhwb3J0cy5TYW1wbGVQbGF5ZXIgPSBTYW1wbGVQbGF5ZXJcbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgbm90ZSA9IHJlcXVpcmUoJy4uL25vdGUtcGFyc2VyL2luZGV4JylcbnZhciBpc01pZGkgPSBmdW5jdGlvbiAobikgeyByZXR1cm4gbiAhPT0gbnVsbCAmJiBuICE9PSBbXSAmJiBuID49IDAgJiYgbiA8IDEyOSB9XG52YXIgdG9NaWRpID0gZnVuY3Rpb24gKG4pIHsgcmV0dXJuIGlzTWlkaShuKSA/ICtuIDogbm90ZS5taWRpKG4pIH1cblxuLy8gQWRkcyBub3RlIG5hbWUgdG8gbWlkaSBjb252ZXJzaW9uXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgaWYgKHBsYXllci5idWZmZXJzKSB7XG4gICAgdmFyIG1hcCA9IHBsYXllci5vcHRzLm1hcFxuICAgIHZhciB0b0tleSA9IHR5cGVvZiBtYXAgPT09ICdmdW5jdGlvbicgPyBtYXAgOiB0b01pZGlcbiAgICB2YXIgbWFwcGVyID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBuYW1lID8gdG9LZXkobmFtZSkgfHwgbmFtZSA6IG51bGxcbiAgICB9XG5cbiAgICBwbGF5ZXIuYnVmZmVycyA9IG1hcEJ1ZmZlcnMocGxheWVyLmJ1ZmZlcnMsIG1hcHBlcilcbiAgICB2YXIgc3RhcnQgPSBwbGF5ZXIuc3RhcnRcbiAgICBwbGF5ZXIuc3RhcnQgPSBmdW5jdGlvbiAobmFtZSwgd2hlbiwgb3B0aW9ucykge1xuICAgICAgdmFyIGtleSA9IG1hcHBlcihuYW1lKVxuICAgICAgdmFyIGRlYyA9IGtleSAlIDFcbiAgICAgIGlmIChkZWMpIHtcbiAgICAgICAga2V5ID0gTWF0aC5mbG9vcihrZXkpXG4gICAgICAgIG9wdGlvbnMgPSBPYmplY3QuYXNzaWduKG9wdGlvbnMgfHwge30sIHsgY2VudHM6IE1hdGguZmxvb3IoZGVjICogMTAwKSB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXJ0KGtleSwgd2hlbiwgb3B0aW9ucylcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHBsYXllclxufVxuXG5mdW5jdGlvbiBtYXBCdWZmZXJzIChidWZmZXJzLCB0b0tleSkge1xuICByZXR1cm4gT2JqZWN0LmtleXMoYnVmZmVycykucmVkdWNlKGZ1bmN0aW9uIChtYXBwZWQsIG5hbWUpIHtcbiAgICBtYXBwZWRbdG9LZXkobmFtZSldID0gYnVmZmVyc1tuYW1lXVxuICAgIHJldHVybiBtYXBwZWRcbiAgfSwge30pXG59XG4iLCIvKiBnbG9iYWwgQXVkaW9CdWZmZXIgKi9cbid1c2Ugc3RyaWN0J1xuXG52YXIgQURTUiA9IHJlcXVpcmUoJy4uL2Fkc3IvaW5kZXgnKVxuXG52YXIgRU1QVFkgPSB7fVxudmFyIERFRkFVTFRTID0ge1xuICBnYWluOiAxLFxuICBhdHRhY2s6IDAuMDEsXG4gIGRlY2F5OiAwLjEsXG4gIHN1c3RhaW46IDAuOSxcbiAgcmVsZWFzZTogMC4zLFxuICBsb29wOiBmYWxzZSxcbiAgY2VudHM6IDAsXG4gIGxvb3BTdGFydDogMCxcbiAgbG9vcEVuZDogMFxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHNhbXBsZSBwbGF5ZXIuXG4gKlxuICogQHBhcmFtIHtBdWRpb0NvbnRleHR9IGFjIC0gdGhlIGF1ZGlvIGNvbnRleHRcbiAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ8T2JqZWN0PFN0cmluZyxBcnJheUJ1ZmZlcj59IHNvdXJjZVxuICogQHBhcmFtIHtPbmplY3R9IG9wdGlvbnMgLSAoT3B0aW9uYWwpIGFuIG9wdGlvbnMgb2JqZWN0XG4gKiBAcmV0dXJuIHtwbGF5ZXJ9IHRoZSBwbGF5ZXJcbiAqIEBleGFtcGxlXG4gKiB2YXIgU2FtcGxlUGxheWVyID0gcmVxdWlyZSgnc2FtcGxlLXBsYXllcicpXG4gKiB2YXIgYWMgPSBuZXcgQXVkaW9Db250ZXh0KClcbiAqIHZhciBzbmFyZSA9IFNhbXBsZVBsYXllcihhYywgPEF1ZGlvQnVmZmVyPilcbiAqIHNuYXJlLnBsYXkoKVxuICovXG5mdW5jdGlvbiBTYW1wbGVQbGF5ZXIgKGFjLCBzb3VyY2UsIG9wdGlvbnMpIHtcbiAgdmFyIGNvbm5lY3RlZCA9IGZhbHNlXG4gIHZhciBuZXh0SWQgPSAwXG4gIHZhciB0cmFja2VkID0ge31cbiAgdmFyIG91dCA9IGFjLmNyZWF0ZUdhaW4oKVxuICBvdXQuZ2Fpbi52YWx1ZSA9IDFcblxuICB2YXIgb3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRTLCBvcHRpb25zKVxuXG4gIC8qKlxuICAgKiBAbmFtZXNwYWNlXG4gICAqL1xuICB2YXIgcGxheWVyID0geyBjb250ZXh0OiBhYywgb3V0OiBvdXQsIG9wdHM6IG9wdHMgfVxuICBpZiAoc291cmNlIGluc3RhbmNlb2YgQXVkaW9CdWZmZXIpIHBsYXllci5idWZmZXIgPSBzb3VyY2VcbiAgZWxzZSBwbGF5ZXIuYnVmZmVycyA9IHNvdXJjZVxuXG4gIC8qKlxuICAgKiBTdGFydCBhIHNhbXBsZSBidWZmZXIuXG4gICAqXG4gICAqIFRoZSByZXR1cm5lZCBvYmplY3QgaGFzIGEgZnVuY3Rpb24gYHN0b3Aod2hlbilgIHRvIHN0b3AgdGhlIHNvdW5kLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtIHRoZSBuYW1lIG9mIHRoZSBidWZmZXIuIElmIHRoZSBzb3VyY2Ugb2YgdGhlXG4gICAqIFNhbXBsZVBsYXllciBpcyBvbmUgc2FtcGxlIGJ1ZmZlciwgdGhpcyBwYXJhbWV0ZXIgaXMgbm90IHJlcXVpcmVkXG4gICAqIEBwYXJhbSB7RmxvYXR9IHdoZW4gLSAoT3B0aW9uYWwpIHdoZW4gdG8gc3RhcnQgKGN1cnJlbnQgdGltZSBpZiBieSBkZWZhdWx0KVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIGFkZGl0aW9uYWwgc2FtcGxlIHBsYXlpbmcgb3B0aW9uc1xuICAgKiBAcmV0dXJuIHtBdWRpb05vZGV9IGFuIGF1ZGlvIG5vZGUgd2l0aCBhIGBzdG9wYCBmdW5jdGlvblxuICAgKiBAZXhhbXBsZVxuICAgKiB2YXIgc2FtcGxlID0gcGxheWVyKGFjLCA8QXVkaW9CdWZmZXI+KS5jb25uZWN0KGFjLmRlc3RpbmF0aW9uKVxuICAgKiBzYW1wbGUuc3RhcnQoKVxuICAgKiBzYW1wbGUuc3RhcnQoNSwgeyBnYWluOiAwLjcgfSkgLy8gbmFtZSBub3QgcmVxdWlyZWQgc2luY2UgaXMgb25seSBvbmUgQXVkaW9CdWZmZXJcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIGRydW1zID0gcGxheWVyKGFjLCB7IHNuYXJlOiA8QXVkaW9CdWZmZXI+LCBraWNrOiA8QXVkaW9CdWZmZXI+LCAuLi4gfSkuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICogZHJ1bXMuc3RhcnQoJ3NuYXJlJylcbiAgICogZHJ1bXMuc3RhcnQoJ3NuYXJlJywgMCwgeyBnYWluOiAwLjMgfSlcbiAgICovXG4gIHBsYXllci5zdGFydCA9IGZ1bmN0aW9uIChuYW1lLCB3aGVuLCBvcHRpb25zKSB7XG4gICAgLy8gaWYgb25seSBvbmUgYnVmZmVyLCByZW9yZGVyIGFyZ3VtZW50c1xuICAgIGlmIChwbGF5ZXIuYnVmZmVyICYmIG5hbWUgIT09IG51bGwpIHJldHVybiBwbGF5ZXIuc3RhcnQobnVsbCwgbmFtZSwgd2hlbilcblxuICAgIHZhciBidWZmZXIgPSBuYW1lID8gcGxheWVyLmJ1ZmZlcnNbbmFtZV0gOiBwbGF5ZXIuYnVmZmVyXG4gICAgaWYgKCFidWZmZXIpIHtcbiAgICAgIGNvbnNvbGUud2FybignQnVmZmVyICcgKyBuYW1lICsgJyBub3QgZm91bmQuJylcbiAgICAgIHJldHVyblxuICAgIH0gZWxzZSBpZiAoIWNvbm5lY3RlZCkge1xuICAgICAgY29uc29sZS53YXJuKCdTYW1wbGVQbGF5ZXIgbm90IGNvbm5lY3RlZCB0byBhbnkgbm9kZS4nKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IEVNUFRZXG4gICAgd2hlbiA9IE1hdGgubWF4KGFjLmN1cnJlbnRUaW1lLCB3aGVuIHx8IDApXG4gICAgcGxheWVyLmVtaXQoJ3N0YXJ0Jywgd2hlbiwgbmFtZSwgb3B0cylcbiAgICB2YXIgbm9kZSA9IGNyZWF0ZU5vZGUobmFtZSwgYnVmZmVyLCBvcHRzKVxuICAgIG5vZGUuaWQgPSB0cmFjayhuYW1lLCBub2RlKVxuICAgIG5vZGUuZW52LnN0YXJ0KHdoZW4pXG4gICAgbm9kZS5zb3VyY2Uuc3RhcnQod2hlbilcbiAgICBwbGF5ZXIuZW1pdCgnc3RhcnRlZCcsIHdoZW4sIG5vZGUuaWQsIG5vZGUpXG4gICAgaWYgKG9wdHMuZHVyYXRpb24pIG5vZGUuc3RvcCh3aGVuICsgb3B0cy5kdXJhdGlvbilcbiAgICByZXR1cm4gbm9kZVxuICB9XG5cbiAgLy8gTk9URTogc3RhcnQgd2lsbCBiZSBvdmVycmlkZSBzbyB3ZSBjYW4ndCBjb3B5IHRoZSBmdW5jdGlvbiByZWZlcmVuY2VcbiAgLy8gdGhpcyBpcyBvYnZpb3VzbHkgbm90IGEgZ29vZCBkZXNpZ24sIHNvIHRoaXMgY29kZSB3aWxsIGJlIGdvbmUgc29vbi5cbiAgLyoqXG4gICAqIEFuIGFsaWFzIGZvciBgcGxheWVyLnN0YXJ0YFxuICAgKiBAc2VlIHBsYXllci5zdGFydFxuICAgKiBAc2luY2UgMC4zLjBcbiAgICovXG4gIHBsYXllci5wbGF5ID0gZnVuY3Rpb24gKG5hbWUsIHdoZW4sIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gcGxheWVyLnN0YXJ0KG5hbWUsIHdoZW4sIG9wdGlvbnMpXG4gIH1cblxuICAvKipcbiAgICogU3RvcCBzb21lIG9yIGFsbCBzYW1wbGVzXG4gICAqXG4gICAqIEBwYXJhbSB7RmxvYXR9IHdoZW4gLSAoT3B0aW9uYWwpIGFuIGFic29sdXRlIHRpbWUgaW4gc2Vjb25kcyAob3IgY3VycmVudFRpbWVcbiAgICogaWYgbm90IHNwZWNpZmllZClcbiAgICogQHBhcmFtIHtBcnJheX0gbm9kZXMgLSAoT3B0aW9uYWwpIGFuIGFycmF5IG9mIG5vZGVzIG9yIG5vZGVzIGlkcyB0byBzdG9wXG4gICAqIEByZXR1cm4ge0FycmF5fSBhbiBhcnJheSBvZiBpZHMgb2YgdGhlIHN0b3BlZCBzYW1wbGVzXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHZhciBsb25nU291bmQgPSBwbGF5ZXIoYWMsIDxBdWRpb0J1ZmZlcj4pLmNvbm5lY3QoYWMuZGVzdGluYXRpb24pXG4gICAqIGxvbmdTb3VuZC5zdGFydChhYy5jdXJyZW50VGltZSlcbiAgICogbG9uZ1NvdW5kLnN0YXJ0KGFjLmN1cnJlbnRUaW1lICsgMSlcbiAgICogbG9uZ1NvdW5kLnN0YXJ0KGFjLmN1cnJlbnRUaW1lICsgMilcbiAgICogbG9uZ1NvdW5kLnN0b3AoYWMuY3VycmVudFRpbWUgKyAzKSAvLyBzdG9wIHRoZSB0aHJlZSBzb3VuZHNcbiAgICovXG4gIHBsYXllci5zdG9wID0gZnVuY3Rpb24gKHdoZW4sIGlkcykge1xuICAgIHZhciBub2RlXG4gICAgaWRzID0gaWRzIHx8IE9iamVjdC5rZXlzKHRyYWNrZWQpXG4gICAgcmV0dXJuIGlkcy5tYXAoZnVuY3Rpb24gKGlkKSB7XG4gICAgICBub2RlID0gdHJhY2tlZFtpZF1cbiAgICAgIGlmICghbm9kZSkgcmV0dXJuIG51bGxcbiAgICAgIG5vZGUuc3RvcCh3aGVuKVxuICAgICAgcmV0dXJuIG5vZGUuaWRcbiAgICB9KVxuICB9XG4gIC8qKlxuICAgKiBDb25uZWN0IHRoZSBwbGF5ZXIgdG8gYSBkZXN0aW5hdGlvbiBub2RlXG4gICAqXG4gICAqIEBwYXJhbSB7QXVkaW9Ob2RlfSBkZXN0aW5hdGlvbiAtIHRoZSBkZXN0aW5hdGlvbiBub2RlXG4gICAqIEByZXR1cm4ge0F1ZGlvUGxheWVyfSB0aGUgcGxheWVyXG4gICAqIEBjaGFpbmFibGVcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIHNhbXBsZSA9IHBsYXllcihhYywgPEF1ZGlvQnVmZmVyPikuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICovXG4gIHBsYXllci5jb25uZWN0ID0gZnVuY3Rpb24gKGRlc3QpIHtcbiAgICBjb25uZWN0ZWQgPSB0cnVlXG4gICAgb3V0LmNvbm5lY3QoZGVzdClcbiAgICByZXR1cm4gcGxheWVyXG4gIH1cblxuICBwbGF5ZXIuZW1pdCA9IGZ1bmN0aW9uIChldmVudCwgd2hlbiwgb2JqLCBvcHRzKSB7XG4gICAgaWYgKHBsYXllci5vbmV2ZW50KSBwbGF5ZXIub25ldmVudChldmVudCwgd2hlbiwgb2JqLCBvcHRzKVxuICAgIHZhciBmbiA9IHBsYXllclsnb24nICsgZXZlbnRdXG4gICAgaWYgKGZuKSBmbih3aGVuLCBvYmosIG9wdHMpXG4gIH1cblxuICByZXR1cm4gcGxheWVyXG5cbiAgLy8gPT09PT09PT09PT09PT09IFBSSVZBVEUgRlVOQ1RJT05TID09PT09PT09PT09PT09IC8vXG5cbiAgZnVuY3Rpb24gdHJhY2sgKG5hbWUsIG5vZGUpIHtcbiAgICBub2RlLmlkID0gbmV4dElkKytcbiAgICB0cmFja2VkW25vZGUuaWRdID0gbm9kZVxuICAgIG5vZGUuc291cmNlLm9uZW5kZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbm93ID0gYWMuY3VycmVudFRpbWVcbiAgICAgIG5vZGUuc291cmNlLmRpc2Nvbm5lY3QoKVxuICAgICAgbm9kZS5lbnYuZGlzY29ubmVjdCgpXG4gICAgICBub2RlLmRpc2Nvbm5lY3QoKVxuICAgICAgcGxheWVyLmVtaXQoJ2VuZGVkJywgbm93LCBub2RlLmlkLCBub2RlKVxuICAgIH1cbiAgICByZXR1cm4gbm9kZS5pZFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlTm9kZSAobmFtZSwgYnVmZmVyLCBvcHRpb25zKSB7XG4gICAgdmFyIG5vZGUgPSBhYy5jcmVhdGVHYWluKClcbiAgICBub2RlLmdhaW4udmFsdWUgPSAwIC8vIHRoZSBlbnZlbG9wZSB3aWxsIGNvbnRyb2wgdGhlIGdhaW5cbiAgICBub2RlLmNvbm5lY3Qob3V0KVxuXG4gICAgbm9kZS5lbnYgPSBlbnZlbG9wZShhYywgb3B0aW9ucywgb3B0cylcbiAgICBub2RlLmVudi5jb25uZWN0KG5vZGUuZ2FpbilcblxuICAgIG5vZGUuc291cmNlID0gYWMuY3JlYXRlQnVmZmVyU291cmNlKClcbiAgICBub2RlLnNvdXJjZS5idWZmZXIgPSBidWZmZXJcbiAgICBub2RlLnNvdXJjZS5jb25uZWN0KG5vZGUpXG4gICAgbm9kZS5zb3VyY2UubG9vcCA9IG9wdGlvbnMubG9vcCB8fCBvcHRzLmxvb3BcbiAgICBub2RlLnNvdXJjZS5wbGF5YmFja1JhdGUudmFsdWUgPSBjZW50c1RvUmF0ZShvcHRpb25zLmNlbnRzIHx8IG9wdHMuY2VudHMpXG4gICAgbm9kZS5zb3VyY2UubG9vcFN0YXJ0ID0gb3B0aW9ucy5sb29wU3RhcnQgfHwgb3B0cy5sb29wU3RhcnRcbiAgICBub2RlLnNvdXJjZS5sb29wRW5kID0gb3B0aW9ucy5sb29wRW5kIHx8IG9wdHMubG9vcEVuZFxuICAgIG5vZGUuc3RvcCA9IGZ1bmN0aW9uICh3aGVuKSB7XG4gICAgICB2YXIgdGltZSA9IHdoZW4gfHwgYWMuY3VycmVudFRpbWVcbiAgICAgIHBsYXllci5lbWl0KCdzdG9wJywgdGltZSwgbmFtZSlcbiAgICAgIHZhciBzdG9wQXQgPSBub2RlLmVudi5zdG9wKHRpbWUpXG4gICAgICBub2RlLnNvdXJjZS5zdG9wKHN0b3BBdClcbiAgICB9XG4gICAgcmV0dXJuIG5vZGVcbiAgfVxufVxuXG5mdW5jdGlvbiBpc051bSAoeCkgeyByZXR1cm4gdHlwZW9mIHggPT09ICdudW1iZXInIH1cbnZhciBQQVJBTVMgPSBbJ2F0dGFjaycsICdkZWNheScsICdzdXN0YWluJywgJ3JlbGVhc2UnXVxuZnVuY3Rpb24gZW52ZWxvcGUgKGFjLCBvcHRpb25zLCBvcHRzKSB7XG4gIHZhciBlbnYgPSBBRFNSKGFjKVxuICB2YXIgYWRzciA9IG9wdGlvbnMuYWRzciB8fCBvcHRzLmFkc3JcbiAgUEFSQU1TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUsIGkpIHtcbiAgICBpZiAoYWRzcikgZW52W25hbWVdID0gYWRzcltpXVxuICAgIGVsc2UgZW52W25hbWVdID0gb3B0aW9uc1tuYW1lXSB8fCBvcHRzW25hbWVdXG4gIH0pXG4gIGVudi52YWx1ZS52YWx1ZSA9IGlzTnVtKG9wdGlvbnMuZ2FpbikgPyBvcHRpb25zLmdhaW5cbiAgICA6IGlzTnVtKG9wdHMuZ2FpbikgPyBvcHRzLmdhaW4gOiAxXG4gIHJldHVybiBlbnZcbn1cblxuLypcbiAqIEdldCBwbGF5YmFjayByYXRlIGZvciBhIGdpdmVuIHBpdGNoIGNoYW5nZSAoaW4gY2VudHMpXG4gKiBCYXNpYyBbbWF0aF0oaHR0cDovL3d3dy5iaXJkc29mdC5kZW1vbi5jby51ay9tdXNpYy9zYW1wbGVydC5odG0pOlxuICogZjIgPSBmMSAqIDJeKCBDIC8gMTIwMCApXG4gKi9cbmZ1bmN0aW9uIGNlbnRzVG9SYXRlIChjZW50cykgeyByZXR1cm4gY2VudHMgPyBNYXRoLnBvdygyLCBjZW50cyAvIDEyMDApIDogMSB9XG5cbm1vZHVsZS5leHBvcnRzID0gU2FtcGxlUGxheWVyXG4iLCIndXNlIHN0cmljdCdcblxudmFyIGlzQXJyID0gQXJyYXkuaXNBcnJheVxudmFyIGlzT2JqID0gZnVuY3Rpb24gKG8pIHsgcmV0dXJuIG8gJiYgdHlwZW9mIG8gPT09ICdvYmplY3QnIH1cbnZhciBPUFRTID0ge31cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGxheWVyKSB7XG4gIC8qKlxuICAgKiBTY2hlZHVsZSBhIGxpc3Qgb2YgZXZlbnRzIHRvIGJlIHBsYXllZCBhdCBzcGVjaWZpYyB0aW1lLlxuICAgKlxuICAgKiBJdCBzdXBwb3J0cyB0aHJlZSBmb3JtYXRzIG9mIGV2ZW50cyBmb3IgdGhlIGV2ZW50cyBsaXN0OlxuICAgKlxuICAgKiAtIEFuIGFycmF5IHdpdGggW3RpbWUsIG5vdGVdXG4gICAqIC0gQW4gYXJyYXkgd2l0aCBbdGltZSwgb2JqZWN0XVxuICAgKiAtIEFuIG9iamVjdCB3aXRoIHsgdGltZTogPywgW25hbWV8bm90ZXxtaWRpfGtleV06ID8gfVxuICAgKlxuICAgKiBAcGFyYW0ge0Zsb2F0fSB0aW1lIC0gYW4gYWJzb2x1dGUgdGltZSB0byBzdGFydCAob3IgQXVkaW9Db250ZXh0J3NcbiAgICogY3VycmVudFRpbWUgaWYgcHJvdmlkZWQgbnVtYmVyIGlzIDApXG4gICAqIEBwYXJhbSB7QXJyYXl9IGV2ZW50cyAtIHRoZSBldmVudHMgbGlzdC5cbiAgICogQHJldHVybiB7QXJyYXl9IGFuIGFycmF5IG9mIGlkc1xuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiAvLyBFdmVudCBmb3JtYXQ6IFt0aW1lLCBub3RlXVxuICAgKiB2YXIgcGlhbm8gPSBwbGF5ZXIoYWMsIC4uLikuY29ubmVjdChhYy5kZXN0aW5hdGlvbilcbiAgICogcGlhbm8uc2NoZWR1bGUoMCwgWyBbMCwgJ0MyJ10sIFswLjUsICdDMyddLCBbMSwgJ0M0J10gXSlcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogLy8gRXZlbnQgZm9ybWF0OiBhbiBvYmplY3QgeyB0aW1lOiA/LCBuYW1lOiA/IH1cbiAgICogdmFyIGRydW1zID0gcGxheWVyKGFjLCAuLi4pLmNvbm5lY3QoYWMuZGVzdGluYXRpb24pXG4gICAqIGRydW1zLnNjaGVkdWxlKDAsIFtcbiAgICogICB7IG5hbWU6ICdraWNrJywgdGltZTogMCB9LFxuICAgKiAgIHsgbmFtZTogJ3NuYXJlJywgdGltZTogMC41IH0sXG4gICAqICAgeyBuYW1lOiAna2ljaycsIHRpbWU6IDEgfSxcbiAgICogICB7IG5hbWU6ICdzbmFyZScsIHRpbWU6IDEuNSB9XG4gICAqIF0pXG4gICAqL1xuICBwbGF5ZXIuc2NoZWR1bGUgPSBmdW5jdGlvbiAodGltZSwgZXZlbnRzKSB7XG4gICAgdmFyIG5vdyA9IHBsYXllci5jb250ZXh0LmN1cnJlbnRUaW1lXG4gICAgdmFyIHdoZW4gPSB0aW1lIDwgbm93ID8gbm93IDogdGltZVxuICAgIHBsYXllci5lbWl0KCdzY2hlZHVsZScsIHdoZW4sIGV2ZW50cylcbiAgICB2YXIgdCwgbywgbm90ZSwgb3B0c1xuICAgIHJldHVybiBldmVudHMubWFwKGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgaWYgKCFldmVudCkgcmV0dXJuIG51bGxcbiAgICAgIGVsc2UgaWYgKGlzQXJyKGV2ZW50KSkge1xuICAgICAgICB0ID0gZXZlbnRbMF07IG8gPSBldmVudFsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdCA9IGV2ZW50LnRpbWU7IG8gPSBldmVudFxuICAgICAgfVxuXG4gICAgICBpZiAoaXNPYmoobykpIHtcbiAgICAgICAgbm90ZSA9IG8ubmFtZSB8fCBvLmtleSB8fCBvLm5vdGUgfHwgby5taWRpIHx8IG51bGxcbiAgICAgICAgb3B0cyA9IG9cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5vdGUgPSBvXG4gICAgICAgIG9wdHMgPSBPUFRTXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwbGF5ZXIuc3RhcnQobm90ZSwgd2hlbiArICh0IHx8IDApLCBvcHRzKVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHBsYXllclxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBsb2FkID0gcmVxdWlyZSgnLi4vYXVkaW8tbG9hZGVyL2luZGV4JylcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9zYW1wbGUtcGxheWVyL2luZGV4JylcblxuLyoqXG4gKiBMb2FkIGEgc291bmRmb250IGluc3RydW1lbnQuIEl0IHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYVxuICogaW5zdHJ1bWVudCBvYmplY3QuXG4gKlxuICogVGhlIGluc3RydW1lbnQgb2JqZWN0IHJldHVybmVkIGJ5IHRoZSBwcm9taXNlIGhhcyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gKlxuICogLSBuYW1lOiB0aGUgaW5zdHJ1bWVudCBuYW1lXG4gKiAtIHBsYXk6IEEgZnVuY3Rpb24gdG8gcGxheSBub3RlcyBmcm9tIHRoZSBidWZmZXIgd2l0aCB0aGUgc2lnbmF0dXJlXG4gKiBgcGxheShub3RlLCB0aW1lLCBkdXJhdGlvbiwgb3B0aW9ucylgXG4gKlxuICpcbiAqIFRoZSB2YWxpZCBvcHRpb25zIGFyZTpcbiAqXG4gKiAtIGBmb3JtYXRgOiB0aGUgc291bmRmb250IGZvcm1hdC4gJ21wMycgYnkgZGVmYXVsdC4gQ2FuIGJlICdvZ2cnXG4gKiAtIGBzb3VuZGZvbnRgOiB0aGUgc291bmRmb250IG5hbWUuICdNdXN5bmdLaXRlJyBieSBkZWZhdWx0LiBDYW4gYmUgJ0ZsdWlkUjNfR00nXG4gKiAtIGBuYW1lVG9VcmxgIDxGdW5jdGlvbj46IGEgZnVuY3Rpb24gdG8gY29udmVydCBmcm9tIGluc3RydW1lbnQgbmFtZXMgdG8gVVJMXG4gKiAtIGBkZXN0aW5hdGlvbmA6IGJ5IGRlZmF1bHQgU291bmRmb250IHVzZXMgdGhlIGBhdWRpb0NvbnRleHQuZGVzdGluYXRpb25gIGJ1dCB5b3UgY2FuIG92ZXJyaWRlIGl0LlxuICogLSBgZ2FpbmA6IHRoZSBnYWluIG9mIHRoZSBwbGF5ZXIgKDEgYnkgZGVmYXVsdClcbiAqIC0gYG5vdGVzYDogYW4gYXJyYXkgb2YgdGhlIG5vdGVzIHRvIGRlY29kZS4gSXQgY2FuIGJlIGFuIGFycmF5IG9mIHN0cmluZ3NcbiAqIHdpdGggbm90ZSBuYW1lcyBvciBhbiBhcnJheSBvZiBudW1iZXJzIHdpdGggbWlkaSBub3RlIG51bWJlcnMuIFRoaXMgaXMgYVxuICogcGVyZm9ybWFuY2Ugb3B0aW9uOiBzaW5jZSBkZWNvZGluZyBtcDMgaXMgYSBjcHUgaW50ZW5zaXZlIHByb2Nlc3MsIHlvdSBjYW4gbGltaXRcbiAqIGxpbWl0IHRoZSBudW1iZXIgb2Ygbm90ZXMgeW91IHdhbnQgYW5kIHJlZHVjZSB0aGUgdGltZSB0byBsb2FkIHRoZSBpbnN0cnVtZW50LlxuICpcbiAqIEBwYXJhbSB7QXVkaW9Db250ZXh0fSBhYyAtIHRoZSBhdWRpbyBjb250ZXh0XG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtIHRoZSBpbnN0cnVtZW50IG5hbWUuIEZvciBleGFtcGxlOiAnYWNvdXN0aWNfZ3JhbmRfcGlhbm8nXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIChPcHRpb25hbCkgdGhlIHNhbWUgb3B0aW9ucyBhcyBTb3VuZGZvbnQubG9hZEJ1ZmZlcnNcbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKlxuICogQGV4YW1wbGVcbiAqIHZhciBTb3VuZGZvbnQgPSByZXF1aXJlKCdzb3VuZm9udC1wbGF5ZXInKVxuICogU291bmRmb250Lmluc3RydW1lbnQoJ21hcmltYmEnKS50aGVuKGZ1bmN0aW9uIChtYXJpbWJhKSB7XG4gKiAgIG1hcmltYmEucGxheSgnQzQnKVxuICogfSlcbiAqL1xuZnVuY3Rpb24gaW5zdHJ1bWVudCAoYWMsIG5hbWUsIG9wdGlvbnMpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHJldHVybiBmdW5jdGlvbiAobiwgbykgeyByZXR1cm4gaW5zdHJ1bWVudChhYywgbiwgbykgfVxuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge31cbiAgdmFyIGlzVXJsID0gb3B0cy5pc1NvdW5kZm9udFVSTCB8fCBpc1NvdW5kZm9udFVSTFxuICB2YXIgdG9VcmwgPSBvcHRzLm5hbWVUb1VybCB8fCBuYW1lVG9VcmxcbiAgdmFyIHVybCA9IGlzVXJsKG5hbWUpID8gbmFtZSA6IHRvVXJsKG5hbWUsIG9wdHMuc291bmRmb250LCBvcHRzLmZvcm1hdClcblxuICByZXR1cm4gbG9hZChhYywgdXJsLCB7IG9ubHk6IG9wdHMub25seSB8fCBvcHRzLm5vdGVzIH0pLnRoZW4oZnVuY3Rpb24gKGJ1ZmZlcnMpIHtcbiAgICB2YXIgcCA9IHBsYXllcihhYywgYnVmZmVycywgb3B0cykuY29ubmVjdChvcHRzLmRlc3RpbmF0aW9uID8gb3B0cy5kZXN0aW5hdGlvbiA6IGFjLmRlc3RpbmF0aW9uKVxuICAgIHAudXJsID0gdXJsXG4gICAgcC5uYW1lID0gbmFtZVxuICAgIHJldHVybiBwXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGlzU291bmRmb250VVJMIChuYW1lKSB7XG4gIHJldHVybiAvXFwuanMoXFw/LiopPyQvaS50ZXN0KG5hbWUpXG59XG5cbi8qKlxuICogR2l2ZW4gYW4gaW5zdHJ1bWVudCBuYW1lIHJldHVybnMgYSBVUkwgdG8gdG8gdGhlIEJlbmphbWluIEdsZWl0em1hbidzXG4gKiBwYWNrYWdlIG9mIFtwcmUtcmVuZGVyZWQgc291bmQgZm9udHNdKGh0dHBzOi8vZ2l0aHViLmNvbS9nbGVpdHovbWlkaS1qcy1zb3VuZGZvbnRzKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gaW5zdHJ1bWVudCBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gc291bmRmb250IC0gKE9wdGlvbmFsKSB0aGUgc291bmRmb250IG5hbWUuIE9uZSBvZiAnRmx1aWRSM19HTSdcbiAqIG9yICdNdXN5bmdLaXRlJyAoJ011c3luZ0tpdGUnIGJ5IGRlZmF1bHQpXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9ybWF0IC0gKE9wdGlvbmFsKSBDYW4gYmUgJ21wMycgb3IgJ29nZycgKG1wMyBieSBkZWZhdWx0KVxuICogQHJldHVybnMge1N0cmluZ30gdGhlIFNvdW5kZm9udCBmaWxlIHVybFxuICogQGV4YW1wbGVcbiAqIHZhciBTb3VuZGZvbnQgPSByZXF1aXJlKCdzb3VuZGZvbnQtcGxheWVyJylcbiAqIFNvdW5kZm9udC5uYW1lVG9VcmwoJ21hcmltYmEnLCAnbXAzJylcbiAqL1xuZnVuY3Rpb24gbmFtZVRvVXJsIChuYW1lLCBzZiwgZm9ybWF0KSB7XG4gIGZvcm1hdCA9IGZvcm1hdCA9PT0gJ29nZycgPyBmb3JtYXQgOiAnbXAzJ1xuICBzZiA9IHNmID09PSAnRmx1aWRSM19HTScgPyBzZiA6ICdNdXN5bmdLaXRlJ1xuICByZXR1cm4gJ2h0dHBzOi8vZ2xlaXR6LmdpdGh1Yi5pby9taWRpLWpzLXNvdW5kZm9udHMvJyArIHNmICsgJy8nICsgbmFtZSArICctJyArIGZvcm1hdCArICcuanMnXG59XG5cbi8vIEluIHRoZSAxLjAuMCByZWxlYXNlIGl0IHdpbGwgYmU6XG4vLyB2YXIgU291bmRmb250ID0ge31cbnZhciBTb3VuZGZvbnQgPSByZXF1aXJlKCcuL2xlZ2FjeScpXG5Tb3VuZGZvbnQuaW5zdHJ1bWVudCA9IGluc3RydW1lbnRcblNvdW5kZm9udC5uYW1lVG9VcmwgPSBuYW1lVG9VcmxcblxuLy9pZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIG1vZHVsZS5leHBvcnRzID0gU291bmRmb250XG4vL2lmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgd2luZG93LlNvdW5kZm9udCA9IFNvdW5kZm9udFxubW9kdWxlLmV4cG9ydHMuU291bmRmb250ID0gU291bmRmb250XG5cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgcGFyc2VyID0gcmVxdWlyZSgnLi4vbm90ZS1wYXJzZXIvaW5kZXgnKVxuXG4vKipcbiAqIENyZWF0ZSBhIFNvdW5kZm9udCBvYmplY3RcbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gY29udGV4dCAtIHRoZSBbYXVkaW8gY29udGV4dF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4vZG9jcy9XZWIvQVBJL0F1ZGlvQ29udGV4dClcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5hbWVUb1VybCAtIChPcHRpb25hbCkgYSBmdW5jdGlvbiB0aGF0IG1hcHMgdGhlIHNvdW5kIGZvbnQgbmFtZSB0byB0aGUgdXJsXG4gKiBAcmV0dXJuIHtTb3VuZGZvbnR9IGEgc291bmRmb250IG9iamVjdFxuICovXG5mdW5jdGlvbiBTb3VuZGZvbnQgKGN0eCwgbmFtZVRvVXJsKSB7XG4gIGNvbnNvbGUud2FybignbmV3IFNvdW5kZm9udCgpIGlzIGRlcHJlY3RlZCcpXG4gIGNvbnNvbGUubG9nKCdQbGVhc2UgdXNlIFNvdW5kZm9udC5pbnN0cnVtZW50KCkgaW5zdGVhZCBvZiBuZXcgU291bmRmb250KCkuaW5zdHJ1bWVudCgpJylcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNvdW5kZm9udCkpIHJldHVybiBuZXcgU291bmRmb250KGN0eClcblxuICB0aGlzLm5hbWVUb1VybCA9IG5hbWVUb1VybCB8fCBTb3VuZGZvbnQubmFtZVRvVXJsXG4gIHRoaXMuY3R4ID0gY3R4XG4gIHRoaXMuaW5zdHJ1bWVudHMgPSB7fVxuICB0aGlzLnByb21pc2VzID0gW11cbn1cblxuU291bmRmb250LnByb3RvdHlwZS5vbnJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnNvbGUud2FybignZGVwcmVjYXRlZCBBUEknKVxuICBjb25zb2xlLmxvZygnUGxlYXNlIHVzZSBQcm9taXNlLmFsbChTb3VuZGZvbnQuaW5zdHJ1bWVudCgpLCBTb3VuZGZvbnQuaW5zdHJ1bWVudCgpKS50aGVuKCkgaW5zdGVhZCBvZiBuZXcgU291bmRmb250KCkub25yZWFkeSgpJylcbiAgUHJvbWlzZS5hbGwodGhpcy5wcm9taXNlcykudGhlbihjYWxsYmFjaylcbn1cblxuU291bmRmb250LnByb3RvdHlwZS5pbnN0cnVtZW50ID0gZnVuY3Rpb24gKG5hbWUsIG9wdGlvbnMpIHtcbiAgY29uc29sZS53YXJuKCduZXcgU291bmRmb250KCkuaW5zdHJ1bWVudCgpIGlzIGRlcHJlY2F0ZWQuJylcbiAgY29uc29sZS5sb2coJ1BsZWFzZSB1c2UgU291bmRmb250Lmluc3RydW1lbnQoKSBpbnN0ZWFkLicpXG4gIHZhciBjdHggPSB0aGlzLmN0eFxuICBuYW1lID0gbmFtZSB8fCAnZGVmYXVsdCdcbiAgaWYgKG5hbWUgaW4gdGhpcy5pbnN0cnVtZW50cykgcmV0dXJuIHRoaXMuaW5zdHJ1bWVudHNbbmFtZV1cbiAgdmFyIGluc3QgPSB7bmFtZTogbmFtZSwgcGxheTogb3NjaWxsYXRvclBsYXllcihjdHgsIG9wdGlvbnMpfVxuICB0aGlzLmluc3RydW1lbnRzW25hbWVdID0gaW5zdFxuICBpZiAobmFtZSAhPT0gJ2RlZmF1bHQnKSB7XG4gICAgdmFyIHByb21pc2UgPSBTb3VuZGZvbnQuaW5zdHJ1bWVudChjdHgsIG5hbWUsIG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24gKGluc3RydW1lbnQpIHtcbiAgICAgIGluc3QucGxheSA9IGluc3RydW1lbnQucGxheVxuICAgICAgcmV0dXJuIGluc3RcbiAgICB9KVxuICAgIHRoaXMucHJvbWlzZXMucHVzaChwcm9taXNlKVxuICAgIGluc3Qub25yZWFkeSA9IGZ1bmN0aW9uIChjYikge1xuICAgICAgY29uc29sZS53YXJuKCdvbnJlYWR5IGlzIGRlcHJlY2F0ZWQuIFVzZSBTb3VuZGZvbnQuaW5zdHJ1bWVudCgpLnRoZW4oKScpXG4gICAgICBwcm9taXNlLnRoZW4oY2IpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGluc3Qub25yZWFkeSA9IGZ1bmN0aW9uIChjYikge1xuICAgICAgY29uc29sZS53YXJuKCdvbnJlYWR5IGlzIGRlcHJlY2F0ZWQuIFVzZSBTb3VuZGZvbnQuaW5zdHJ1bWVudCgpLnRoZW4oKScpXG4gICAgICBjYigpXG4gICAgfVxuICB9XG4gIHJldHVybiBpbnN0XG59XG5cbi8qXG4gKiBMb2FkIHRoZSBidWZmZXJzIG9mIGEgZ2l2ZW4gaW5zdHJ1bWVudCBuYW1lLiBJdCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzXG4gKiB0byBhIGhhc2ggd2l0aCBtaWRpIG5vdGUgbnVtYmVycyBhcyBrZXlzLCBhbmQgYXVkaW8gYnVmZmVycyBhcyB2YWx1ZXMuXG4gKlxuICogQHBhcmFtIHtBdWRpb0NvbnRleHR9IGFjIC0gdGhlIGF1ZGlvIGNvbnRleHRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gdGhlIGluc3RydW1lbnQgbmFtZSAoaXQgYWNjZXB0cyBhbiB1cmwgaWYgc3RhcnRzIHdpdGggXCJodHRwXCIpXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIChPcHRpb25hbCkgb3B0aW9ucyBvYmplY3RcbiAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgSGFzaCBvZiB7IG1pZGlOb3RlTnVtOiA8QXVkaW9CdWZmZXI+IH1cbiAqXG4gKiBUaGUgb3B0aW9ucyBvYmplY3QgYWNjZXB0cyB0aGUgZm9sbG93aW5nIGtleXM6XG4gKlxuICogLSBuYW1lVG9Vcmwge0Z1bmN0aW9ufTogYSBmdW5jdGlvbiB0byBjb252ZXJ0IGZyb20gaW5zdHJ1bWVudCBuYW1lcyB0byB1cmxzLlxuICogQnkgZGVmYXVsdCBpdCB1c2VzIEJlbmphbWluIEdsZWl0em1hbidzIHBhY2thZ2Ugb2ZcbiAqIFtwcmUtcmVuZGVyZWQgc291bmQgZm9udHNdKGh0dHBzOi8vZ2l0aHViLmNvbS9nbGVpdHovbWlkaS1qcy1zb3VuZGZvbnRzKVxuICogLSBub3RlcyB7QXJyYXl9OiB0aGUgbGlzdCBvZiBub3RlIG5hbWVzIHRvIGJlIGRlY29kZWQgKGFsbCBieSBkZWZhdWx0KVxuICpcbiAqIEBleGFtcGxlXG4gKiB2YXIgU291bmRmb250ID0gcmVxdWlyZSgnc291bmRmb250LXBsYXllcicpXG4gKiBTb3VuZGZvbnQubG9hZEJ1ZmZlcnMoY3R4LCAnYWNvdXN0aWNfZ3JhbmRfcGlhbm8nKS50aGVuKGZ1bmN0aW9uKGJ1ZmZlcnMpIHtcbiAqICBidWZmZXJzWzYwXSAvLyA9PiBBbiA8QXVkaW9CdWZmZXI+IGNvcnJlc3BvbmRpbmcgdG8gbm90ZSBDNFxuICogfSlcbiAqL1xuZnVuY3Rpb24gbG9hZEJ1ZmZlcnMgKGFjLCBuYW1lLCBvcHRpb25zKSB7XG4gIGNvbnNvbGUud2FybignU291bmRmb250LmxvYWRCdWZmZXJzIGlzIGRlcHJlY2F0ZS4nKVxuICBjb25zb2xlLmxvZygnVXNlIFNvdW5kZm9udC5pbnN0cnVtZW50KC4uKSBhbmQgZ2V0IGJ1ZmZlcnMgcHJvcGVydGllcyBmcm9tIHRoZSByZXN1bHQuJylcbiAgcmV0dXJuIFNvdW5kZm9udC5pbnN0cnVtZW50KGFjLCBuYW1lLCBvcHRpb25zKS50aGVuKGZ1bmN0aW9uIChpbnN0KSB7XG4gICAgcmV0dXJuIGluc3QuYnVmZmVyc1xuICB9KVxufVxuU291bmRmb250LmxvYWRCdWZmZXJzID0gbG9hZEJ1ZmZlcnNcblxuLyoqXG4gKiBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBwbGF5cyBhbiBvc2NpbGxhdG9yXG4gKlxuICogQHBhcmFtIHtBdWRpb0NvbnRleHR9IGFjIC0gdGhlIGF1ZGlvIGNvbnRleHRcbiAqIEBwYXJhbSB7SGFzaH0gZGVmYXVsdE9wdGlvbnMgLSAoT3B0aW9uYWwpIGEgaGFzaCBvZiBvcHRpb25zOlxuICogLSB2Y29UeXBlOiB0aGUgb3NjaWxsYXRvciB0eXBlIChkZWZhdWx0OiAnc2luZScpXG4gKiAtIGdhaW46IHRoZSBvdXRwdXQgZ2FpbiB2YWx1ZSAoZGVmYXVsdDogMC40KVxuICAqIC0gZGVzdGluYXRpb246IHRoZSBwbGF5ZXIgZGVzdGluYXRpb24gKGRlZmF1bHQ6IGFjLmRlc3RpbmF0aW9uKVxuICovXG5mdW5jdGlvbiBvc2NpbGxhdG9yUGxheWVyIChjdHgsIGRlZmF1bHRPcHRpb25zKSB7XG4gIGRlZmF1bHRPcHRpb25zID0gZGVmYXVsdE9wdGlvbnMgfHwge31cbiAgcmV0dXJuIGZ1bmN0aW9uIChub3RlLCB0aW1lLCBkdXJhdGlvbiwgb3B0aW9ucykge1xuICAgIGNvbnNvbGUud2FybignVGhlIG9zY2lsbGF0b3IgcGxheWVyIGlzIGRlcHJlY2F0ZWQuJylcbiAgICBjb25zb2xlLmxvZygnU3RhcnRpbmcgd2l0aCB2ZXJzaW9uIDAuOS4wIHlvdSB3aWxsIGhhdmUgdG8gd2FpdCB1bnRpbCB0aGUgc291bmRmb250IGlzIGxvYWRlZCB0byBwbGF5IHNvdW5kcy4nKVxuICAgIHZhciBtaWRpID0gbm90ZSA+IDAgJiYgbm90ZSA8IDEyOSA/ICtub3RlIDogcGFyc2VyLm1pZGkobm90ZSlcbiAgICB2YXIgZnJlcSA9IG1pZGkgPyBwYXJzZXIubWlkaVRvRnJlcShtaWRpLCA0NDApIDogbnVsbFxuICAgIGlmICghZnJlcSkgcmV0dXJuXG5cbiAgICBkdXJhdGlvbiA9IGR1cmF0aW9uIHx8IDAuMlxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICB2YXIgZGVzdGluYXRpb24gPSBvcHRpb25zLmRlc3RpbmF0aW9uIHx8IGRlZmF1bHRPcHRpb25zLmRlc3RpbmF0aW9uIHx8IGN0eC5kZXN0aW5hdGlvblxuICAgIHZhciB2Y29UeXBlID0gb3B0aW9ucy52Y29UeXBlIHx8IGRlZmF1bHRPcHRpb25zLnZjb1R5cGUgfHwgJ3NpbmUnXG4gICAgdmFyIGdhaW4gPSBvcHRpb25zLmdhaW4gfHwgZGVmYXVsdE9wdGlvbnMuZ2FpbiB8fCAwLjRcblxuICAgIHZhciB2Y28gPSBjdHguY3JlYXRlT3NjaWxsYXRvcigpXG4gICAgdmNvLnR5cGUgPSB2Y29UeXBlXG4gICAgdmNvLmZyZXF1ZW5jeS52YWx1ZSA9IGZyZXFcblxuICAgIC8qIFZDQSAqL1xuICAgIHZhciB2Y2EgPSBjdHguY3JlYXRlR2FpbigpXG4gICAgdmNhLmdhaW4udmFsdWUgPSBnYWluXG5cbiAgICAvKiBDb25uZWN0aW9ucyAqL1xuICAgIHZjby5jb25uZWN0KHZjYSlcbiAgICB2Y2EuY29ubmVjdChkZXN0aW5hdGlvbilcblxuICAgIHZjby5zdGFydCh0aW1lKVxuICAgIGlmIChkdXJhdGlvbiA+IDApIHZjby5zdG9wKHRpbWUgKyBkdXJhdGlvbilcbiAgICByZXR1cm4gdmNvXG4gIH1cbn1cblxuLyoqXG4gKiBHaXZlbiBhIG5vdGUgbmFtZSwgcmV0dXJuIHRoZSBub3RlIG1pZGkgbnVtYmVyXG4gKlxuICogQG5hbWUgbm90ZVRvTWlkaVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gbm90ZU5hbWVcbiAqIEByZXR1cm4ge0ludGVnZXJ9IHRoZSBub3RlIG1pZGkgbnVtYmVyIG9yIG51bGwgaWYgbm90IGEgdmFsaWQgbm90ZSBuYW1lXG4gKi9cblNvdW5kZm9udC5ub3RlVG9NaWRpID0gcGFyc2VyLm1pZGlcblxubW9kdWxlLmV4cG9ydHMgPSBTb3VuZGZvbnRcbiIsImNvbnN0IENvbnN0YW50cyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJykuQ29uc3RhbnRzO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJykuVXRpbHM7XG5cbi8qKlxuICogQ2xhc3MgcmVwcmVzZW50aW5nIGEgdHJhY2suICBDb250YWlucyBtZXRob2RzIGZvciBwYXJzaW5nIGV2ZW50cyBhbmQga2VlcGluZyB0cmFjayBvZiBwb2ludGVyLlxuICovXG5jbGFzcyBUcmFja1x0e1xuXHRjb25zdHJ1Y3RvcihpbmRleCwgZGF0YSkge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5ldmVudEluZGV4ID0gMDtcblx0XHR0aGlzLnBvaW50ZXIgPSAwO1xuXHRcdHRoaXMubGFzdFRpY2sgPSAwO1xuXHRcdHRoaXMubGFzdFN0YXR1cyA9IG51bGw7XG5cdFx0dGhpcy5pbmRleCA9IGluZGV4O1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5kZWx0YSA9IDA7XG5cdFx0dGhpcy5ydW5uaW5nRGVsdGEgPSAwO1xuXHRcdHRoaXMuZXZlbnRzID0gW107XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXRzIGFsbCBzdGF0ZWZ1bCB0cmFjayBpbmZvcm1haW9uIHVzZWQgZHVyaW5nIHBsYXliYWNrLlxuXHQgKiBAcmV0dXJuIHtUcmFja31cblx0ICovXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5ldmVudEluZGV4ID0gMDtcblx0XHR0aGlzLnBvaW50ZXIgPSAwO1xuXHRcdHRoaXMubGFzdFRpY2sgPSAwO1xuXHRcdHRoaXMubGFzdFN0YXR1cyA9IG51bGw7XG5cdFx0dGhpcy5kZWx0YSA9IDA7XG5cdFx0dGhpcy5ydW5uaW5nRGVsdGEgPSAwO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhpcyB0cmFjayB0byBiZSBlbmFibGVkIGR1cmluZyBwbGF5YmFjay5cblx0ICogQHJldHVybiB7VHJhY2t9XG5cdCAqL1xuXHRlbmFibGUoKSB7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoaXMgdHJhY2sgdG8gYmUgZGlzYWJsZWQgZHVyaW5nIHBsYXliYWNrLlxuXHQgKiBAcmV0dXJuIHtUcmFja31cblx0ICovXG5cdGRpc2FibGUoKSB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgdHJhY2sgZXZlbnQgaW5kZXggdG8gdGhlIG5lYXJlc3QgZXZlbnQgdG8gdGhlIGdpdmVuIHRpY2suXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSB0aWNrXG5cdCAqIEByZXR1cm4ge1RyYWNrfVxuXHQgKi9cblx0c2V0RXZlbnRJbmRleEJ5VGljayh0aWNrKSB7XG5cdFx0dGljayA9IHRpY2sgfHwgMDtcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5ldmVudHMpIHtcblx0XHRcdGlmICh0aGlzLmV2ZW50c1tpXS50aWNrID49IHRpY2spIHtcblx0XHRcdFx0dGhpcy5ldmVudEluZGV4ID0gaTtcblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgYnl0ZSBsb2NhdGVkIGF0IHBvaW50ZXIgcG9zaXRpb24uXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldEN1cnJlbnRCeXRlKCkge1xuXHRcdHJldHVybiB0aGlzLmRhdGFbdGhpcy5wb2ludGVyXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGNvdW50IG9mIGRlbHRhIGJ5dGVzIGFuZCBjdXJyZW50IHBvaW50ZXIgcG9zaXRpb24uXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldERlbHRhQnl0ZUNvdW50KCkge1xuXHRcdC8vIEdldCBieXRlIGNvdW50IG9mIGRlbHRhIFZMVlxuXHRcdC8vIGh0dHA6Ly93d3cuY2Nhcmgub3JnL2NvdXJzZXMvMjUzL2hhbmRvdXQvdmx2L1xuXHRcdC8vIElmIGJ5dGUgaXMgZ3JlYXRlciBvciBlcXVhbCB0byA4MGggKDEyOCBkZWNpbWFsKSB0aGVuIHRoZSBuZXh0IGJ5dGVcblx0ICAgIC8vIGlzIGFsc28gcGFydCBvZiB0aGUgVkxWLFxuXHQgICBcdC8vIGVsc2UgYnl0ZSBpcyB0aGUgbGFzdCBieXRlIGluIGEgVkxWLlxuXHQgICBcdHZhciBjdXJyZW50Qnl0ZSA9IHRoaXMuZ2V0Q3VycmVudEJ5dGUoKTtcblx0ICAgXHR2YXIgYnl0ZUNvdW50ID0gMTtcblxuXHRcdHdoaWxlIChjdXJyZW50Qnl0ZSA+PSAxMjgpIHtcblx0XHRcdGN1cnJlbnRCeXRlID0gdGhpcy5kYXRhW3RoaXMucG9pbnRlciArIGJ5dGVDb3VudF07XG5cdFx0XHRieXRlQ291bnQrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gYnl0ZUNvdW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBkZWx0YSB2YWx1ZSBhdCBjdXJyZW50IHBvaW50ZXIgcG9zaXRpb24uXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdGdldERlbHRhKCkge1xuXHRcdHJldHVybiBVdGlscy5yZWFkVmFySW50KHRoaXMuZGF0YS5zdWJhcnJheSh0aGlzLnBvaW50ZXIsIHRoaXMucG9pbnRlciArIHRoaXMuZ2V0RGVsdGFCeXRlQ291bnQoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgZXZlbnQgd2l0aGluIGEgZ2l2ZW4gdHJhY2sgc3RhcnRpbmcgYXQgc3BlY2lmaWVkIGluZGV4XG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBjdXJyZW50VGlja1xuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGRyeVJ1biAtIElmIHRydWUgZXZlbnRzIHdpbGwgYmUgcGFyc2VkIGFuZCByZXR1cm5lZCByZWdhcmRsZXNzIG9mIHRpbWUuXG5cdCAqL1xuXHRoYW5kbGVFdmVudChjdXJyZW50VGljaywgZHJ5UnVuKSB7XG5cdFx0ZHJ5UnVuID0gZHJ5UnVuIHx8IGZhbHNlO1xuXG5cdFx0aWYgKGRyeVJ1bikge1xuXHRcdFx0dmFyIGVsYXBzZWRUaWNrcyA9IGN1cnJlbnRUaWNrIC0gdGhpcy5sYXN0VGljaztcblx0XHRcdHZhciBkZWx0YSA9IHRoaXMuZ2V0RGVsdGEoKTtcblx0XHRcdHZhciBldmVudFJlYWR5ID0gZWxhcHNlZFRpY2tzID49IGRlbHRhO1xuXG5cdFx0XHRpZiAodGhpcy5wb2ludGVyIDwgdGhpcy5kYXRhLmxlbmd0aCAmJiAoZHJ5UnVuIHx8IGV2ZW50UmVhZHkpKSB7XG5cdFx0XHRcdGxldCBldmVudCA9IHRoaXMucGFyc2VFdmVudCgpO1xuXHRcdFx0XHRpZiAodGhpcy5lbmFibGVkKSByZXR1cm4gZXZlbnQ7XG5cdFx0XHRcdC8vIFJlY3Vyc2l2ZWx5IGNhbGwgdGhpcyBmdW5jdGlvbiBmb3IgZWFjaCBldmVudCBhaGVhZCB0aGF0IGhhcyAwIGRlbHRhIHRpbWU/XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTGV0J3MgYWN0dWFsbHkgcGxheSB0aGUgTUlESSBmcm9tIHRoZSBnZW5lcmF0ZWQgSlNPTiBldmVudHMgY3JlYXRlZCBieSB0aGUgZHJ5IHJ1bi5cblx0XHRcdGlmICh0aGlzLmV2ZW50c1t0aGlzLmV2ZW50SW5kZXhdICYmIHRoaXMuZXZlbnRzW3RoaXMuZXZlbnRJbmRleF0udGljayA8PSBjdXJyZW50VGljaykge1xuXHRcdFx0XHR0aGlzLmV2ZW50SW5kZXgrKztcblx0XHRcdFx0aWYgKHRoaXMuZW5hYmxlZCkgcmV0dXJuIHRoaXMuZXZlbnRzW3RoaXMuZXZlbnRJbmRleCAtIDFdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBzdHJpbmcgZGF0YSBmcm9tIGV2ZW50LlxuXHQgKiBAcGFyYW0ge251bWJlcn0gZXZlbnRTdGFydEluZGV4XG5cdCAqIEByZXR1cm4ge3N0cmluZ31cblx0ICovXG5cdGdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KSB7XG5cdFx0dmFyIGN1cnJlbnRCeXRlID0gdGhpcy5wb2ludGVyO1xuXHRcdHZhciBieXRlQ291bnQgPSAxO1xuXHRcdHZhciBsZW5ndGggPSBVdGlscy5yZWFkVmFySW50KHRoaXMuZGF0YS5zdWJhcnJheShldmVudFN0YXJ0SW5kZXggKyAyLCBldmVudFN0YXJ0SW5kZXggKyAyICsgYnl0ZUNvdW50KSk7XG5cdFx0dmFyIHN0cmluZ0xlbmd0aCA9IGxlbmd0aDtcblxuXHRcdHJldHVybiBVdGlscy5ieXRlc1RvTGV0dGVycyh0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgYnl0ZUNvdW50ICsgMiwgZXZlbnRTdGFydEluZGV4ICsgYnl0ZUNvdW50ICsgbGVuZ3RoICsgMikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBldmVudCBpbnRvIEpTT04gYW5kIGFkdmFuY2VzIHBvaW50ZXIgZm9yIHRoZSB0cmFja1xuXHQgKiBAcmV0dXJuIHtvYmplY3R9XG5cdCAqL1xuXHRwYXJzZUV2ZW50KCkge1xuXHRcdHZhciBldmVudFN0YXJ0SW5kZXggPSB0aGlzLnBvaW50ZXIgKyB0aGlzLmdldERlbHRhQnl0ZUNvdW50KCk7XG5cdFx0dmFyIGV2ZW50SnNvbiA9IHt9O1xuXHRcdHZhciBkZWx0YUJ5dGVDb3VudCA9IHRoaXMuZ2V0RGVsdGFCeXRlQ291bnQoKTtcblx0XHRldmVudEpzb24udHJhY2sgPSB0aGlzLmluZGV4ICsgMTtcblx0XHRldmVudEpzb24uZGVsdGEgPSB0aGlzLmdldERlbHRhKCk7XG5cdFx0dGhpcy5sYXN0VGljayA9IHRoaXMubGFzdFRpY2sgKyBldmVudEpzb24uZGVsdGE7XG5cdFx0dGhpcy5ydW5uaW5nRGVsdGEgKz0gZXZlbnRKc29uLmRlbHRhO1xuXHRcdGV2ZW50SnNvbi50aWNrID0gdGhpcy5ydW5uaW5nRGVsdGE7XG5cdFx0ZXZlbnRKc29uLmJ5dGVJbmRleCA9IHRoaXMucG9pbnRlcjtcblxuXHRcdC8vZXZlbnRKc29uLnJhdyA9IGV2ZW50O1xuXHRcdGlmICh0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA9PSAweGZmKSB7XG5cdFx0XHQvLyBNZXRhIEV2ZW50XG5cblx0XHRcdC8vIElmIHRoaXMgaXMgYSBtZXRhIGV2ZW50IHdlIHNob3VsZCBlbWl0IHRoZSBkYXRhIGFuZCBpbW1lZGlhdGVseSBtb3ZlIHRvIHRoZSBuZXh0IGV2ZW50XG5cdFx0XHQvLyBvdGhlcndpc2UgaWYgd2UgbGV0IGl0IHJ1biB0aHJvdWdoIHRoZSBuZXh0IGN5Y2xlIGEgc2xpZ2h0IGRlbGF5IHdpbGwgYWNjdW11bGF0ZSBpZiBtdWx0aXBsZSB0cmFja3Ncblx0XHRcdC8vIGFyZSBiZWluZyBwbGF5ZWQgc2ltdWx0YW5lb3VzbHlcblxuXHRcdFx0c3dpdGNoKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXSkge1xuXHRcdFx0XHRjYXNlIDB4MDA6IC8vIFNlcXVlbmNlIE51bWJlclxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NlcXVlbmNlIE51bWJlcic7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwMTogLy8gVGV4dCBFdmVudFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1RleHQgRXZlbnQnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDAyOiAvLyBDb3B5cmlnaHQgTm90aWNlXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnQ29weXJpZ2h0IE5vdGljZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwMzogLy8gU2VxdWVuY2UvVHJhY2sgTmFtZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NlcXVlbmNlL1RyYWNrIE5hbWUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA0OiAvLyBJbnN0cnVtZW50IE5hbWVcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdJbnN0cnVtZW50IE5hbWUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA1OiAvLyBMeXJpY1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0x5cmljJztcblx0XHRcdFx0XHRldmVudEpzb24uc3RyaW5nID0gdGhpcy5nZXRTdHJpbmdEYXRhKGV2ZW50U3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgwNjogLy8gTWFya2VyXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnTWFya2VyJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA3OiAvLyBDdWUgUG9pbnRcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdDdWUgUG9pbnQnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5zdHJpbmcgPSB0aGlzLmdldFN0cmluZ0RhdGEoZXZlbnRTdGFydEluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDA5OiAvLyBEZXZpY2UgTmFtZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0RldmljZSBOYW1lJztcblx0XHRcdFx0XHRldmVudEpzb24uc3RyaW5nID0gdGhpcy5nZXRTdHJpbmdEYXRhKGV2ZW50U3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHgyMDogLy8gTUlESSBDaGFubmVsIFByZWZpeFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ01JREkgQ2hhbm5lbCBQcmVmaXgnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIDB4MjE6IC8vIE1JREkgUG9ydFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ01JREkgUG9ydCc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSBVdGlscy5ieXRlc1RvTnVtYmVyKFt0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgM11dKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDJGOiAvLyBFbmQgb2YgVHJhY2tcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdFbmQgb2YgVHJhY2snO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIDB4NTE6IC8vIFNldCBUZW1wb1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1NldCBUZW1wbyc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSBNYXRoLnJvdW5kKDYwMDAwMDAwIC8gVXRpbHMuYnl0ZXNUb051bWJlcih0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgMywgZXZlbnRTdGFydEluZGV4ICsgNikpKTtcblx0XHRcdFx0XHR0aGlzLnRlbXBvID0gZXZlbnRKc29uLmRhdGE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg1NDogLy8gU01UUEUgT2Zmc2V0XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnU01UUEUgT2Zmc2V0Jztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAweDU4OiAvLyBUaW1lIFNpZ25hdHVyZVxuXHRcdFx0XHRcdC8vIEZGIDU4IDA0IG5uIGRkIGNjIGJiXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnVGltZSBTaWduYXR1cmUnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5kYXRhID0gdGhpcy5kYXRhLnN1YmFycmF5KGV2ZW50U3RhcnRJbmRleCArIDMsIGV2ZW50U3RhcnRJbmRleCArIDcpO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi50aW1lU2lnbmF0dXJlID0gXCJcIiArIGV2ZW50SnNvbi5kYXRhWzBdICsgXCIvXCIgKyBNYXRoLnBvdygyLCBldmVudEpzb24uZGF0YVsxXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg1OTogLy8gS2V5IFNpZ25hdHVyZVxuXHRcdFx0XHRcdC8vIEZGIDU5IDAyIHNmIG1pXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnS2V5IFNpZ25hdHVyZSc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmRhdGEgPSB0aGlzLmRhdGEuc3ViYXJyYXkoZXZlbnRTdGFydEluZGV4ICsgMywgZXZlbnRTdGFydEluZGV4ICsgNSk7XG5cblx0XHRcdFx0XHRpZiAoZXZlbnRKc29uLmRhdGFbMF0gPj0gMCkge1xuXHRcdFx0XHRcdFx0ZXZlbnRKc29uLmtleVNpZ25hdHVyZSA9IENvbnN0YW50cy5DSVJDTEVfT0ZfRklGVEhTW2V2ZW50SnNvbi5kYXRhWzBdXTtcblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnRKc29uLmRhdGFbMF0gPCAwKSB7XG5cdFx0XHRcdFx0XHRldmVudEpzb24ua2V5U2lnbmF0dXJlID0gQ29uc3RhbnRzLkNJUkNMRV9PRl9GT1VSVEhTW01hdGguYWJzKGV2ZW50SnNvbi5kYXRhWzBdKV07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGV2ZW50SnNvbi5kYXRhWzFdID09IDApIHtcblx0XHRcdFx0XHRcdGV2ZW50SnNvbi5rZXlTaWduYXR1cmUgKz0gJyBNYWpvcic7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50SnNvbi5kYXRhWzFdID09IDEpIHtcblx0XHRcdFx0XHRcdGV2ZW50SnNvbi5rZXlTaWduYXR1cmUgKz0gJyBNaW5vcic7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMHg3RjogLy8gU2VxdWVuY2VyLVNwZWNpZmljIE1ldGEtZXZlbnRcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdTZXF1ZW5jZXItU3BlY2lmaWMgTWV0YS1ldmVudCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSBgVW5rbm93bjogJHt0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV0udG9TdHJpbmcoMTYpfWA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBsZW5ndGggPSB0aGlzLmRhdGFbdGhpcy5wb2ludGVyICsgZGVsdGFCeXRlQ291bnQgKyAyXTtcblx0XHRcdC8vIFNvbWUgbWV0YSBldmVudHMgd2lsbCBoYXZlIHZsdiB0aGF0IG5lZWRzIHRvIGJlIGhhbmRsZWRcblxuXHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMyArIGxlbmd0aDtcblxuXHRcdH0gZWxzZSBpZih0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA9PSAweGYwKSB7XG5cdFx0XHQvLyBTeXNleFxuXHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnU3lzZXgnO1xuXHRcdFx0dmFyIGxlbmd0aCA9IHRoaXMuZGF0YVt0aGlzLnBvaW50ZXIgKyBkZWx0YUJ5dGVDb3VudCArIDFdO1xuXHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMiArIGxlbmd0aDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBWb2ljZSBldmVudFxuXHRcdFx0aWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDwgMHg4MCkge1xuXHRcdFx0XHQvLyBSdW5uaW5nIHN0YXR1c1xuXHRcdFx0XHRldmVudEpzb24ucnVubmluZyA9IHRydWU7XG5cdFx0XHRcdGV2ZW50SnNvbi5ub3RlTnVtYmVyID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleF07XG5cdFx0XHRcdGV2ZW50SnNvbi5ub3RlTmFtZSA9IENvbnN0YW50cy5OT1RFU1t0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XV07XG5cdFx0XHRcdGV2ZW50SnNvbi52ZWxvY2l0eSA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXTtcblxuXHRcdFx0XHRpZiAodGhpcy5sYXN0U3RhdHVzIDw9IDB4OGYpIHtcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdOb3RlIG9mZic7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweDgwICsgMTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMubGFzdFN0YXR1cyA8PSAweDlmKSB7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnTm90ZSBvbic7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweDkwICsgMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucG9pbnRlciArPSBkZWx0YUJ5dGVDb3VudCArIDI7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFzdFN0YXR1cyA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdO1xuXG5cdFx0XHRcdGlmICh0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA8PSAweDhmKSB7XG5cdFx0XHRcdFx0Ly8gTm90ZSBvZmZcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdOb3RlIG9mZic7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweDgwICsgMTtcblx0XHRcdFx0XHRldmVudEpzb24ubm90ZU51bWJlciA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXTtcblx0XHRcdFx0XHRldmVudEpzb24ubm90ZU5hbWUgPSBDb25zdGFudHMuTk9URVNbdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdXTtcblx0XHRcdFx0XHRldmVudEpzb24udmVsb2NpdHkgPSBNYXRoLnJvdW5kKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAyXSAvIDEyNyAqIDEwMCk7XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMztcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4OWYpIHtcblx0XHRcdFx0XHQvLyBOb3RlIG9uXG5cdFx0XHRcdFx0ZXZlbnRKc29uLm5hbWUgPSAnTm90ZSBvbic7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweDkwICsgMTtcblx0XHRcdFx0XHRldmVudEpzb24ubm90ZU51bWJlciA9IHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXTtcblx0XHRcdFx0XHRldmVudEpzb24ubm90ZU5hbWUgPSBDb25zdGFudHMuTk9URVNbdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDFdXTtcblx0XHRcdFx0XHRldmVudEpzb24udmVsb2NpdHkgPSBNYXRoLnJvdW5kKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAyXSAvIDEyNyAqIDEwMCk7XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMztcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4YWYpIHtcblx0XHRcdFx0XHQvLyBQb2x5cGhvbmljIEtleSBQcmVzc3VyZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1BvbHlwaG9uaWMgS2V5IFByZXNzdXJlJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4YTAgKyAxO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5ub3RlID0gQ29uc3RhbnRzLk5PVEVTW3RoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXggKyAxXV07XG5cdFx0XHRcdFx0ZXZlbnRKc29uLnByZXNzdXJlID0gZXZlbnRbMl07XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMztcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4YmYpIHtcblx0XHRcdFx0XHQvLyBDb250cm9sbGVyIENoYW5nZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0NvbnRyb2xsZXIgQ2hhbmdlJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4YjAgKyAxO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5udW1iZXIgPSB0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV07XG5cdFx0XHRcdFx0ZXZlbnRKc29uLnZhbHVlID0gdGhpcy5kYXRhW2V2ZW50U3RhcnRJbmRleCArIDJdO1xuXHRcdFx0XHRcdHRoaXMucG9pbnRlciArPSBkZWx0YUJ5dGVDb3VudCArIDM7XG5cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA8PSAweGNmKSB7XG5cdFx0XHRcdFx0Ly8gUHJvZ3JhbSBDaGFuZ2Vcblx0XHRcdFx0XHRldmVudEpzb24ubmFtZSA9ICdQcm9ncmFtIENoYW5nZSc7XG5cdFx0XHRcdFx0ZXZlbnRKc29uLmNoYW5uZWwgPSB0aGlzLmxhc3RTdGF0dXMgLSAweGMwICsgMTtcblx0XHRcdFx0XHRldmVudEpzb24udmFsdWUgPSB0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4ICsgMV07XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMjtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YVtldmVudFN0YXJ0SW5kZXhdIDw9IDB4ZGYpIHtcblx0XHRcdFx0XHQvLyBDaGFubmVsIEtleSBQcmVzc3VyZVxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ0NoYW5uZWwgS2V5IFByZXNzdXJlJztcblx0XHRcdFx0XHRldmVudEpzb24uY2hhbm5lbCA9IHRoaXMubGFzdFN0YXR1cyAtIDB4ZDAgKyAxO1xuXHRcdFx0XHRcdHRoaXMucG9pbnRlciArPSBkZWx0YUJ5dGVDb3VudCArIDI7XG5cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmRhdGFbZXZlbnRTdGFydEluZGV4XSA8PSAweGVmKSB7XG5cdFx0XHRcdFx0Ly8gUGl0Y2ggQmVuZFxuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gJ1BpdGNoIEJlbmQnO1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5jaGFubmVsID0gdGhpcy5sYXN0U3RhdHVzIC0gMHhlMCArIDE7XG5cdFx0XHRcdFx0dGhpcy5wb2ludGVyICs9IGRlbHRhQnl0ZUNvdW50ICsgMztcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGV2ZW50SnNvbi5uYW1lID0gYFVua25vd24uICBQb2ludGVyOiAke3RoaXMucG9pbnRlci50b1N0cmluZygpfSAke2V2ZW50U3RhcnRJbmRleC50b1N0cmluZygpfSAke3RoaXMuZGF0YS5sZW5ndGh9YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZGVsdGEgKz0gZXZlbnRKc29uLmRlbHRhO1xuXHRcdHRoaXMuZXZlbnRzLnB1c2goZXZlbnRKc29uKTtcblxuXHRcdHJldHVybiBldmVudEpzb247XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHBvaW50ZXIgaGFzIHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgdHJhY2suXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn1cblx0ICovXG5cdGVuZE9mVHJhY2soKSB7XG5cdFx0aWYgKHRoaXMuZGF0YVt0aGlzLnBvaW50ZXIgKyAxXSA9PSAweGZmICYmIHRoaXMuZGF0YVt0aGlzLnBvaW50ZXIgKyAyXSA9PSAweDJmICYmIHRoaXMuZGF0YVt0aGlzLnBvaW50ZXIgKyAzXSA9PSAweDAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMuVHJhY2sgPSBUcmFjazsiLCIvKipcbiAqIENvbnRhaW5zIG1pc2Mgc3RhdGljIHV0aWxpdHkgbWV0aG9kcy5cbiAqL1xuY2xhc3MgVXRpbHMge1xuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHNpbmdsZSBieXRlIHRvIGEgaGV4IHN0cmluZy5cblx0ICogQHBhcmFtIHtudW1iZXJ9IGJ5dGVcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGljIGJ5dGVUb0hleChieXRlKSB7XG5cdFx0Ly8gRW5zdXJlIGhleCBzdHJpbmcgYWx3YXlzIGhhcyB0d28gY2hhcnNcblx0XHRyZXR1cm4gYDAke2J5dGUudG9TdHJpbmcoMTYpfWAuc2xpY2UoLTIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGFuIGFycmF5IG9mIGJ5dGVzIHRvIGEgaGV4IHN0cmluZy5cblx0ICogQHBhcmFtIHthcnJheX0gYnl0ZUFycmF5XG5cdCAqIEByZXR1cm4ge3N0cmluZ31cblx0ICovXG5cdHN0YXRpYyBieXRlc1RvSGV4KGJ5dGVBcnJheSkge1xuXHRcdHZhciBoZXggPSBbXTtcblx0XHRieXRlQXJyYXkuZm9yRWFjaChieXRlID0+IGhleC5wdXNoKFV0aWxzLmJ5dGVUb0hleChieXRlKSkpO1xuXHRcdHJldHVybiBoZXguam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBoZXggc3RyaW5nIHRvIGEgbnVtYmVyLlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gaGV4U3RyaW5nXG5cdCAqIEByZXR1cm4ge251bWJlcn1cblx0ICovXG5cdHN0YXRpYyBoZXhUb051bWJlcihoZXhTdHJpbmcpIHtcblx0XHRyZXR1cm4gcGFyc2VJbnQoaGV4U3RyaW5nLCAxNik7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYW4gYXJyYXkgb2YgYnl0ZXMgdG8gYSBudW1iZXIuXG5cdCAqIEBwYXJhbSB7YXJyYXl9IGJ5dGVBcnJheVxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRzdGF0aWMgYnl0ZXNUb051bWJlcihieXRlQXJyYXkpIHtcblx0XHRyZXR1cm4gVXRpbHMuaGV4VG9OdW1iZXIoVXRpbHMuYnl0ZXNUb0hleChieXRlQXJyYXkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhbiBhcnJheSBvZiBieXRlcyB0byBsZXR0ZXJzLlxuXHQgKiBAcGFyYW0ge2FycmF5fSBieXRlQXJyYXlcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGljIGJ5dGVzVG9MZXR0ZXJzKGJ5dGVBcnJheSkge1xuXHRcdHZhciBsZXR0ZXJzID0gW107XG5cdFx0Ynl0ZUFycmF5LmZvckVhY2goYnl0ZSA9PiBsZXR0ZXJzLnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZShieXRlKSkpO1xuXHRcdHJldHVybiBsZXR0ZXJzLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGVjaW1hbCB0byBpdCdzIGJpbmFyeSByZXByZXNlbnRhdGlvbi5cblx0ICogQHBhcmFtIHtudW1iZXJ9IGRlY1xuXHQgKiBAcmV0dXJuIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0aWMgZGVjVG9CaW5hcnkoZGVjKSB7XG4gICAgXHRyZXR1cm4gKGRlYyA+Pj4gMCkudG9TdHJpbmcoMik7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYSB2YXJpYWJsZSBsZW5ndGggdmFsdWUuXG5cdCAqIEBwYXJhbSB7YXJyYXl9IGJ5dGVBcnJheVxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRzdGF0aWMgcmVhZFZhckludChieXRlQXJyYXkpIHtcblx0XHR2YXIgcmVzdWx0ID0gMDtcblx0XHRieXRlQXJyYXkuZm9yRWFjaChudW1iZXIgPT4ge1xuXHRcdFx0dmFyIGIgPSBudW1iZXI7XG5cdFx0XHRpZiAoYiAmIDB4ODApIHtcblx0XHRcdFx0cmVzdWx0ICs9IChiICYgMHg3Zik7XG5cdFx0XHRcdHJlc3VsdCA8PD0gNztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8qIGIgaXMgdGhlIGxhc3QgYnl0ZSAqL1xuXHRcdFx0XHRyZXN1bHQgKz0gYjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVjb2RlcyBiYXNlLTY0IGVuY29kZWQgc3RyaW5nXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdHJpbmdcblx0ICogQHJldHVybiB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGljIGF0b2Ioc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiBhdG9iID09PSAnZnVuY3Rpb24nKSByZXR1cm4gYXRvYihzdHJpbmcpO1xuXHRcdHJldHVybiBuZXcgQnVmZmVyKHN0cmluZywgJ2Jhc2U2NCcpLnRvU3RyaW5nKCdiaW5hcnknKTtcblx0fVxufVxuXG5leHBvcnRzLlV0aWxzID0gVXRpbHM7Il19
