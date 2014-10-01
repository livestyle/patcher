/**
 * Command queue batches patcher commands execution in worker
 * thread until currently running command is finished.
 *
 * Although Web Worker hosts has their own queue and 
 * batch `postMessage()` calls until workers’ event loop finish
 * execution, using custom queue has a very big advantage. 
 * For example, a burst of diff requests for the same file
 * can be squashed into a single command that will be sent to 
 * worker thread.
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var commandId = 0;

	function Command(name, data, callback) {
		this.id = 'command' + commandId++;
		this.name = name;
		this.data = data || {};
		this.callback = callback;
	}

	Command.prototype = {
		toJSON: function() {
			return {
				commandId: this.id,
				name: this.name,
				data: this.data
			};
		}
	};

	function similar(command, name, data) {
		return command.name === name && command.data.uri === data.uri;
	}

	function CommandQueue(worker) {
		if (!(this instanceof CommandQueue)) {
			return new CommandQueue(worker);
		}

		this.queue = [];
		this.expect = null;
		this.worker = worker;
		var self = this;
		worker.addEventListener('message', function(evt) {
			var payload = evt.data;
			var expect = self.expect;
			if (expect && expect.id === payload.commandId) {
				// received currently expected command
				expect.callback && expect.callback(payload.status, payload.data, expect);
				self.expect = null;
				self.next();
			}
		});
	}

	CommandQueue.prototype = {
		/**
		 * Add command to queue. Some commands can be optimized
		 * and merged into existing commands in queue
		 * @param {String} name Command name
		 * @param {Object} data Command payload
		 * @param {Function} callback Function to execute when
		 * command is finished
		 */
		add: function(name, data, callback) {
			data = data || {};
			// let’s see if given command can be optimized
			var optimized = false;
			if (name === 'calculate-diff') {
				// Optimize diff calculation: in most cases
				// this message will be sent very often, on every
				// single update by user. Thus, we don’t have to calculate
				// all updates, we need the most recent one
				this.queue.some(function(command) {
					if (similar(command, name, data) && !command.data.previous && !data.previous) {
						command.data = data;
						return optimized = true;
					}
				});
			} else if (name === 'apply-patch') {
				// Optimize patch apply: multiple patches for
				// the same document can be easily condensed
				// so there’s no need to parse & evaluate source
				// for every single patch
				this.queue.some(function(command) {
					if (similar(command, name, data)) {
						var patches = command.data.patches.concat(data.patches);
						command.data = data;
						command.data.patches = patches;
						return optimized = true;
					}
				});
			} else if (name === 'initial-content') {
				// For initial content, simply replace payload
				this.queue.some(function(command) {
					if (similar(command, name, data)) {
						command.data = data;
						return optimized = true;
					}
				});
			}

			if (!optimized) {
				this.queue.push(new Command(name, data, callback));
				this.next();
			}

			return this;
		},

		/**
		 * Runs next command in queue, if possible
		 */
		next: function() {
			if (!this.expect && this.queue.length) {
				this.expect = this.queue.shift();
				this.worker.postMessage(this.expect.toJSON());
			}
			return this;
		}
	};

	return CommandQueue;
});