/**
 * A worker for diff’ing and patching sources.
 * Designed to work in separate thread as a Web Worker
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
} else if (typeof define !== 'function') {
	var define = function(fn) {
		fn(function(){}, {});
	};
}

define(function(require, exports, module) {
	var livestyle = require('emmet-livestyle');
	var fileLoader = require('./file-loader');

	function sendMessage(message) {
		if (typeof postMessage === 'function') {
			try {
				postMessage(message);
			} catch (e) {
				console.error(e);
				console.error(message);
			}
		}
	}

	function extend(obj) {
		for (var i = 1, il = arguments.length, src; i < il; i++) {
			if (src = arguments[i]) {
				Object.keys(src).forEach(function(key) {
					obj[key] = src[key];
				});
			}
		}
		return obj;
	}

	/**
	 * Resolver options factory
	 * @param  {Object} data Options coming from server
	 * @return {Object}
	 */
	function resolverOptions(data) {
		return extend({loader: fileLoader.request(postMessage)}, data);
	}

	function CommandContext(payload) {
		this.id = payload.commandId;
		this.name = payload.name;
		this.data = payload.data;
	}

	CommandContext.prototype = {
		reply: function(status, data) {
			sendMessage({
				commandId: this.id,
				status: status,
				data: data
			});
		},

		success: function(data) {
			this.reply('ok', data);
		},

		error: function(message) {
			if (message instanceof Error) {
				message = message.message + '\n' + message.stack;
			}
			
			this.reply('error', message);
		}
	};

	function assertPayload(ctx) {
		var data = ctx.data;
		if (!data) {
			return ctx.error('No data');
		}

		if (!data.syntax) {
			data.syntax = 'css';
		}

		if (!livestyle.supports(data.syntax)) {
			return ctx.error('Syntax ' + data.syntax + ' is not supported');
		}

		return true;
	}

	/**
	 * Calculates diff between two sources
	 * @param {CommandContext} ctx Command execution context
	 */
	function calculateDiff(ctx) {
		if (!assertPayload(ctx)) {
			return;
		}

		var data = ctx.data;

		// Get previous state. Do it before current source
		// resolving because cached initial state will be replaced with
		// current source
		var prev = null;
		if ('previous' in data) {
			prev = data.previous;
		} else {
			var cachedItem = livestyle.cache.get(data.uri);
			prev = cachedItem ? cachedItem.source : null;
		}

		var options = resolverOptions(data);

		// Resolve current state.
		// Do so before checking previous state to make sure current state
		// will be in cache even if we can’t actually diff sources
		livestyle.resolve(data.content || '', options, function(err, curTree) {
			if (err) {
				return ctx.error('Error parsing current state of ' + data.uri + ':\n' + err);
			}

			// resolve previous state
			if (!prev && prev !== '') {
				// no previous state
				return ctx.error('Can’t diff: no previous state for ' + data.uri);
			}

			livestyle.resolve(prev, options, function(err, prevTree) {
				if (err) {
					return ctx.error('Error parsing previous state of ' + data.uri + ':\n' + err);
				}

				// make sure current source is in cache
				livestyle.cache.add(data.uri, curTree, data.hash);

				// we have two sources, let’s diff’em
				try {
					ctx.success(livestyle.diff(prevTree, curTree).map(function(patch) {
						return patch.toJSON();
					}));
				} catch (err) {
					ctx.error(err);
				}
			});
		});
	}

	/**
	 * Applies patch on given source code
	 * @param  {CommandContext} ctx Command execution context
	 */
	function applyPatch(ctx) {
		if (!assertPayload(ctx)) {
			return;
		}
		var data = ctx.data;
		var options = resolverOptions(data);
		livestyle.resolve(data.content || '', options, function(err, tree) {
			if (err) {
				return ctx.error('Unable to apply patch on ' + data.uri + ':\n' + err);
			}

			try {
				livestyle.condensePatches(data.patches).forEach(function(patch) {
					livestyle.patch(tree, patch, data);
				});
				
				ctx.success({
					content: tree.ref.source.valueOf(),
					ranges: tree.ref.source.changeset,
					hash: data.hash
				});
			} catch (err) {
				ctx.error(err);
			}
		});
	}

	/**
	 * Sets initial content for given file
	 * @param  {CommandContext} ctx Command execution context
	 */
	function setInitialContent(ctx) {
		if (!assertPayload(ctx)) {
			return;
		}
		var data = ctx.data;
		var options = resolverOptions(data);
		livestyle.resolve(data.content || '', options, function(err, tree) {
			if (err) {
				return ctx.error('Unable to parse initial content of ' + data.uri + ':\n' + err);
			}

			livestyle.cache.add(data.uri, tree, data.hash);
			ctx.success();
		});
	}

	sendMessage({
		name: 'init',
		data: 'Created LiveStyle worker with ' + livestyle.syntaxes().join(', ').toUpperCase() + ' syntaxes'
	});

	// XXX hook on worker events
	onmessage = function(evt) {
		var payload = (typeof evt.data === 'string') ? JSON.parse(evt.data) : evt.data;
		var ctx = new CommandContext(payload);
		switch (ctx.name) {
			case 'calculate-diff':
				return calculateDiff(ctx);
			case 'apply-patch':
				return applyPatch(ctx);
			case 'initial-content':
				return setInitialContent(ctx);
			case 'files':
				return fileLoader.respond(ctx.data);
		}
	};

	// expose interface for mocks and unit testing
	exports = function(data) {
		onmessage({data: data});
	};

	exports.shimPostMessage = function(fn) {
		postMessage = fn;
	};
	return exports;
});