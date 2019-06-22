'use strict';

const child_process = require('child_process');
const path = require('path');

const utils = require('./utils');

var is_active = true;

function report(obj) {
	if (!is_active) {
		return;
	}
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
	console.error(message); // eslint-disable-line no-console
	report({
		message,
	});
}

const once_messages = new Set();
function silent_once(message) {
	if (once_messages.has(message)) return;
	once_messages.add(message);
	silent(message);
}

function active(config) {
	return (config.report_errors === undefined) ? true : config.report_errors;
}

function setup(config) {
	is_active = active(config);
	if (is_active) {
		process.on('uncaughtException', handle_error);
	}
}

module.exports = {
	active,
	silent,
	silent_once,
	setup,
};
