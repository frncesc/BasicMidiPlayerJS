'use strict'

const player = require('./player')
const events = require('./events')
const notes = require('./notes')
const scheduler = require('./scheduler')
//const midi = require('./midi')

function SamplePlayer(ac, source, options) {
  //return midi(scheduler(notes(events(player(ac, source, options)))))
  return scheduler(notes(events(player(ac, source, options))))
}

module.exports = { SamplePlayer }
