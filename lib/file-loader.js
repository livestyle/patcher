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
		var s = [], itoh = '0123456789ABCDEF';
		
		// Make array of random hex digits. The UUID only has 32 digits in it, but we
		// allocate an extra items to make room for the '-'s we'll be inserting.
		for (var i = 0; i <36; i++) {
			s[i] = Math.floor(Math.random()*0x10);
		}

		// Conform to RFC-4122, section 4.4
		s[14] = 4;  // Set 4 high bits of time_high field to version
		s[19] = (s[19] & 0x3) | 0x8;  // Specify 2 high bits of clock sequence

		// Convert to hex chars
		for (i = 0; i <36; i++) {
			s[i] = itoh[s[i]];
		}

		// Insert '-'s
		s[8] = s[13] = s[18] = s[23] = '-';

		return s.join('');
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