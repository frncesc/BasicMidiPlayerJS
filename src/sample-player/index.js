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
