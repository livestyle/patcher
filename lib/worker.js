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

	function CommandContext(payload) {
		this.id = payload.commandId;
		this.name = payload.name;
		this.data = payload.data;
	}

	CommandContext.prototype = {
		reply: function(status, data) {
			postMessage({
				commandId: this.id,
				status: 'error',
				data: data
			});
		},

		success: function(data) {
			this.reply('ok', data);
		},

		error: function(message) {
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
		var prev = ('previous' in data) 
			? data.previous 
			: livestyle.cache.get(data.uri);

		// Resolve current state.
		// Do so before checking previous state to make sure current state
		// will be in cache even if we can’t actually diff sources
		livestyle.resolve(data.content || '', data, function(err, curTree) {
			if (err) {
				return ctx.error('Error parsing current state of ' + data.uri + ': ' + err);
			}

			// resolve previous state
			if (!prev && prev !== '') {
				// no previous state
				return ctx.error('Can’t diff: no previous state for ' + data.uri);
			}

			livestyle.resolve(prev, data, function(err, prevTree) {
				if (err) {
					return ctx.error('Error parsing previous state of ' + data.uri + ': ' + err);
				}

				// we have two sources, let’s diff’em
				try {
					ctx.success(livestyle.diff(prevTree, curTree));
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
		livestyle.resolve(data.content || '', data, function(err, tree) {
			if (err) {
				return ctx.error('Unable to apply patch: ' + err);
			}

			try {
				tree = livestyle.patch(tree, data.patches, data);
				ctx.success({
					content: tree.source.valueOf(),
					ranges: tree.source.changeset,
					hash: data.hash
				});
			} catch (err) {
				ctx.error(err);
			}
		});
	}

	// XXX hook on worker events
	onmessage = function(evt) {
		var payload = (typeof evt.data === 'string') ? JSON.parse(evt.data) : evt.data;
		var ctx = new CommandContext(payload);
		switch (ctx.name) {
			case 'calculate-diff':
				return calculateDiff(ctx);
			case 'apply-patch':
				return applyPatch(ctx);
		}
	};
});