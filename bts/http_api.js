'use strict';

const assert = require('assert');
const async = require('async');
const path = require('path');

const admin = require('./admin');
const bupws = require('./bupws');
const btp_manager = require('./btp_manager');
const stournament = require('./stournament');
const ticker_manager = require('./ticker_manager');
const utils = require('./utils');

// Returns true iff all params are met
function _require_params(req, res, keys) {
	for (const k of keys) {
		if (! Object.prototype.hasOwnProperty.call(req.body, k)) {
			res.json({
				status: 'error',
				message: 'Missing field ' + k + ' in request',
			});
			return false;
		}
	}
	return true;
}

function courts_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	stournament.get_courts(req.app.db, tournament_key, function(err, courts) {
		const reply = (err ? {
			status: 'error',
			message: err.message,
		} : {
			status: 'ok',
			courts,
		});

		res.json(reply);
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

// TODO might be removed due to refactoring work in bupws.js
function matches_handler(req, res) {
	const tournament_key = req.params.tournament_key;
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
	if (req.query.court) {
		query['setup.court_id'] = req.query.court;
	} else {
		query['setup.court_id'] = {$exists: true};
	}

	req.app.db.fetch_all([{
		queryFunc: '_findOne',
		collection: 'tournaments',
		query: {key: tournament_key},
	}, {
		collection: 'matches',
		query,
	}, {
		collection: 'courts',
		query: {tournament_key},
	}], function(err, tournament, db_matches, db_courts) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		let matches = db_matches.map(dbm => create_match_representation(tournament, dbm));
		if (tournament.only_now_on_court) {
			matches = matches.filter(m => m.setup.now_on_court);
		}

		db_courts.sort(utils.cmp_key('num'));
		const courts = db_courts.map(function(dc) {
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
		res.json(reply);
	});
}

function matchinfo_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	const match_id = req.params.match_id;

	const query = {
		tournament_key,
		_id: match_id,
	};

	req.app.db.fetch_all([{
		collection: 'tournaments',
		query: {key: tournament_key},
	}, {
		collection: 'matches',
		query,
	}], function(err, tournaments, matches) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		if (tournaments.length !== 1) {
			res.json({
				status: 'error',
				message: 'Cannot find tournament',
			});
			return;
		}

		if (matches.length !== 1) {
			res.json({
				status: 'error',
				message: 'Cannot find match',
			});
			return;
		}

		const [tournament] = tournaments;
		const [match] = matches;
		const event = create_event_representation(tournament);
		const match_repr = create_match_representation(tournament, match);
		if (match_repr.presses_json) {
			// Parse JSON-in-JSON (for performance reasons) for nicer output
			match_repr.presses = JSON.parse(match_repr.presses_json);
			delete match_repr.presses_json;
		}
		event.matches = [match_repr];

		const reply = {
			status: 'ok',
			event,
		};
		res.header('Content-Type', 'application/json');
        res.send(JSON.stringify(reply, null, 4));
	});
}

function score_handler(req, res) {
	if (!_require_params(req, res, ['duration_ms', 'end_ts', 'network_score', 'team1_won', 'presses'])) return;

	const tournament_key = req.params.tournament_key;
	const match_id = req.params.match_id;
	const query = {
		_id: match_id,
		tournament_key,
	};

	const update = {
		network_score: req.body.network_score,
		network_team1_left: req.body.network_team1_left,
		network_team1_serving: req.body.network_team1_serving,
		network_teams_player1_even: req.body.network_teams_player1_even,
		team1_won: req.body.team1_won,
		presses: req.body.presses,
		duration_ms: req.body.duration_ms,
		end_ts: req.body.end_ts,
		'setup.now_on_court': true,
	};

	if (update.team1_won !== undefined && update.team1_won != null) {
		update.btp_winner = (update.team1_won === true) ? 1 : 2;
		update.btp_needsync = true;
		update['setup.now_on_court'] = false;
	}

	if (update.team1_won != undefined && update.team1_won != null) {
		async.waterfall([
			cb => remove_player_on_court(req.app, tournament_key, match_id, update.end_ts, cb),
			cb => remove_tablet_on_court(req.app, tournament_key, match_id, update.end_ts, cb),
			cb => add_player_to_tabletoperator_list(req.app, tournament_key, match_id, update.end_ts)

		], function(err) {
			if (err) {
				res.json({
					status: 'error',
					message: err.message,
				});
				return;
			}
		});
	}

	if (req.body.shuttle_count) {
		update.shuttle_count = req.body.shuttle_count;
	}

	const court_q = {
		tournament_key,
		_id: req.body.court_id,
	};
	const db = req.app.db;
 
	async.waterfall([
		cb => db.matches.update(query, {$set: update}, {returnUpdatedDocs: true}, (err, _, match) => cb(err, match)),
		(match, cb) => {
			if (!match) {
				return cb(new Error('Cannot find match ' + JSON.stringify(match)));
			}
			return cb(null, match);
		},
		(match, cb) => db.courts.findOne(court_q, (err, court) => cb(err, match, court)),
		(match, court, cb) => {
			if (court.match_id === match_id) {
				cb(null, match, court, false);
				return;
			}

			db.courts.update(court_q, {$set: {match_id: match_id}}, {}, (err) => {
				cb(err, match, court, true);
			});
		},
		(match, court, changed_court, cb) => {
			if (changed_court) {
				admin.notify_change(req.app, tournament_key, 'court_current_match', {
					match__id: match_id,
					match: match,
				});
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			btp_manager.update_score(req.app, match);

			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (match.setup.highlight &&
				match.setup.highlight == 6 &&
				match.network_score && 
				match.network_score.length > 0 && 
				match.network_score[0].length > 1 && 
				(match.network_score[0][0] > 0 || match.network_score[0][1] > 0)) {
					match.setup.highlight = 0;
					btp_manager.update_highlight(req.app, match);
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (changed_court) {
				ticker_manager.pushall(req.app, tournament_key);
			} else {
				ticker_manager.update_score(req.app, match);
			}

			cb(null, match);
		},
		(match, cb) => {
			admin.notify_change(req.app, tournament_key, 'score', {
				match_id,
				network_score: update.network_score,
				team1_won: update.team1_won,
				shuttle_count: update.shuttle_count,
				presses: match.presses,
			});

			bupws.handle_score_change(req.app, tournament_key, match.setup.court_id);
			cb();
		},
	], function(err) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		res.json({status: 'ok'});
	});
}

function add_player_to_tabletoperator_list(app, tournament_key, cur_match_id, end_ts) {
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return callback(err);
		}
		if ((tournament.tabletoperator_enabled && tournament.tabletoperator_enabled == true)) {
			app.db.matches.findOne({ 'tournament_key': tournament_key, '_id': cur_match_id }, (err, cur_match) => {
				if (err) {
					return reject(err);
				}
				add_player_to_tabletoperator_list_by_match(app, tournament, tournament_key, cur_match, end_ts)
			});
		}
	});
}

