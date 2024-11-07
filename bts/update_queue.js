'use strict';

class update_queue {
	constructor() {
		this.queue = [];
		this.active = false;
	}

	async process() {
		if (this.active) {
			return;
		}
		this.active = true;
		while (this.queue.length > 0) {
			const { task, args, resolve, reject } = this.queue.shift();
			try {
				//console.log(`Execution of function: ${task.name}`);
				const res = await task(...args);
				resolve(res);
			} catch (err) {
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
}
const update_queue_inst = new update_queue();

function instance() {
	return update_queue_inst;
}

module.exports = {
	instance
};
