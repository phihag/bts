#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const zlib = require('zlib');

function main() {
	const parser = new argparse.ArgumentParser({});
	parser.addArgument('HEX', {help: 'input as a hex string ("raw" format in Wireshark)'});
	const args = parser.parseArgs();

	const hex = args.HEX.replace(/\s/, '');
	let main_buf = Buffer.from(hex, 'hex');

	let response_buf;
	try {
		response_buf = zlib.gunzipSync(main_buf, {});
	} catch(e) {
		if (e.code !== 'Z_DATA_ERROR') {
			throw e;
		}

		const len = main_buf.readInt32BE(0);
		try {
			response_buf = zlib.gunzipSync(main_buf.slice(4), {});
		} catch (_second_err) {
			throw e;
		}

		const actual_len = main_buf.length - 4;
		console.log(  // eslint-disable-line no-console
			`BTP packet, length ${len} ` +
			((len === actual_len) ? '(correct)' : `(INCORRECT! Actual length is ${actual_len})`) +
			':');
	}
	const response_str = response_buf.toString('utf8');
	console.log(response_str); // eslint-disable-line no-console
}

main();