function add_player_to_tabletoperator_list_by_match(app, tournament, tournament_key, cur_match, end_ts) {
	if (cur_match.network_score) {
		// walkovers and retirements will not be recorgnized.
		app.db.tabletoperators.findOne({ 'tournament_key': tournament_key, 'match_id': cur_match._id }, (err, no_tabletoperator) => {
			if (err) {
				return reject(err);
			}
			if (no_tabletoperator == null) {
				const round = cur_match.setup.match_name;
				var team = null;

				if (tournament.tabletoperator_winner_of_quaterfinals_enabled && (round == 'VF' || round == 'QF')) { 
					team = cur_match.setup.teams[cur_match.btp_winner - 1];
				} else {
					const index = cur_match.btp_winner % 2;
					team = cur_match.setup.teams[index];
				}
				if (team && typeof team.players !== 'undefined') {
					var teams = [];
					if (tournament.tabletoperator_split_doubles && team.players.length > 1) {
						for (const player of team.players) {
							var newTeam = {
								players: [player]
							};

							teams.push(newTeam); 
						}
					} else {
						teams.push(team); 
					}

					for (const t of teams) {
						var tabletoperator = [];
						t.players.forEach((player) => {
							tabletoperator.push(player);
						});

						const new_tabletoperator = {
							tournament_key,
							tabletoperator,
							'match_id': cur_match._id,
							'start_ts': end_ts,
							'end_ts': null,
							'court': null,
							'played_on_court': (cur_match.setup.court_id ? cur_match.setup.court_id : null)
						};

						app.db.tabletoperators.insert(new_tabletoperator, function (err, inserted_t) {
							if (err) {
								ws.respond(msg, err);
								return;
							}
							const admin = require('./admin'); // avoid dependency cycle
							admin.notify_change(app, tournament_key, 'tabletoperator_add', { tabletoperator: inserted_t });
						});
					}

				}
			}
		});
	}
}
function remove_player_on_court (app, tkey, cur_match_id, end_ts, callback) {	
	const admin = require('./admin'); // avoid dependency cycle
	app.db.matches.findOne({'tournament_key': tkey, '_id': cur_match_id}, (err, cur_match) => {
		if (err) return callback(err);

		app.db.matches.find({'tournament_key': tkey}, async (err, matches) => {
			if (err) {
				return callback(err);
			}

			async.each(matches, (match, cb) => {
				if(!match.setup)
				{
					return cb(null);
				}
				
				if(match.setup.now_on_court == true) {
					return cb(null);
				}
				
				const match_id = match._id;
				let remove_btp_ids = [	cur_match.setup.teams[0].players[0].btp_id, 
										cur_match.setup.teams[1].players[0].btp_id];

				if(cur_match.setup.teams[0].players.length > 1) {
					remove_btp_ids.push(cur_match.setup.teams[0].players[1].btp_id);
				}
				
				if(cur_match.setup.teams[1].players.length > 1) {
					remove_btp_ids.push(cur_match.setup.teams[1].players[1].btp_id);
				}

				let change = false;
				
				if (match.setup.teams[0].players.length > 0 &&
					remove_btp_ids.includes(match.setup.teams[0].players[0].btp_id) &&
					match.setup.teams[0].players[0].now_playing_on_court) {
						match.setup.teams[0].players[0].now_playing_on_court = false;
						match.setup.teams[0].players[0].checked_in = false;
						match.setup.teams[0].players[0].last_time_on_court_ts = end_ts;
						change = true;
				}

				if (match.setup.teams[0].players.length > 1 && 
					remove_btp_ids.includes(match.setup.teams[0].players[1].btp_id) &&
					match.setup.teams[0].players[1].now_playing_on_court) {
						match.setup.teams[0].players[1].now_playing_on_court = false;
						match.setup.teams[0].players[1].checked_in = false;
						match.setup.teams[0].players[1].last_time_on_court_ts = end_ts;
						change = true;
				}

				if (match.setup.teams[1].players.length > 0 &&
					remove_btp_ids.includes(match.setup.teams[1].players[0].btp_id) &&
					match.setup.teams[1].players[0].now_playing_on_court) {
						match.setup.teams[1].players[0].now_playing_on_court = false;
						match.setup.teams[1].players[0].checked_in = false;
						match.setup.teams[1].players[0].last_time_on_court_ts = end_ts;
						change = true;
				}

				if (match.setup.teams[1].players.length > 1 && 
					remove_btp_ids.includes(match.setup.teams[1].players[1].btp_id) &&
					match.setup.teams[1].players[1].now_playing_on_court) {
						match.setup.teams[1].players[1].now_playing_on_court = false;
						match.setup.teams[1].players[1].checked_in = false;
						match.setup.teams[1].players[1].last_time_on_court_ts = end_ts;
						change = true;
				}

				if (change) {
					const setup = match.setup;
					const match_q = {_id: match_id};
					app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
						if (err) return cb(err);

						admin.notify_change(app, match.tournament_key, 'update_player_status',{	match__id: match._id,
																								btp_winner: match.btp_winner, 
																								setup: match.setup});
						return cb(null);
					});
				} else {
					return cb(null);
				}	
			}, callback);
		});
	});		
}


