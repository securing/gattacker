var events = require('events');
var util = require('util');

var debug = require('debug')('primary-service');

var UuidUtil = require('./uuid-util');

function PrimaryService(options) {
  this.uuid = UuidUtil.removeDashes(options.uuid);
  //GATTacker
  this.startHandle = options.startHandle,
  this.endHandle = options.endHandle,

  this.characteristics = options.characteristics || [];
}

util.inherits(PrimaryService, events.EventEmitter);

PrimaryService.prototype.toString = function() {
  return JSON.stringify({
    uuid: this.uuid,
    characteristics: this.characteristics
  });
};

module.exports = PrimaryService;
