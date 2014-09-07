var assert = require('assert');
var queue = require('../lib/command-queue');
var Worker = require('./shim/worker');

describe('Command Queue', function() {
	beforeEach(function() {
		Worker.emitter.removeAllListeners();
	});

	it('send commands', function() {
		var request = [];
		var response = [];
		var worker = new Worker();
		worker.on('postMessage', function(payload) {
			request.push(payload.name);
			this.emit('message', {data: {
				commandId: payload.commandId,
				status: 'ok',
				data: 'response ' + payload.name
			}});
		});

		queue(worker)
			.add('test1', {foo: 'bar'}, function(status, data) {
				response.push(data);
			})
			.add('test2', {foo2: 'bar2'}, function(status, data) {
				response.push(data);
			});

		assert.deepEqual(request, ['test1', 'test2']);
		assert.deepEqual(response, ['response test1', 'response test2']);
	});

	it('post-prone command', function(done) {
		var flow = [];
		var worker = new Worker();
		worker.on('postMessage', function(payload) {
			flow.push(payload.name);
			var self = this;
			setTimeout(function() {
				self.emit('message', {data: {
					commandId: payload.commandId,
					status: 'ok',
					data: 'response ' + payload.name
				}});
			}, 10);
		});

		queue(worker)
			.add('test1', {foo: 'bar'}, function(status, data) {
				flow.push(data);
			})
			.add('test2', {foo2: 'bar2'}, function(status, data) {
				flow.push(data);
			});

		setTimeout(function() {
			assert.deepEqual(flow, ['test1', 'response test1', 'test2', 'response test2']);
			done();
		}, 30);
	});

	it('optimize commands', function(done) {
		var flow = [];
		var worker = new Worker();
		worker.on('postMessage', function(payload) {
			var flowInput = payload.name;
			if (payload.name === 'calculate-diff') {
				flowInput += ' ' + payload.data.uri + ':' + payload.data.content;
			}

			flow.push(flowInput);
			var self = this;
			setTimeout(function() {
				self.emit('message', {data: {
					commandId: payload.commandId,
					status: 'ok',
					data: 'response ' + payload.name
				}});
			}, 5);
		});

		queue(worker)
			.add('test1', {foo: 'bar'}, function(status, data) {
				flow.push(data);
			})
			.add('calculate-diff', {uri: 'foo', content: 'a'}, function(status, data, command) {
				// should contain data from latter call
				flow.push(data + ' ' + command.data.uri + ':' + command.data.content);
			})
			.add('calculate-diff', {uri: 'bar', content: 'b'}, function(status, data, command) {
				flow.push(data + ' ' + command.data.uri + ':' + command.data.content);
			})
			.add('calculate-diff', {uri: 'foo', content: 'c'}, function(status, data, command) {
				// shouldn’t be called at all
				flow.push(data + ' ' + command.data.uri + ':' + command.data.content);
			});

		setTimeout(function() {
			assert.deepEqual(flow, ['test1', 'response test1', 
				'calculate-diff foo:c', 'response calculate-diff foo:c', 
				'calculate-diff bar:b', 'response calculate-diff bar:b']);
			done();
		}, 30);
	});
});