function remove_tablet_on_court (app, tkey, cur_match_id, end_ts, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	app.db.tournaments.findOne({ key: tkey }, async (err, tournament) => {
		if (err) {
			return callback(err);
		}
		app.db.matches.findOne({'tournament_key': tkey, '_id': cur_match_id}, (err, cur_match) => {
			if (err) return callback(err);

			app.db.matches.find({'tournament_key': tkey}, async (err, matches) => {
				if (err) {
					console.error(err);
					return callback(err);
				}

				async.each(matches, (match, cb) => {
				
					if(match.setup.now_on_court == true) {
						return cb(null);
					}
				
					if(!cur_match.setup.tabletoperators || cur_match.setup.tabletoperators == 0) {
						return cb(null);
					}

					const match_id = match._id;
					let remove_btp_ids = [	cur_match.setup.tabletoperators[0].btp_id];

					if(cur_match.setup.tabletoperators.length > 1) {
						remove_btp_ids.push(cur_match.setup.tabletoperators[1].btp_id);
					}

					let change = false;
				
					if (match.setup.teams[0].players.length > 0 &&
						remove_btp_ids.includes(match.setup.teams[0].players[0].btp_id)) {
						reset_tabletoperator_settings_at_player(app, tkey, tournament, match.setup.teams[0].players[0], end_ts);
						change = true;
					}

					if (match.setup.teams[0].players.length > 1 && 
						remove_btp_ids.includes(match.setup.teams[0].players[1].btp_id)) {
						reset_tabletoperator_settings_at_player(app, tkey, tournament, match.setup.teams[0].players[1], end_ts);
						change = true;
					}

					if (match.setup.teams[1].players.length > 0 &&
						remove_btp_ids.includes(match.setup.teams[1].players[0].btp_id)) {
						reset_tabletoperator_settings_at_player(app, tkey, tournament, match.setup.teams[1].players[0], end_ts);
						change = true;
					}

					if (match.setup.teams[1].players.length > 1 && 
						remove_btp_ids.includes(match.setup.teams[1].players[1].btp_id)) {
						reset_tabletoperator_settings_at_player(app, tkey, tournament, match.setup.teams[1].players[1], end_ts);
						change = true;
					}

					if (change) {
						const setup = match.setup;
						const match_q = {_id: match_id};
						app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
							if (err) return cb(err);
							admin.notify_change(app, match.tournament_key, 'update_player_status', {	match__id: match._id,
																										btp_winner: match.btp_winner, 
																										setup: match.setup});
							return cb(null);
						});
					} else {
						return cb(null);
					}
				}, callback);
			});
		});	
	});
}

