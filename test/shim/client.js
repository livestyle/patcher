var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * LiveStyle client shim
 */
function Client() {
	EventEmitter.call(this);
}

util.inherits(Client, EventEmitter);

Client.prototype.connected = false;

Client.prototype.send = function(name, data) {
	this.emit(name, data);
};

Client.prototype.connect = function() {
	this.connected = true;
	this.emit('open');
}

module.exports = Client;