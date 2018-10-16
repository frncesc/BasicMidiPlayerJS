/*jshint node: true */
'use strict';
module.exports = function (grunt) {
  var version = require("./package.json").version;

  grunt.initConfig({
    browserify: {
      all: {
        files: {
          'dist/basic-midi-player.js': ['src/index.js']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-browserify');

  grunt.registerTask('build', ['browserify']);
  grunt.registerTask('default', ['build']);
}