#!/usr/bin/env node
/* eslint-disable no-console */

const argparse = require('argparse');
const {promisify} = require('util');
const {DOMParser} = require('xmldom');

const btp_proto = require('./bts/btp_proto.js');
const btp_conn = require('./bts/btp_conn.js');
const {serialize_pretty} = require('./bts/xml_utils.js');

async function main() {
	const send_raw_request = promisify(btp_conn.send_raw_request);

	const parser = argparse.ArgumentParser({
		description: 'Fetch the current state of a tournament from BTP'});
	parser.addArgument('IP', {
		help: 'The address of the BTP server',
	});
	parser.addArgument(['-p', '--port'], {
		metavar: 'PORT',
		help: 'The port of the BTP server. Defaults to automatic (9901 for BTP)',
	});
	parser.addArgument(['--password'], {
		metavar: 'PASSWORD',
		help: 'The TPNetwork password. Empty for no password.',
	});
	const output_group = parser.addArgumentGroup({title: 'Output'});
	output_group.addArgument(['-r', '--raw'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'raw',
		defaultValue: 'json',
		help: 'Output raw bytes as were received',
	});
	output_group.addArgument(['-s', '--raw-xml-str'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'str',
		defaultValue: 'json',
		help: 'Decode to string only (TPNetwork XML format)',
	});
	output_group.addArgument(['-x', '--xml'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'xml',
		defaultValue: 'json',
		help: 'Output indented XML (as received on the line)',
	});
	output_group.addArgument(['-j', '--json'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'json',
		defaultValue: 'json',
		help: 'Output tournament as indented JSON (default)',
	});
	output_group.addArgument(['--no-output'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'none',
		defaultValue: 'json',
		help: 'Do not output received data (used for debugging)',
	});
	const args = parser.parseArgs();
	const ip = args.IP;
	if (!ip) {
		parser.error('Need target IP');
		return;
	}

	const port = args.port || 9901;

	const xml_request = btp_proto.get_info_request(args.password);
	const raw_request = btp_proto.encode(xml_request);

	const raw_response = await send_raw_request(ip, port, raw_request);
	if (args.output === 'none') {
		return;
	}
	if (args.output === 'raw') {
		process.stdout.write(raw_response);
		return;
	}
	const response_str = await promisify(btp_proto.decode_string)(raw_response);
	if (args.output === 'str') {
		process.stdout.write(response_str);
		return;
	}

	const xml_parser = new DOMParser();
	const doc = xml_parser.parseFromString(response_str);
	if (args.output === 'xml') {
		console.log(serialize_pretty(doc));
		return;
	}

	const response = btp_proto.el2obj(doc.documentElement);
	if (args.output === 'json') {
		console.log(JSON.stringify(response, null, 2));
		return;
	}
}

(async () => {
    try {
        await main();
    } catch (e) {
        console.error(e.stack);
        process.exit(2);
    }
})();
