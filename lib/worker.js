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
		handleMesage(payload);
	};

	/**
	 * Returns error to parent controller
	 * @param  {String} msg Error message
	 */
	function error(commandId, message) {
		postMessage({
			commandId: commandId,
			status: 'error',
			data: message
		});
	}

	/**
	 * Returns success to parent controller
	 * @param  {String} msg Error message
	 */
	function success(commandId, data) {
		postMessage({
			commandId: commandId,
			status: 'ok',
			data: data
		});
	}

	function calculateDiff(commandId, payload) {
		if (!payload) {
			return error(commandId, 'No payload');
		}

		if (!payload.syntax) {
			payload.syntax = 'css';
		}

		if (!livestyle.supports(payload.syntax)) {
			return error(commandId, 'Syntax ' + payload.syntax + ' is not supported');
		}

		var prev = ('previous' in options) 
			? options.previous 
			: livestyle.cache.get(options.uri);

		if (!prev && prev !== '') {
			// no previous state
			return error(commandId, 'Can’t diff: no previous state for ' + options.uri);
		}

		// resolve previous state
		livestyle.resolve(prev, options, function(err, prevTree) {
			if (err) {
				return error(commandId, 'Error parsing previous state of ' + options.uri + ': ' + err);
			}

			// resolve current state
			livestyle.resolve(payload.content || '', payload, function(err, curTree) {
				if (err) {
					return error(commandId, 'Error parsing current state of ' + options.uri + ': ' + err);
				}

				// we have two sources, let’s diff’em
				success(commandId, livestyle.diff(prevTree, curTree));
			});
		});
	}

	function handleMesage(message) {
		switch (message.name) {
			case 'calculate-diff':
				return calculateDiff(message.commandId, message.data);
		}
	}
});