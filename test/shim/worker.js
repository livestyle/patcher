var EventEmitter = require('events').EventEmitter;
var util = require('util');
var path = require('path');

/** 
 * Web Worker shim
 */
function Worker(filename) {
	EventEmitter.call(this);

	if (filename) {
		var self = this;
		this._module = require(path.join(__dirname, '../../', filename));
		this._module(function(payload) {
			self.emit('message', {data: payload});
		});
	}

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
	this._module && this._module.postMessage(data);
	this.emit('postMessage', data);
};

module.exports = Worker;