#!/usr/bin/env node
/* eslint-disable no-console */

const argparse = require('argparse');
const {promisify} = require('util');
const {DOMParser} = require('xmldom');
const fs = require('fs');
const path = require('path');
const TextDecoder = require('text-encoding').TextDecoder;

const btp_conn = require('./bts/btp_conn.js');
const btp_parse = require('./bts/btp_parse.js');
const btp_proto = require('./bts/btp_proto.js');
const utils = require('./bts/utils.js');
const {serialize_pretty} = require('./bts/xml_utils.js');

async function _ensure_dir(path) {
	if (await promisify(fs.exists)(path)) return;

	await promisify(fs.mkdir)(path);
}

async function load_file(path) {
	const bytes = await promisify(fs.readFile)(path, {});

	if (bytes[0] === 123) { // {
		const str = new TextDecoder('utf-8').decode(bytes);
		const data = JSON.parse(str);
		return btp_proto.encode(data);
	}

	const is_xml = (
		(bytes[0] === 60) ||  // <
		((bytes[0] === 239) && (bytes[1] === 187) && (bytes[2] === 191) && (bytes[3] === 60)) || // BOM + <
		((bytes[0] === 239) && (bytes[1] === 187) && (bytes[2] === 191) && (bytes[3] === 10) && (bytes[4] === 60)) // BOM + LF + <
	);			
	if (is_xml) {
		const str = new TextDecoder('utf-8').decode(bytes);
		return btp_proto.encode_xml(str);
	}

	return bytes;
}

async function main() {
	const send_raw_request = promisify(btp_conn.send_raw_request);

	const parser = argparse.ArgumentParser({
		description: 'Fetch the current state of a tournament from BTP'});
	parser.addArgument(['-i', '--ip'], {
		metavar: 'ADDRESS',
		dest: 'ip',
		help: 'The IP address of the BTP server',
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
	parser.addArgument(['-f', '--load-file'], {
		metavar: 'FILE',
		help: 'Instead of reading from the network, load BTP response from file',
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
	output_group.addArgument(['--umpires'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'umpires_list',
		defaultValue: 'json',
		help: 'Output a list of umpires',
	});
	const args = parser.parseArgs();

	let response_raw;
	if (args.load_file) {
		response_raw = await load_file(args.load_file);
	} else {
		const ip = args.ip;
		if (!ip) {
			parser.error('Need target IP (use --ip 1.2.3.4)');
			return;
		}
		const port = args.port || 9901;
		const xml_request = btp_proto.get_info_request(args.password);
		const raw_request = btp_proto.encode(xml_request);

		response_raw = await send_raw_request(ip, port, raw_request);
	}

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

	const umpires = btp_parse.parse_umpires(response_obj);
	if (args.output === 'umpires_list') {
		const max_id_len = Math.max(umpires.map(u => ('' + u.btp_id).length));
		console.log(umpires.map(u => {
			return `${utils.pad(u.btp_id, max_id_len, ' ')} ${u.name} (${u.nationality || "??"})`;
		}).join('\n'));
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
