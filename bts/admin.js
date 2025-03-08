'use strict';

const async = require('async');
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid/v4');
const {promisify} = require('util');

const btp_manager = require('./btp_manager');
const serror = require('./serror');
const stournament = require('./stournament');
const ticker_manager = require('./ticker_manager');
const utils = require('./utils');


/**
* Returns true iff everything is ok.
*/
function _require_msg(ws, msg, fields) {
	for (const f of fields) {
		if (typeof msg[f] === 'undefined') {
			ws.respond(msg, {message: 'Missing required field ' + f + ' in message ' + msg.type});
			return false;
		}
	}
	return true;
}

function _annotate_tournament(tournament) {
	const tz = utils.get_system_timezone();
	tournament.system_timezone = tz;
}


function handle_tournament_list(app, ws, msg) {
	app.db.tournaments.find({}, function(err, tournaments) {
		for (const t of tournaments) {
			_annotate_tournament(t);
		}
		ws.respond(msg, err, {tournaments});
	});
}

function handle_tournament_edit_props(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (! msg.props) {
		return ws.respond(msg, {message: 'Missing props'});
	}

	const key = msg.key;
	const props = utils.pluck(msg.props, [
		'name',
		'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
		'btp_ip', 'btp_password',
		'is_team', 'is_nation_competition', 'only_now_on_court',
		'warmup', 'warmup_ready', 'warmup_start',
		'ticker_enabled', 'ticker_url', 'ticker_password',
		'language', 'dm_style',
		'logo_background_color', 'logo_foreground_color']);

	if (msg.props.btp_timezone) {
		props.btp_timezone = msg.props.btp_timezone === 'system' ? undefined : msg.props.btp_timezone;
	}

	app.db.tournaments.update({key}, {$set: props}, {returnUpdatedDocs: true}, function(err, num, t) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		if (utils.has_key(props, k => /^btp_/.test(k))) {
			btp_manager.reconfigure(app, t);
		}
		if (utils.has_key(props, k => /^ticker_/.test(k))) {
			ticker_manager.reconfigure(app, t);
		}
		notify_change(app, key, 'props', t);

		ws.respond(msg, err);
	});
}

function handle_courts_add(app, ws, msg) {
	if (! msg.tournament_key) {
		return ws.respond(msg, {message: 'Missing tournament_key'});
	}
	const tournament_key = msg.tournament_key;
	if (! msg.nums) {
		return ws.respond(msg, {message: 'Missing nums'});
	}

	const added_courts = msg.nums.map(num => {
		return {
			_id: tournament_key + '_' + num,
			tournament_key,
			num,
		};
	});
	app.db.courts.insert(added_courts, function(err) {
		if (err) {
			ws.respond(msg, err);
			return;
		}

		stournament.get_courts(app.db, tournament_key, function(err, all_courts) {
			notify_change(app, tournament_key, 'courts_changed', {all_courts});
			ws.respond(msg, err, {});
		});
	});
}

function handle_tournament_get(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}

	app.db.tournaments.findOne({key: msg.key}, function(err, tournament) {
		if (!err && !tournament) {
			err = {message: 'No tournament ' + msg.key};
		}
		if (err) {
			ws.respond(msg, err);
			return;
		}

		async.parallel([
		function(cb) {
			stournament.get_courts(app.db, tournament.key, function(err, courts) {
				tournament.courts = courts;
				cb(err);
			});
		}, function(cb) {
			stournament.get_umpires(app.db, tournament.key, function(err, umpires) {
				tournament.umpires = umpires;
				cb(err);
			});
		}, function(cb) {
			stournament.get_matches(app.db, tournament.key, function(err, matches) {
				tournament.matches = matches;
				cb(err);
			});
		}], function(err) {
			tournament.btp_status = btp_manager.get_status(tournament.key);
			tournament.ticker_status = ticker_manager.get_status(tournament.key);
			_annotate_tournament(tournament);
			ws.respond(msg, err, {tournament});
		});
	});
}

function handle_create_tournament(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}

	const t = {
		key: msg.key,
	};

	app.db.tournaments.insert(t, function(err) {
		ws.respond(msg, err);
	});
}

function _extract_setup(msg_setup) {
	const setup = utils.pluck(msg_setup, [
		'court_id',
		'event_name',
		'match_name',
		'match_num',
		'now_on_court',
		'umpire_name',
		'service_judge_name',
		'is_doubles',
		'incomplete',
		'scheduled_time_str',
		'scheduled_date',
		'called_timestamp',
		'teams',
		'override_colors',
	]);
	if (!setup.match_name && setup.match_num) {
		setup.match_name = '# ' + setup.match_num;
	}
	setup.counting = '3x21';

	return setup;
}

function handle_match_add(app, ws, msg) {
	if (! msg.tournament_key) {
		return ws.respond(msg, {message: 'Missing tournament_key'});
	}
	if (! msg.setup) {
		return ws.respond(msg, {message: 'Missing setup'});
	}
	const tournament_key = msg.tournament_key;

	const match = {
		tournament_key,
		setup: _extract_setup(msg.setup),
		presses: [],
	};
	app.db.matches.insert(match, function(err, inserted_m) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		notify_change(app, tournament_key, 'match_add', {match: inserted_m});
		ws.respond(msg, err);
	});
}

