#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const argparse = require('argparse');
const {promisify} = require('util');
const {DOMParser} = require('xmldom');
const fs = require('fs');
const path = require('path');
const TextDecoder = require('text-encoding').TextDecoder;

const btp_conn = require('./bts/btp_conn.js');
const btp_parse = require('./bts/btp_parse.js');
const btp_proto = require('./bts/btp_proto.js');
const btp_sync = require('./bts/btp_sync.js');
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
	parser.addArgument(['-l', '--league'], {
		metavar: 'ADDRESS',
		dest: 'league',
		action: 'storeTrue',
		help: 'Use CP League Planner instead of BTP',
	});
	parser.addArgument(['-i', '--ip'], {
		metavar: 'ADDRESS',
		dest: 'ip',
		help: 'The IP address of the BTP server',
	});
	parser.addArgument(['--port'], {
		metavar: 'PORT',
		help: (
			'The port of the BTP server.' +
			` Defaults to automatic (${btp_conn.BLP_PORT} for BTP, ${btp_conn.BLP_PORT} for CP)`),
	});
	parser.addArgument(['-p', '--password'], {
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
	parser.addArgument(['-F', '--filter-date'], {
		metavar: 'REGEXP',
		help: 'Only show matches scheduled for the specified time (e.g. "2019-11-30 12:00" )',
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
	output_group.addArgument(['-t', '--text'], {
		action: 'storeConst',
		dest: 'output',
		constant: 'text',
		defaultValue: 'json',
		help: 'Output tournament as text',
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

	if (args.filter_date && args.output != 'text') {
		parser.error('Filtering only works with -t (text output)');
		return;
	}

	let response_raw;
	if (args.load_file) {
		response_raw = await load_file(args.load_file);
	} else {
		const ip = args.ip;
		if (!ip) {
			parser.error('Need target IP (use --ip 1.2.3.4)');
			return;
		}
		const port = args.port || args.league ? btp_conn.BLP_PORT : btp_conn.BTP_PORT;
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
			return `${utils.pad(u.btp_id, max_id_len, ' ')} ${u.name} (${u.nationality || '??'})`;
		}).join('\n'));
	}

	const btp_state = btp_parse.get_btp_state(response_obj);
	const match_ids_on_court = btp_sync.calculate_match_ids_on_court(btp_state);

	if (args.output === 'text') {
		const {draws, events, officials} = btp_state;
		for (const bm of btp_state.matches) {
			const match_num = bm.MatchNr[0];

			const id_str = utils.pad(bm.ID[0], 4, ' ');

			const draw = draws.get(bm.DrawID[0]);
			assert(draw);

			const event = events.get(draw.EventID[0]);
			assert(event);

			const tkey = '<tkey>'; // Pseudo value
			const pseudo_court_map = {
				'get': court_id => court_id,
			};
			const discipline_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + '_' + draw.Name[0];
			const btp_id = tkey + '_' + discipline_name + '_' + match_num;

			const match = btp_sync.craft_match(tkey, btp_id, pseudo_court_map, event, draw, officials, bm, match_ids_on_court);
			if (!match) {
				continue;
			}

			const scheduled_str = match.setup.scheduled_date + ' ' + match.setup.scheduled_time_str;
			if (args.filter_date && !(new RegExp(args.filter_date)).test(scheduled_str)) {
				continue;
			}

			const players_str = match.setup.teams.map(t => t.players.map(p => p.name).join(' / ')).join(' - ');
			const match_name_str = utils.pad(`${match.setup.match_name}`, 3, ' ');
			console.log(`#${id_str} ${scheduled_str} ${match.setup.event_name} ${match_name_str} ${players_str}${match.setup.now_on_court ? ' (on court)' : ''}`);
		}

		if (!args.filter_date) {
			console.log('\n\nUmpires:');
			for (const u of umpires) {
				console.log(u.name);
			}
		}
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
