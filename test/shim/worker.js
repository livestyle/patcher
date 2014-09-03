var EventEmitter = require('events').EventEmitter;
var util = require('util');

/** 
 * Web Worker shim
 */
function Worker() {
	EventEmitter.call(this);
	this.listeners = {};
	Worker.emitter.emit('create', this);
}

util.inherits(Worker, EventEmitter);
Worker.emitter = new EventEmitter();

Worker.prototype.addEventListener = function(name, callback) {
	return this.on(name, callback);
};

Worker.prototype.removeEventListener = function(name, callback) {
	return this.removeListener(name, callback);
};

Worker.prototype.postMessage = function(data) {
	Worker.emitter.emit('message', data, this);
	this.emit('postMessage', data);
};

module.exports = Worker;