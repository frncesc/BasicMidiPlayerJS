define([
    './player',
    './soundfont-player/index',
    './utils',
    './constants',
    './audio-loader/index',
    './sample-player/index'
], function (Player, Soundfont, Utils, Constants, load, SamplePlayer) {
    return {
        Player: Player.Player,
        Soundfont: Soundfont.Soundfont,
        Utils: Utils.Utils,
        Constants: Constants.Constants,
        load: load.load,
        SamplePlayer: SamplePlayer.SamplePlayer,

    }
})

/*
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
*/
