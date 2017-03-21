'use strict';

const child_process = require('child_process');
const path = require('path');

const utils = require('./utils');

function report(obj) {
	const obj_json = JSON.stringify(obj);
	const report_exe = path.join(utils.root_dir(), 'div', 'report_error.js');
	child_process.spawn(
		'node', [report_exe, obj_json],
		{detached: true}
	);
}

function handle_error(err) {
	report({
		message: err.message,
		stack: '' + err.stack,
	});
	throw err;
}

function silent(message) {
	console.error(message);
	report({
		message,
	});
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
	silent,
	setup,
};
