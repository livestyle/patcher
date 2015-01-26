/**
 * Runs given LiveStyle commands in worker context
 */
var livestyle = require('emmet-livestyle');
var fileLoader = require('./file-loader');
var eventMixin = require('./event-mixin');

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
function resolverOptions(data, callback) {
	return extend({loader: fileLoader.request(callback)}, data);
}

function emit(name, data) {
	module.exports.emit(name, data);
}

function CommandContext(payload, callback) {
	this.id = payload.commandId;
	this.name = payload.name;
	this.data = payload.data;
	this.callback = callback;
}

CommandContext.prototype = {
	reply: function(status, data) {
		this.callback({
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

function diff(ctx, callback) {
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

	var options = resolverOptions(data, callback);

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
				var patches = livestyle.diff(prevTree, curTree);
				emit('diff', {
					uri: data.uri,
					cur: curTree,
					prev: prevTree,
					patches: patches
				});

				ctx.success(patches.map(function(patch) {
					return patch.toJSON();
				}));
			} catch (err) {
				ctx.error(err);
			}
		});
	});
}

function patch(ctx, callback) {
	var data = ctx.data;
	var options = resolverOptions(data, callback);
	livestyle.resolve(data.content || '', options, function(err, tree) {
		if (err) {
			return ctx.error('Unable to apply patch on ' + data.uri + ':\n' + err);
		}

		try {
			livestyle.condensePatches(data.patches).forEach(function(patch) {
				livestyle.patch(tree, patch, data);
			});
			
			emit('patch', {
				uri: data.uri,
				tree: tree
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

function initialContent(ctx, callback) {
	var data = ctx.data;
	var options = resolverOptions(data, callback);
	livestyle.resolve(data.content || '', options, function(err, tree) {
		if (err) {
			return ctx.error('Unable to parse initial content of ' + data.uri + ':\n' + err);
		}

		livestyle.cache.add(data.uri, tree, data.hash);
		emit('initial-content', {
			uri: data.uri,
			tree: tree
		});
		ctx.success();
	});
}

function wrapCtx(fn) {
	return function(payload, callback) {
		var ctx = new CommandContext(payload, callback);
		if (assertPayload(ctx)) {
			fn(ctx, callback);
		}
	};
}

module.exports = function(payload, callback) {
	switch (payload.name) {
		case 'calculate-diff':
			return module.exports.diff(payload, callback);
		case 'apply-patch':
			return module.exports.patch(payload, callback);
		case 'initial-content':
			return module.exports.initialContent(payload, callback);
		case 'files':
			return module.exports.files(payload, callback);
	}
};

module.exports.livestyle = livestyle;
module.exports.diff = wrapCtx(diff);
module.exports.patch = wrapCtx(patch);
module.exports.initialContent = wrapCtx(initialContent);
module.exports.files = function(payload) {
	var ctx = new CommandContext(payload);
	return fileLoader.respond(ctx.data);
};
module.exports.syntaxes = function() {
	return livestyle.syntaxes();
};

extend(module.exports, eventMixin);