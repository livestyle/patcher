global.Worker = require('./shim/worker');
var assert = require('assert');
var patcher = require('../');
var Client = require('./shim/client');

describe('Patcher', function() {
	it('identify itself', function() {
		// disconnected client
		var client = new Client();
		var identified = false;
		client.on('patcher-connect', function() {
			identified = true;
		});

		patcher(client);
		client.connect();
		assert(identified);

		// connected client
		identified = false;
		client = new Client();
		client.on('patcher-connect', function() {
			identified = true;
		});
		client.connected = true;
		patcher(client);
		assert(identified);
	});

	it('diff', function() {
		var diff = null;
		var client = new Client();
		patcher(client);
		
		client
			.on('diff', function(data) {
				diff = data;
			})
			.emit('calculate-diff', {
				uri:      'demo.less',
				syntax:   'less',
				previous: '@v:1; a{foo:@v}',
				content:  '@v:1; a{foo:@v+1}'
			});

		assert(diff);
		assert.equal(diff.uri, 'demo.less');
		assert.equal(diff.syntax, 'less');
		assert.equal(diff.patches.length, 1);

		var patch = diff.patches[0];
		assert.deepEqual(patch.path, [['a', 1]]);
		assert.deepEqual(patch.update, [{name: 'foo', value: '2'}]);
		assert.deepEqual(patch.remove, []);
	});

	it('initial & diff', function() {
		var diff = null;
		var client = new Client();
		patcher(client);
		
		client.on('diff', function(data) {
			diff = data;
		});

		client.emit('initial-content', {
			uri:     'demo.less',
			syntax:  'less',
			content: '@v:1; a{foo:@v}'
		});
		client.emit('calculate-diff', {
			uri:     'demo.less',
			syntax:  'less',
			content: '@v:1; a{foo:@v+1}'
		});

		assert(diff);
		assert.equal(diff.uri, 'demo.less');
		assert.equal(diff.syntax, 'less');
		assert.equal(diff.patches.length, 1);

		var patch = diff.patches[0];
		assert.deepEqual(patch.path, [['a', 1]]);
		assert.deepEqual(patch.update, [{name: 'foo', value: '2'}]);
		assert.deepEqual(patch.remove, []);
	});

	it('patch', function() {
		var patch = {
			"path": [["a",1]],
			"action": "update", 
			"update":[{"name":"foo","value":"2"}],
			"remove":[]
		};

		var patched = null;
		var client = new Client();
		patcher(client);

		client.on('patch', function(data) {
			patched = data;
		});
		
		client.emit('apply-patch', {
			uri:     'demo.less',
			syntax:  'less',
			content: '@v:1; a{foo:@v}',
			patches: [patch]
		});

		assert(patched);
		assert.equal(patched.uri, 'demo.less');
		assert.equal(patched.content, '@v:1; a{foo:@v + 1}');
		assert.deepEqual(patched.ranges, [[12, 14, '@v + 1']]);
	});
});