#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const zlib = require('zlib');

function main() {
	const parser = new argparse.ArgumentParser({});
	parser.addArgument('HEX', {help: 'input as a hex string ("raw" format in Wireshark)'});
	const args = parser.parseArgs();

	const hex = args.HEX.replace(/\s/, '');
	const main_buf = Buffer.from(hex, 'hex');

	const response_buf = zlib.gunzipSync(main_buf, {});
	const response_str = response_buf.toString('utf8');
	console.log(response_str); // eslint-disable-line no-console
}

main();
