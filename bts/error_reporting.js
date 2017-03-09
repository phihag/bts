'use strict';

const child_process = require('child_process');
const path = require('path');

const utils = require('./utils');

function handle_error(err) {
	const msg_json = JSON.stringify({
		message: err.message,
		stack: '' + err.stack,
	});
	const report_exe = path.join(utils.root_dir(), 'div', 'report_error.js');
	child_process.spawn(
		'node', [report_exe, msg_json],
		{detached: true}
	);

	throw err;
}

function active(config) {
	return (config.report_errors === undefined) ? true : config.report_errors;
}

function setup(config) {
	if (active(config)) {
		process.on('uncaughtException', handle_error);
	}
}

module.exports = {
	active,
	setup,
};
