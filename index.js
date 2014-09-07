/**
 * Main patcher module — a function that takes LiveStyle
 * client instance and listens specific events.
 * Note: client must be already connected to server (or at least
 * connection should be initiated)
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var CommandQueue = require('./lib/command-queue');
	// TODO implement file loader interface in worker
	var worker = new Worker('./lib/worker.js');

	var queue = new CommandQueue(worker);

	var response = {
		'calculate-diff': function(client, data, command) {
			client.send('diff', {
				uri: command.data.uri,
				syntax: command.data.syntax,
				patches: data
			});
		},
		'apply-patch': function(client, data, command) {
			var resp = {
				uri: command.data.uri,
				content: data.content,
				ranges: data.ranges
			};

			if (data.hash) {
				resp.hash = data.hash;
			}

			client.send('patch', resp);
		},
		'initial-content': function(client, data, command) {}
	};

	/**
	 * Identifies itself as a patcher for LiveStyle server
	 * @param  {Client} client LiveStyle client instance
	 */
	function identify(client) {
		client.send('patcher-connect');
	}

	return function(client) {
		Object.keys(response).forEach(function(event) {
			client.on(event, function(data) {
				queue.add(event, data, function(status, responseData, command) {
					if (status !== 'ok') {
						return client.send('error', responseData);
					}
					response[event] && response[event](client, responseData, command);
				});
			});
		});

		client.on('connect', function() {
			identify(client);
		});
		if (client.connected) {
			identify(client);
		}
	};
});