/**
 * Main patcher module — a function that takes LiveStyle
 * client instance and listens specific events.
 * Note: client must be already connected to server (or at least
 * connection should be initiated)
 */
var CommandQueue = require('./lib/command-queue');

var currentClient = null;
var response = {
	'calculate-diff': function(data, command) {
		currentClient.send('diff', {
			uri: command.data.uri,
			syntax: command.data.syntax,
			patches: data
		});
	},
	'apply-patch': function(data, command) {
		var resp = {
			uri: command.data.uri,
			content: data.content,
			ranges: data.ranges
		};

		if (data.hash) {
			resp.hash = data.hash;
		}

		currentClient.send('patch', resp);
	},
	'initial-content': function(data, command) {}
};

/**
 * Identifies itself as a patcher for LiveStyle server
 * @param  {Client} client LiveStyle client instance
 */
function identify(client) {
	currentClient.send('patcher-connect');
}

module.exports = function(client, options) {
	options = options || {};
	currentClient = client;

	var worker = new Worker(options.worker || './lib/worker.js');
	var queue = new CommandQueue(worker);

	worker.addEventListener('message', function(evt) {
		var payload = evt.data;
		if (typeof payload === 'string') {
			payload = JSON.parse(payload);
		}

		if (payload.name === 'request-files' && currentClient) {
			currentClient.send(payload.name, payload.data);
		}
	});

	Object.keys(response).forEach(function(event) {
		client.on(event, function(data) {
			queue.add(event, data, function(status, responseData, command) {
				if (status !== 'ok') {
					var err = {
						message: responseData,
						origin: {
							name: command.name
						}
					};

					if (command.data && command.data.uri) {
						err.origin.uri = command.data.uri;
					}

					return client.send('error', err);
				}
				response[event](responseData, command);
			});
		});
	});

	client
		.on('open', identify)
		.on('files', function(data) {
			worker.postMessage({
				name: 'files',
				data: data
			});
		});

	if (client.connected) {
		identify();
	}

	return queue;
};