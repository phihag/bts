#!/usr/bin/env node
'use strict';

const zlib = require('zlib');

function main() {
	const argv = process.argv.slice(2);
	if (argv.length !== 1) {
		console.error('Usage: decode.js HEXDUMP'); // eslint-disable-line no-console
		process.exit(1);
	}
	const hex = argv[0].trim();

	const main_buf = new Buffer(hex, 'hex');
	const response_buf = zlib.gunzipSync(main_buf, {});
	const response_str = response_buf.toString('utf8');
	console.log(response_str); // eslint-disable-line no-console
}

main();