function reset_tabletoperator_settings_at_player(app, tkey, tournament, player, end_ts) {
	player.now_tablet_on_court = false;
	if (tournament.tabletoperator_set_break_after_tabletservice) {
		var offset = 0;
		if (tournament.tabletoperator_break_seconds) {
			offset = (parseInt(tournament.tabletoperator_break_seconds) * 1000) - tournament.btp_settings.pause_duration_ms;
		}
		player.last_time_on_court_ts = end_ts + offset;
		player.checked_in = false;
		player.tablet_break_active = true;
		btp_manager.update_players(app, tkey, [player]);
		
	} else {
		player.checked_in = true;
		player.tablet_break_active = false;
		btp_manager.update_players(app, tkey, [player]);
	}
}


function logo_handler(req, res) {
	const {tournament_key, logo_id} = req.params;
	assert(tournament_key);
	assert(logo_id);
	const m = /^[-0-9a-f]+\.(gif|png|jpg|jpeg|svg|webp)$/.exec(logo_id);
	assert(m, `Invalid logo ${logo_id}`);
	const mime = {
		gif: 'image/gif',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		svg: 'image/svg+xml',
		webp: 'image/webp',
	}[m[1]];
	assert(mime, `Unsupported ext ${JSON.stringify(m[1])}`);

	const fn = path.join(utils.root_dir(), 'data', 'logos', path.basename(logo_id));
	res.setHeader('Content-Type', mime);
	res.setHeader('Cache-Control', 'public, max-age=31536000');
	res.sendFile(fn);
}

module.exports = {
	courts_handler,
	logo_handler,
	matches_handler,
	matchinfo_handler,
	score_handler,
	add_player_to_tabletoperator_list_by_match,
	remove_tablet_on_court
};
