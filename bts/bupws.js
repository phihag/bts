'use strict';

const serror = require('./serror');
const utils = require('./utils');

const all_panels = [];

function on_close(app, ws) {
	if (!utils.remove(all_panels, ws)) {
		serror.silent('Removing Scoreboard ws, but it was not connected!?');
	}
}

function on_connect(app, ws) {
	all_panels.push(ws);
}

function notify_change(tournament_key, court_id, ctype, val) {
	for (const panel_ws of all_panels) {
		notify_change_ws(panel_ws, tournament_key, court_id, ctype, val);
	}
}

function notify_change_ws(ws, tournament_key, court_id, ctype, val) {
	if (ws == null) {
		notify_change(tournament_key, court_id, ctype, val);
	} else { 
		if (ws.court_id === court_id) { 
			ws.sendmsg({
				type: 'change',
				tournament_key,
				ctype,
				val,
			});
		}
	}
}

function all_matches_delivery() {
	for (const panel_ws of all_panels) {
		if (panel_ws.court_id === undefined) {
			return true;
		}
	}
}

function handle_init(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	var court_id = msg.panel_settings.court_id;
	if (court_id) {
		ws.court_id = court_id;
	} else {
		ws.court_id = undefined;
		court_id = undefined;
	}
	matches_handler(app, ws, tournament_key, court_id);
}

function handle_score_change(app, tournament_key, court_id) {
	matches_handler(app, null, tournament_key, court_id);
	if (all_matches_delivery()) {
		matches_handler(app, null, tournament_key, undefined);
	}
}

function matches_handler(app, ws, tournament_key, court_id) {
	const now = Date.now();
	const show_still = now - 60000;
	const query = {
		tournament_key,
		$or: [
			{
				$and: [
					{
						team1_won: {
							$ne: true,
						},
					},
					{
						team1_won: {
							$ne: false,
						},
					},
				],
			},
			{
				end_ts: {
					$gt: show_still,
				},
			},
		],
	};
	if (court_id) {
		query['setup.court_id'] = court_id;
	} else {
		query['setup.court_id'] = { $exists: true };
	}

	app.db.fetch_all([{
		queryFunc: '_findOne',
		collection: 'tournaments',
		query: { key: tournament_key },
	}, {
		collection: 'matches',
		query,
	}, {
		collection: 'courts',
		query: { tournament_key },
	}], function (err, tournament, db_matches, db_courts) {
		if (err) {
			const msg = {
				status: 'error',
				message: err.message,
			};
			notify_change_ws(app, tournament_key, "score-update,", msg);
		}

		let matches = db_matches.map(dbm => create_match_representation(tournament, dbm));
		if (tournament.only_now_on_court) {
			matches = matches.filter(m => m.setup.now_on_court);
		}

		db_courts.sort(utils.cmp_key('num'));
		const courts = db_courts.map(function (dc) {
			var res = {
				court_id: dc._id,
				label: dc.num,
			};
			if (dc.match_id) {
				res.match_id = 'bts_' + dc.match_id;
			}
			if (dc.called_timestamp) {
				res.called_timestamp = dc.called_timestamp;
			}
			return res;
		});

		const event = create_event_representation(tournament);
		event.matches = matches;
		event.courts = courts;
		const reply = {
			status: 'ok',
			event,
		};
		notify_change_ws(ws, tournament_key, court_id, "score-update",reply)
	});
}

function create_match_representation(tournament, match) {
	const setup = match.setup;
	setup.match_id = 'bts_' + match._id;
	setup.team_competition = tournament.is_team;
	setup.nation_competition = tournament.is_nation_competition;
	for (const t of setup.teams) {
		if (!t.players) continue;

		for (const p of t.players) {
			if (p.lastname) continue;

			const asian_m = /^([A-Z]+)\s+(.*)$/.exec(p.name);
			if (asian_m) {
				p.lastname = asian_m[1];
				p.firstname = asian_m[2];
				p._guess_info = 'bts_asian';
				continue;
			}

			const m = /^(.*)\s+(\S+)$/.exec(p.name);
			if (m) {
				p.firstname = m[1];
				p.lastname = m[2];
				p._guess_info = 'bts_western';
			} else {
				p.firstname = '';
				p.lastname = p.name;
				p._guess_info = 'bts_single';
			}
		}
	}

	const res = {
		setup,
		network_score: match.network_score,
		network_team1_left: match.network_team1_left,
		network_team1_serving: match.network_team1_serving,
		network_teams_player1_even: match.network_teams_player1_even,
		end_ts: match.end_ts !== undefined ? match.end_ts : null,
	};
	if (match.presses) {
		res.presses_json = JSON.stringify(match.presses);
	}
	return res;
}

function create_event_representation(tournament) {
	const res = {
		id: 'bts_' + tournament.key,
		tournament_name: tournament.name,
	};
	if (tournament.logo_id) {
		res.tournament_logo_url = `/h/${encodeURIComponent(tournament.key)}/logo/${tournament.logo_id}`;
	}
	res.tournament_logo_background_color = tournament.logo_background_color || '#000000';
	res.tournament_logo_foreground_color = tournament.logo_foreground_color || '#aaaaaa';
	return res;
}


module.exports = {
	on_close,
	on_connect,
	notify_change,
	handle_init,
	handle_score_change,
};