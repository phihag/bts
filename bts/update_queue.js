'use strict';

class update_queue {
	constructor() {
		this.queue = [];
		this.active = false;
		this.current_task = null;
		this.current_task_started_at = null;
		this.current_task_watchdog = null;
		this.hang_reporter = null;
	}

	_task_name(task) {
		if (!task) {
			return '<unknown>';
		}
		if (task._queue_name) {
			return task._queue_name;
		}
		return task.name && task.name.length > 0 ? task.name : '<anonymous>';
	}

	_task_hang_after_ms(task) {
		if (!task) {
			return 5000;
		}
		if (typeof task._queue_hang_after_ms === 'number' && task._queue_hang_after_ms > 0) {
			return task._queue_hang_after_ms;
		}
		return 5000;
	}

	_start_watchdog(task, task_name) {
		this._clear_watchdog();
		const hang_after_ms = this._task_hang_after_ms(task);
		this.current_task_watchdog = setTimeout(() => {
			const runtime_ms = this.current_task_started_at ? (Date.now() - this.current_task_started_at) : null;
			const payload = {
				task: task_name,
				runtime_ms,
				queue_length: this.queue.length
			};
			console.warn('[bts] update_queue:task_still_running', payload);
			if (typeof this.hang_reporter === 'function') {
				try {
					this.hang_reporter(payload);
				} catch (err) {
					console.warn('[bts] update_queue:hang_reporter_error', err && (err.stack || err.message || String(err)));
				}
			}
		}, hang_after_ms);
	}

	_clear_watchdog() {
		if (this.current_task_watchdog) {
			clearTimeout(this.current_task_watchdog);
			this.current_task_watchdog = null;
		}
	}

	async process() {
		if (this.active) {
			return;
		}
		this.active = true;
		while (this.queue.length > 0) {
			const { task, args, resolve, reject } = this.queue.shift();
			const task_name = this._task_name(task);
			this.current_task = task_name;
			this.current_task_started_at = Date.now();
			this._start_watchdog(task, task_name);
			try {
				const res = await task(...args);
				this._clear_watchdog();
				this.current_task = null;
				this.current_task_started_at = null;
				resolve(res);
			} catch (err) {
				this._clear_watchdog();
				this.current_task = null;
				this.current_task_started_at = null;
				reject(err);
			}
		}
		this.active = false;
	}

	async execute(task, ...args) {
		return new Promise((resolve, reject) => {
			this.queue.push({ task, args, resolve, reject });
			this.process();
		});
	}

	set_hang_reporter(fn) {
		this.hang_reporter = fn;
	}
}
const update_queue_inst = new update_queue();

function instance() {
	return update_queue_inst;
}

function named(name, task) {
	task._queue_name = name;
	return task;
}

function hang_after(ms, task) {
	task._queue_hang_after_ms = ms;
	return task;
}

module.exports = {
	instance,
	named,
	hang_after
};
