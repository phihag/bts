'use strict';

const async = require('async');

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

function handle_tournament_list(app, ws, msg) {
	app.db.tournaments.find({}, function(err, tournaments) {
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
		'is_team', 'is_nation_competition',
		'ticker_enabled', 'ticker_url', 'ticker_password',
		'language', 'dm_style']);

	app.db.tournaments.update({key}, {$set: props}, {returnUpdatedDocs: true}, function(err, num, t) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		btp_manager.reconfigure(app, t);
		ticker_manager.reconfigure(app, t);
		notify_change(app, key, 'props', props);

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
		'umpire_name',
		'is_doubles',
		'incomplete',
		'scheduled_time_str',
		'teams',
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

function _fixup(app, matches_by_num, all_umpires, line, cb) {
	const rem = /^\s*([0-9]+)\s*,\s*([a-zA-ZäöüÄÖÜß0-9][\sa-zA-ZäöüÄÖÜß0-9]*)\s*$/.exec(line);
	if (!rem) {
		return cb(null, {
			line,
			message: 'Does not match',
		});
	}

	const match_num = parseInt(rem[1]);
	const umpire_name = rem[2];

	const match = matches_by_num.get(match_num);
	if (!match) {
		return cb(null, {
			line,
			message: 'Cannot find match ' + JSON.stringify(match_num),
		});
	}

	const matching_umpires = all_umpires.filter(u => {
		return u.name.toLowerCase().includes(umpire_name.toLowerCase());
	});

	if (matching_umpires.length === 0) {
		return cb(null, {
			line,
			message: 'Cannot find any umpire named ' + umpire_name,
		});
	} else if (matching_umpires.length > 1) {
		const matching_str = matching_umpires.map(u => u.name).join(', ');
		return cb(null, {
			line,
			message: 'More than 1 umpire named ' + umpire_name + ' ' + matching_str,
		});
	}

	if (typeof match.team1_won !== 'boolean') {
		return cb(null, {
			line,
			message: 'Match ' + match_num + ' is not won yet',
		});
	}
	if (!match.network_score || (match.network_score.length < 2)) {
		return cb(null, {
			line,
			message: 'Scores not completed in match ' + match_num,
		});
	}

	const ump = matching_umpires[0];
	app.db.matches.update({
		_id: match._id,
	}, {
		$set: {
			'setup.umpire_name': ump.name,
			btp_needsync: true,
		},
	}, {
		returnUpdatedDocs: true,
	}, (err, num_affected, new_match) => {
		if (! new_match) {
			return cb(new Error('Failed to update match ' + match_num));
		}

		btp_manager.update_score(app, new_match);

		return cb(null, {
			line: '',
			message: 'done: ' + match_num + ', ' + ump.name,
		});
	});
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


function handle_umpfixup(app, ws, msg) {
	if (!_require_msg(ws, msg, ['csv', 'tournament_key'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const lines = (
		msg.csv
		.split(/\n/).
		map(line => line.replace(/#.*/, '').replace(/\s+$/, ''))
		.filter(line => line.length > 0)
	);

	const db = app.db;
	async.parallel([
		(cb) => {
			db.umpires.find({
				tournament_key,
			}, (err, all_umpires) => {
				cb(err, all_umpires);
			});
		},
		(cb) => {
			db.matches.find({
				tournament_key,
			}, (err, all_matches) => {
				cb(err, all_matches);
			});
		},
	], (err, results) => {
		if (err) {
			return ws.respond(msg, err);
		}
		const [all_umpires, all_matches] = results;

		const matches_by_num = new Map();
		for (const m of all_matches) {
			matches_by_num.set(m.setup.match_num, m);
		}

		async.map(lines, function(line, cb) {
			try {
				_fixup(app, matches_by_num, all_umpires, line, cb);
			} catch(e) {
				serror.silent('Error during umpfixup: ' + e.stack);
				return ws.respond(msg, e);
			}
		}, function(err, all_results) {
			if (err) {
				return ws.respond(msg, err);
			}
			const remaining = all_results.filter(r => r);
			return ws.respond(msg, null, {
				remaining,
			});
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


module.exports = {
	handle_btp_fetch,
	handle_fetch_allscoresheets_data,
	handle_create_tournament,
	handle_courts_add,
	handle_match_add,
	handle_match_edit,
	handle_ticker_pushall,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit_props,
	handle_umpfixup,
	notify_change,
	on_close,
	on_connect,
};