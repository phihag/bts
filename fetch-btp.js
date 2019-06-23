#!/usr/bin/env node
/* eslint-disable no-console */

const argparse = require('argparse');
const {promisify} = require('util');
const {DOMParser} = require('xmldom');
const fs = require('fs');
const path = require('path');

const btp_proto = require('./bts/btp_proto.js');
const btp_conn = require('./bts/btp_conn.js');
const utils = require('./bts/utils.js');
const {serialize_pretty} = require('./bts/xml_utils.js');

async function _ensure_dir(path) {
	if (await promisify(fs.exists)(path)) return;

	await promisify(fs.mkdir)(path);
}

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
	parser.addArgument(['-b', '--backup'], {
		action: 'storeTrue',
		help: 'Create a backup file in ./backups/',
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
	output_group.addArgument(['--tournament-name'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'tournament_name',
		defaultValue: 'json',
		help: 'Output tournament name',
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

	const response_raw = await send_raw_request(ip, port, raw_request);
	if (args.output === 'raw') {
		process.stdout.write(response_raw);
	}

	const response_str = await promisify(btp_proto.decode_string)(response_raw);
	if (args.output === 'str') {
		process.stdout.write(response_str);
	}

	const xml_parser = new DOMParser();
	const response_doc = xml_parser.parseFromString(response_str);
	if (args.output === 'xml') {
		console.log(serialize_pretty(response_doc));
	}

	const response_obj = btp_proto.el2obj(response_doc.documentElement);
	if (args.output === 'json') {
		console.log(JSON.stringify(response_obj, null, 2));
	}

	const tournament_name = (
		response_obj
		.Result[0].Tournament[0].Settings[0].Setting
		.filter(setting => setting.ID[0] == 1001)[0]
		.Value[0]);
	if (args.output === 'tournament_name') {
		console.log(tournament_name);
	}

	if (args.backup) {
		const BACKUPS_DIR = './backups';
		await _ensure_dir(BACKUPS_DIR);
		const clean_tournament_name = tournament_name.replace(/[^-_\u00C0-\u017Fa-zA-Z0-9]/g, '_');
		const now = new Date();
		const timestamp = (
			now.getFullYear() + utils.pad(now.getMonth() + 1) + utils.pad(now.getDate()) +
			'_' +
			utils.pad(now.getHours()) + utils.pad(now.getMinutes()) + utils.pad(now.getSeconds())
		);
		const fn = path.join(BACKUPS_DIR, `btp-${clean_tournament_name}_${timestamp}.raw`);
		await promisify(fs.writeFile)(fn, response_raw);
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
