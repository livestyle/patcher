/**
 * A worker for diff’ing and patching sources.
 * Designed to work in a separate thread as a Web Worker
 */
var commands = require('./commands');

// XXX hook on default worker interface
onmessage = handleMessage;
var replyFn = typeof postMessage === 'function' ? postMessage : function() {};

function sendMessage(message) {
	try {
		replyFn(message);
	} catch (e) {
		console.error(e);
		console.error(message);
	}
}

function handleMessage(evt) {
	commands((typeof evt.data === 'string') ? JSON.parse(evt.data) : evt.data, sendMessage);
}

sendMessage({
	name: 'init',
	data: 'Created LiveStyle worker with ' + commands.syntaxes().join(', ').toUpperCase() + ' syntaxes'
});

// expose interface for mocks and unit testing
module.exports = function(fn) {
	if (fn) {
		replyFn = fn;
	}
};

module.exports.postMessage = function(data) {
	handleMessage({data: data});
};