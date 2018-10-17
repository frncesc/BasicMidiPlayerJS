const Player = require('./player');
const Soundfont = require('./soundfont-player/index');
//const AcousticGrandPiano = require('./soundfonts/acoustic_grand_piano-mp3');

module.exports = {
    Player: Player.Player,
    Soundfont: Soundfont.Soundfont,
    //AcousticGrandPiano
}

