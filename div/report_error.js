#!/usr/bin/env node
'use strict';

const assert = require('assert');
const https = require('https');
const url = require('url');


const REPORT_URL = 'https://aufschlagwechsel.de/bupbug/';

function main() {
	const argv = process.argv.slice(2);
	if (argv.length !== 1) {
		console.error('Usage: report_error.js ERROR_JSON');
		process.exit(2);
	}

	const obj = JSON.parse(argv[0]);
	if (! obj) {
		console.error('Cannot parse JSON');
		process.exit(3);
	}

	obj.bts_type = 'server';
	obj._type = 'bts-error';

	const json = JSON.stringify(obj);

	const parsed_url = url.parse(REPORT_URL);
	assert(parsed_url.protocol === 'https:');

	const options = {
		host: parsed_url.hostname,
		port: (parsed_url.port ? parsed_url.port : 443),
		path: parsed_url.path,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(json),
		}
  	};

	const post_req = https.request(options, function(res) {
		let data = '';

		if (res.statusCode != 200) {
			console.error('Error reporting failed with HTTP code ' + res.statusCode);
			process.exit(5);
		}

		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			data += chunk;
		});
		res.on('end', function () {
			const response = JSON.parse(data);
			if (!response) {
				console.error('Error reporting failed, server did not send valid response');
				process.exit(7);
			}
			if (response.status !== 'ok') {
				console.error('Error reporting failed at server: ' + response.message);
				process.exit(6);
			}
			console.error('Error has been reported.');
			process.exit(0);
		});
		res.on('error', function(err) {
			console.error('Error reporting failed: ' + err.message);
			process.exit(4);
		});
	});
	post_req.write(json);
	post_req.end();
}

main();
