global.Worker = require('./shim/worker');
var assert = require('assert');
var livestyle = require('emmet-livestyle');
var patcher = require('../');
var fileLoader = require('../lib/file-loader');
var Client = require('./shim/client');

describe('File Loader', function() {
	fileLoader.timeout(100);

	beforeEach(function() {
		livestyle.cache.reset();
	});

	function createClient() {
		var client = (new Client()).on('request-files', function(data) {
			var self = this;
			setTimeout(function() {
				self.emit('files', {
					token: data.token,
					files: [{
						uri: '/dep.less',
						content: '@v2: 12;'
					}]
				});
			}, 1);
		});
		patcher(client);
		return client;
	}

	it('diff', function(done) {
		createClient()
			.on('diff', function(data) {
				assert.deepEqual(data.patches[0].update, [{name: 'foo', value: '13'}])
				done();
			})
			.emit('calculate-diff', {
				uri:      '/demo.less',
				syntax:   'less',
				previous: '@v:1; a{foo:@v}',
				content:  '@import dep; @v:1; a{foo:@v+@v2}'
			});
	});

	it('initial & diff', function(done) {
		var client = createClient();
		
		client.on('diff', function(data) {
			// diff should be empty since both states resolve
			// to the same CSS
			assert.equal(data.patches.length, 0);
			done();
		});

		client.emit('initial-content', {
			uri:     '/demo.less',
			syntax:  'less',
			content: '@import dep; @v:1; a{foo:@v+@v2}'
		});
		client.emit('calculate-diff', {
			uri:     '/demo.less',
			syntax:  'less',
			content: 'a{foo:13}'
		});
	});

	it('patch', function(done) {
		var patch = {
			"path": [["a",1]],
			"action": "update", 
			"update":[{"name":"foo","value":"14"}],
			"remove":[]
		};

		createClient()
			.on('patch', function(data) {
				assert.equal(data.content, '@import dep; @v:1; a{foo:@v + @v2 + 1}');
				done();
			})
			.emit('apply-patch', {
				uri:     '/demo.less',
				syntax:  'less',
				content: '@import dep; @v:1; a{foo:@v + @v2}',
				patches: [patch]
			});
	});

	it('kill hanging requests', function(done) {
		// do not respond on file requests
		var client = new Client();
		patcher(client);

		client
			.on('diff', function(data) {
				assert.deepEqual(data.patches[0].update, [{name: 'foo', value: '1@v2'}])
				done();
			})
			.emit('calculate-diff', {
				uri:      '/demo.less',
				syntax:   'less',
				previous: '@v:1; a{foo:@v}',
				content:  '@import dep; @v:1; a{foo:@v+@v2}'
			});
	});
});