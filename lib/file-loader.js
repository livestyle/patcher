/**
 * A file loader module: requests given file list and watches
 * for “hanging” callbacks in case if no one replies on request
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var timerId = null;
	var waitTimeout = 3000; // milliseconds
	var requests = {};

	function uuid() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = (Math.random() * 0x10) | 0;
			var v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	function watch() {
		if (!timerId) {
			timerId = setTimeout(resolveHungRequests, waitTimeout);
		}
	}

	function resolveHungRequests() {
		var now = Date.now();
		Object.keys(requests).forEach(function(id) {
			var req = requests[id];
			if (req.wait < now) {
				req.callback([]);
				delete requests[id];
			}
		});

		timerId = null;
		if (Object.keys(requests).length) {
			watch();
		}
	}

	return {
		/**
		 * A dependency loader for LiveStyle engine: uses external
		 * web socket connection to retrieve requested files from
		 * file system 
		 * @param  {Array} file List of files to load
		 * @param  {Function} callback
		 */
		request: function(sendCommand) {
			return function(files, callback) {
				var requestId = uuid();
				requests[requestId] = {
					wait: Date.now() + waitTimeout,
					callback: callback
				};
				// waiting for `files` reply from server 
				// (see `onmessage()` handler)
				sendCommand({
					name: 'request-files',
					data: {
						token: requestId,
						files: files
					}
				});
				watch();
			};
		},

		/**
		 * Handle `file` message from server
		 * @param  {Object} data Message payload
		 */
		respond: function(data) {
			if (data.token && requests[data.token]) {
				var callback = requests[data.token].callback;
				callback(data.files);
				delete requests[data.token];
			}
		},

		/**
		 * Get or set timeout to kill hung file requests
		 * @param  {Number} value New timeout value, milliseconds
		 * @return {Number}       Current timeout value, milliseconds
		 */
		timeout: function(value) {
			if (typeof value !== 'undefined') {
				waitTimeout = +value;
			}
			return waitTimeout;
		}
	}
});