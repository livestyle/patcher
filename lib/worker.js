/**
 * A worker for diff’ing and patching sources.
 * Designed to work in separate thread as a Web Worker
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var livestyle = require('livestyle');
	onmessage = function(evt) {
		var payload = (typeof evt.data === 'string') ? JSON.parse(evt.data) : evt.data;
		var data = payload.data;
		
	};
});