function handle_match_edit(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'id', 'setup'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);
	// TODO get old setup, make sure no key has been removed
	app.db.matches.update({_id: msg.id, tournament_key}, {$set: {setup}}, {returnUpdatedDocs: true}, function(err, numAffected, changed_match) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		if (numAffected !== 1) {
			ws.respond(msg, new Error('Cannot find match ' + msg.id + ' of tournament ' + tournament_key + ' in database'));
			return;
		}
		if (changed_match._id !== msg.id) {
			const errmsg = 'Match ' + changed_match._id + ' changed by accident, intended to change ' + msg.id + ' (old nedb version?)';
			serror.silent(errmsg);
			ws.respond(msg, new Error(errmsg));
			return;
		}

		notify_change(app, tournament_key, 'match_edit', {match__id: msg.id, setup});
		if (msg.btp_update) {
			btp_manager.update_score(app, changed_match);
		}
		ws.respond(msg, err);
	});
}

async function async_handle_match_delete(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'id'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	let num_removed;
	try {
		num_removed = await app.db.matches.remove_async({_id: msg.id, tournament_key}, {});
	} catch (err) {
		ws.respond(msg, err);
		return;
	}
	if (num_removed !== 1) {
		ws.respond(msg, new Error('Cannot find match ' + msg.id + ' of tournament ' + tournament_key + ' to remove in database'));
		return;
	}

	await app.db.courts.update_async({match_id: msg.id}, {$unset: {match_id: true}}, {});

	notify_change(app, tournament_key, 'match_delete', {match__id: msg.id});
	ws.respond(msg);
}

function handle_btp_fetch(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	btp_manager.fetch(msg.tournament_key);
	ws.respond(msg);
}

function handle_ticker_pushall(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	ticker_manager.pushall(app, msg.tournament_key);
	ws.respond(msg);
}

function handle_ticker_reset(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	ticker_manager.reset(app, msg.tournament_key);
	ws.respond(msg);
}

const all_admins = [];
function notify_change(app, tournament_key, ctype, val) {
	for (const admin_ws of all_admins) {
		admin_ws.sendmsg({
			type: 'change',
			tournament_key,
			ctype,
			val,
		});
	}
}

function handle_fetch_allscoresheets_data(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	app.db.matches.find({
		tournament_key,
	}, function(err, all_matches) {
		if (err) {
			return ws.respond(msg, err);
		}
		const interesting_matches = all_matches.filter(
			m => (m.presses && (m.presses.length > 0))
		);

		return ws.respond(msg, null, {
			matches: interesting_matches,
		});
	});
}

function on_connect(app, ws) {
	all_admins.push(ws);
}

function on_close(app, ws) {
	if (! utils.remove(all_admins, ws)) {
		serror.silent('Removing admin ws, but it was not connected!?');
	}
}

async function async_handle_tournament_upload_logo(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'data_url'])) {
		return;
	}

	const tournament = await app.db.tournaments.findOne_async({
		key: msg.tournament_key,
	});
	if (!tournament) {
		ws.respond(msg, {message: `Could not find tournament ${msg.tournament_key}`});
		return;
	}

	const m = /^data:(image\/[a-z+]+)(?:;base64)?,([A-Za-z0-9+/=]+)$/.exec(msg.data_url);
	if (!m) {
		ws.respond(msg, {message: `Invalid base64 URI, starts with ${msg.data_url.slice(0, 80)}`});
		return;
	}
	const mime_type = m[1];
	const logo_b64 = m[2];

	const ext = {
		'image/gif': 'gif',
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/svg+xml': 'svg',
		'image/webp': 'webp',
	}[mime_type];
	if (!ext) {
		ws.respond(msg, {message: `Unsupported mime type ${mime_type}`});
		return;
	}

	const buf = Buffer.from(logo_b64, 'base64');
	const logo_id = uuidv4() + '.' + ext;
	await promisify(fs.writeFile)(path.join(utils.root_dir(), 'data', 'logos', logo_id), buf);

	const [_, updated_tournament] = await app.db.tournaments.update_async( // eslint-disable-line no-unused-vars
		{key: msg.tournament_key},
		{$set: {logo_id}},
		{returnUpdatedDocs: true});
	notify_change(app, msg.tournament_key, 'props', updated_tournament);

	return ws.respond(msg, null, {});
}

module.exports = {
	async_handle_match_delete,
	async_handle_tournament_upload_logo,
	handle_btp_fetch,
	handle_fetch_allscoresheets_data,
	handle_create_tournament,
	handle_courts_add,
	handle_match_add,
	handle_match_edit,
	handle_ticker_pushall,
	handle_ticker_reset,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit_props,
	notify_change,
	on_close,
	on_connect,
};