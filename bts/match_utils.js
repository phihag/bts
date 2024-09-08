'use_strict';

const assert = require('assert');
const async = require('async');


async function match_update(app, match, callback) {
	async.waterfall([	
						(wcb) => update_match_btp(app, match, wcb), 
						(wcb) => update_match_db(app, match, wcb),
						(wcb) => notify_change_match_edit(app, match, wcb),
						(wcb) => notify_bupws(app, match, wcb),
					],
						(err) => {
							return callback(err);
						}
					);
}

async function uncall_match(app, tournament, match, callback) {
	// Imports

	// Requrements

	async.waterfall([	(wcb) => remove_called_timestamp(match, wcb),
						(wcb) => remove_tablet_on_court(app, tournament.key, match._id, null, wcb),
						(wcb) => remove_tablet_operator_to_list(app, tournament.key, match, wcb),
						(wcb) => update_match_btp(app, match, wcb), 
						(wcb) => update_match_db(app, match, wcb),
						(wcb) => update_court_db(app, match, wcb),
						(wcb) => notify_change_match_edit(app, match, wcb),
						(wcb) => notify_bupws(app, match, wcb),
						(wcb) => remove_player_on_court(app, tournament.key, match._id, null, wcb)
					],
						(err) => {
							return callback(err);
						}
					);
}


async function call_match(app, tournament, match, callback) {
    if (!match.setup.court_id || !match._id) {
        return; // TODO in async we would assert both to be true
    }

	if (match.setup.teams[0].players.length == 0 || match.setup.teams[1].players.length == 0) {
		return callback("Match cannot be called one or more Teams are not set.");
	}

	async.waterfall([	(wcb) => add_called_timestamp(match, wcb),
		(wcb) => add_tabletoperators(app, tournament, match, wcb),
		(wcb) => set_umpires_on_court(app, tournament, match, wcb),
		(wcb) => remove_highlight_preperation(match, wcb),
		(wcb) => update_match_btp(app, match, wcb),
		(wcb) => update_match_db(app, match, wcb),
		(wcb) => update_court_db(app, match, wcb),
		(wcb) => notify_change_match_edit(app, match, wcb),
		(wcb) => notify_change_match_called_on_court(app, match, wcb),
		(wcb) => notify_bupws(app, match, wcb),
		(wcb) => set_player_on_court(app, tournament.key, match.setup, wcb),
		(wcb) => set_player_on_tablet(app, tournament.key, match.setup, wcb)],
		(err) => {
			return callback(err, match);
		}
	);
}

function add_called_timestamp(match, callback) {
	const setup = match.setup;
	const called_timestamp = Date.now();

	setup.called_timestamp = called_timestamp;

	return callback(null);
}

function remove_called_timestamp(match, callback) {
	const setup = match.setup;

	setup.called_timestamp = undefined;

	return callback(null);
}

function remove_tablet_operator_to_list(app, tkey, match, callback) {
	add_tabletoperator_to_tabletoperator_list_by_match(app, tkey, match);

	const setup = match.setup;
	setup.tabletoperators = undefined;

	return callback(null);
}

async function add_tabletoperators(app, tournament, match, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const btp_manager = require('./btp_manager');
	
	const court_id = match.setup.court_id;
    const match_id = match._id;

    if (!court_id || !match_id) {
        return; // TODO in async we would assert both to be true
    }

	const setup = match.setup;

	try {
        if ((tournament.tabletoperator_enabled && tournament.tabletoperator_enabled == true)) {
            if (!setup.tabletoperators || setup.tabletoperators == null) {
                const value = await fetch_tabletoperator(admin, app, tournament.key, court_id);
                if (!setup.umpire_name || (tournament.tabletoperator_with_umpire_enabled && tournament.tabletoperator_with_umpire_enabled == true)) {
                    setup.tabletoperators = value;
                }
            }
        }
    } catch (err) {
        return callback(err);
    }

    if (setup.tabletoperators) {
        for (let operator of setup.tabletoperators) {
            operator.checked_in = false;
        }
        btp_manager.update_players(app, tournament.key, setup.tabletoperators);
    }
	return callback(null);
}

async function set_umpires_on_court(app, tournament, match, callback) {
	const setup = match.setup;
	const court_id = setup.court_id;
	if (!court_id) {
		return; // TODO in async we would assert both to be true
	}

	if (setup.umpire_name) {
		update_umpire(app, tournament.key, setup.umpire_name, 'oncourt', setup.called_timestamp, court_id);
	}

	if (setup.service_judge_name) {
		update_umpire(app, tournament.key, setup.service_judge_name, 'oncourt', setup.called_timestamp, court_id);
	}
	return callback(null);
}

function remove_highlight_preperation(match, callback){
	const setup = match.setup;

	if(setup.highlight && setup.highlight == 6){
		setup.highlight = 0;
	}

	return callback(null);
}

function update_match_db (app, match, callback) {
	const setup = match.setup;
	const match_q = {_id: match._id};
	
	app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
		if (err) {
			return callback(err);
		}
	
		return callback(null);
	});
}

function update_match_btp(app, match, callback) {
	const btp_manager = require('./btp_manager');
	
	// this function also send the changes of this match to btp
	btp_manager.update_highlight(app, match);

	return callback(null);
}

function update_court_db (app, match, callback) {
	const court_q = {_id: match.setup.court_id};
	app.db.courts.find(court_q, (err, courts) => {
		if (err) {
			return callback(err);
		}
		
		if (courts.length !== 1) {
			return callback(null);
		}

		app.db.courts.update(court_q, {$set: {match_id: match._id}}, {}, (err) => {
			return callback(err);
		});
	});
}

function notify_change_match_edit (app, match, callback) {
	const admin = require('./admin'); // avoid dependency cycle

	admin.notify_change(app, match.tournament_key, 'match_edit', {	match__id: match._id,
																	match: match});
	
	return callback(null); 
}


function notify_change_match_called_on_court (app, match, callback) {
	const admin = require('./admin'); // avoid dependency cycle

	admin.notify_change(app, match.tournament_key, 'match_called_on_court', match);
	
	return callback(null); 
}

function notify_bupws(app, match, callback) {
	const bupws = require('./bupws');

	bupws.handle_score_change(app, match.tournament_key, match.setup.court_id);

	return callback(null);
}

function serialized(fn) {
	let queue = Promise.resolve();
	return (...args) => {
		const res = queue.then(() => fn(...args));
		queue = res.catch(() => { });
		return res;
	}
}

const fetch_tabletoperator = serialized(get_last_looser_on_court);

function get_last_looser_on_court(admin, app, tkey, court_id) {
	return new Promise((resolve, reject) => {
		const tabletoperator_querry = { 'tournament_key': tkey, court: null };
		let tabletoperators = undefined;
		app.db.tabletoperators.find(tabletoperator_querry).sort({ 'start_ts': 1 }).limit(1).exec((err, tabletoperator) => {
			if (err) {
				return reject(err);
			}
			var returnvalue = undefined;
			if (tabletoperator && tabletoperator.length == 1) {
				returnvalue = tabletoperator[0].tabletoperator
				app.db.tabletoperators.update({ _id: tabletoperator[0]._id, tournament_key: tkey }, { $set: { court: court_id } }, { returnUpdatedDocs: true }, function (err, numAffected, changed_tabletoperator) {
					if (err) {
						return reject(err);
					}
					admin.notify_change(app, tkey, 'tabletoperator_removed', { tabletoperator: changed_tabletoperator });
					return resolve(returnvalue);
				});
			} else { 
				return resolve(returnvalue);
			}
		});
	});
}

function set_player_on_tablet (app, tkey, match_on_court_setup, callback) {	
	
	if(!match_on_court_setup.tabletoperators || match_on_court_setup.tabletoperators.length == 0) {
		return callback(null);
	}
	
	const admin = require('./admin'); // avoid dependency cycle	
	app.db.matches.find({'tournament_key': tkey}, async (err, matches) => {
		if (err) {
			callback(err);
		}

		async.each(matches, async (match, cb) => {
			if(match.setup.now_on_court == false) {
				return;
			}
			
			const match_id = match._id;
			let tablet_operatorns_btp_ids = [match_on_court_setup.tabletoperators[0].btp_id];

			if(match_on_court_setup.tabletoperators.length > 1) {
				tablet_operatorns_btp_ids.push(match_on_court_setup.tabletoperators[1].btp_id);
			}

			let change = false;
			
			if (match.setup.teams[0].players.length > 0 && tablet_operatorns_btp_ids.includes(match.setup.teams[0].players[0].btp_id)) {
				match.setup.teams[0].players[0].now_tablet_on_court = match_on_court_setup.court_id;
				match.setup.teams[0].players[0].checked_in = false;
				change = true;
			}

			if (match.setup.teams[0].players.length > 1 && tablet_operatorns_btp_ids.includes(match.setup.teams[0].players[1].btp_id)) {
				match.setup.teams[0].players[1].now_tablet_on_court = match_on_court_setup.court_id;
				match.setup.teams[0].players[1].checked_in = false;
				change = true;
			}

			if (match.setup.teams[1].players.length > 0 && tablet_operatorns_btp_ids.includes(match.setup.teams[1].players[0].btp_id)) {
				match.setup.teams[1].players[0].now_tablet_on_court = match_on_court_setup.court_id;
				match.setup.teams[1].players[0].checked_in = false;
				change = true;
			}

			if (match.setup.teams[1].players.length > 1 && tablet_operatorns_btp_ids.includes(match.setup.teams[1].players[1].btp_id)) {
				match.setup.teams[1].players[1].now_tablet_on_court = match_on_court_setup.court_id;
				match.setup.teams[1].players[1].checked_in = false;
				change = true;
			}

			if (change) {
				const setup = match.setup;
				const match_q = {_id: match_id};
				app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
					if (err) return callback(err);
					admin.notify_change(app, match.tournament_key, 'update_player_status', {match__id: match._id,
																							btp_winner: match.btp_winner, 
																							setup: match.setup});
				});
			}
		});

		callback(null);
	});
}


function set_player_on_court (app, tkey, match_on_court_setup, callback) {	
	const admin = require('./admin'); // avoid dependency cycle	
	app.db.matches.find({'tournament_key': tkey}, async (err, matches) => {
		if (err) {
			callback(err);
		}

		async.each(matches, async (match) => {
			if(match.setup.now_on_court == false) {
				return;
			}
			
			const match_id = match._id;
			let on_court_btp_ids = [match_on_court_setup.teams[0].players[0].btp_id, 
						   			match_on_court_setup.teams[1].players[0].btp_id];

			if(match_on_court_setup.teams[0].players.length > 1) {
				on_court_btp_ids.push(match_on_court_setup.teams[0].players[1].btp_id);
			}
			
			if(match_on_court_setup.teams[1].players.length > 1) {
				on_court_btp_ids.push(match_on_court_setup.teams[1].players[1].btp_id);
			}

			let change = false;
			
			if (match.setup.teams[0].players.length > 0 && on_court_btp_ids.includes(match.setup.teams[0].players[0].btp_id)) {
				match.setup.teams[0].players[0].now_playing_on_court = match_on_court_setup.court_id;
				match.setup.teams[0].players[0].tablet_break_active = false;
				change = true;
			}

			if (match.setup.teams[0].players.length > 1 && on_court_btp_ids.includes(match.setup.teams[0].players[1].btp_id)) {
				match.setup.teams[0].players[1].now_playing_on_court = match_on_court_setup.court_id;
				match.setup.teams[0].players[1].tablet_break_active = false;
				change = true;
			}

			if (match.setup.teams[1].players.length > 0 && on_court_btp_ids.includes(match.setup.teams[1].players[0].btp_id)) {
				match.setup.teams[1].players[0].now_playing_on_court = match_on_court_setup.court_id;
				match.setup.teams[1].players[0].tablet_break_active = false;
				change = true;
			}

			if (match.setup.teams[1].players.length > 1 && on_court_btp_ids.includes(match.setup.teams[1].players[1].btp_id)) {
				match.setup.teams[1].players[1].now_playing_on_court = match_on_court_setup.court_id;
				match.setup.teams[1].players[1].tablet_break_active = false;
				change = true;
			}
			if (change) {
				const setup = match.setup;
				const match_q = {_id: match_id};
				app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
					if (err) return callback(err);

					admin.notify_change(app, match.tournament_key, 'update_player_status', {match__id: match._id,
																							btp_winner: match.btp_winner, 
																							setup: match.setup});
				});
			}
		});

		callback(null);
	});
}

function add_player_to_tabletoperator_list(app, tournament_key, cur_match_id, end_ts, callback) {
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
		return callback(null);
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

				// TODO: 'tabletoperator_with_state_enabled'

				if (team && typeof team.players !== 'undefined') {
					var teams = [];
					if (tournament.tabletoperator_split_doubles && team.players.length > 1) {
						for (const player of team.players) {
							var toinsert = player
							if (tournament.tabletoperator_with_state_enabled && player.state) {
								toinsert = create_team_from_player_state(player);
							} 
							var newTeam = {
								players: [toinsert]
							};
							teams.push(newTeam); 
						}
					} else {
						var toinsert = team;
						if (tournament.tabletoperator_with_state_enabled && team.players[0].state) {
							toinsert = {
								players: [create_team_from_player_state(team.players[0])]
							};
						}
						teams.push(toinsert); 
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

function create_team_from_player_state(player) {
	return {
		"asian_name": false,
		"name": player.state,
		"firstname": "",
		"lastname": "",
		"btp_id": -1
	};
}

function add_tabletoperator_to_tabletoperator_list_by_match(app, tournament_key, cur_match) {

	if(cur_match.setup.tabletoperators) {
		var tabletoperator = cur_match.setup.tabletoperators;

		const new_tabletoperator = {
			tournament_key,
			tabletoperator,
			'match_id': cur_match._id,
			'start_ts': tabletoperator[0].last_time_on_court_ts,
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


function remove_player_on_court (app, tkey, cur_match_id, end_ts = null, callback)	{
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
						if(end_ts) {
							match.setup.teams[0].players[0].last_time_on_court_ts = end_ts;
						}
						change = true;
				}

				if (match.setup.teams[0].players.length > 1 && 
					remove_btp_ids.includes(match.setup.teams[0].players[1].btp_id) &&
					match.setup.teams[0].players[1].now_playing_on_court) {
						match.setup.teams[0].players[1].now_playing_on_court = false;
						match.setup.teams[0].players[1].checked_in = false;
						if(end_ts) {
							match.setup.teams[0].players[1].last_time_on_court_ts = end_ts;
						}
						change = true;
				}

				if (match.setup.teams[1].players.length > 0 &&
					remove_btp_ids.includes(match.setup.teams[1].players[0].btp_id) &&
					match.setup.teams[1].players[0].now_playing_on_court) {
						match.setup.teams[1].players[0].now_playing_on_court = false;
						match.setup.teams[1].players[0].checked_in = false;
						if(end_ts) {
							match.setup.teams[1].players[0].last_time_on_court_ts = end_ts;
						}
						change = true;
				}

				if (match.setup.teams[1].players.length > 1 && 
					remove_btp_ids.includes(match.setup.teams[1].players[1].btp_id) &&
					match.setup.teams[1].players[1].now_playing_on_court) {
						match.setup.teams[1].players[1].now_playing_on_court = false;
						match.setup.teams[1].players[1].checked_in = false;
						if(end_ts) {
							match.setup.teams[1].players[1].last_time_on_court_ts = end_ts;
						}
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
	const btp_manager = require('./btp_manager');

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

function remove_umpire_on_court(app, tournament_key, cur_match_id, end_ts, callback) {
	app.db.matches.findOne({ 'tournament_key': tournament_key, '_id': cur_match_id }, (err, cur_match) => {
		if (err) {
			return callback(err);
		}
		if (cur_match.setup.umpire_name) {
		
			update_umpire(app, tournament_key, cur_match.setup.umpire_name, 'ready', end_ts, null);
		}

		if (cur_match.setup.service_judge_name) {
			
			update_umpire(app, tournament_key, cur_match.setup.service_judge_name, 'ready', end_ts, null);
		}
		return callback(null);	

	});
}

function update_umpire(app, tkey, umpire_name, status, last_time_on_court_ts, court_id, callback) {
	app.db.umpires.update({ tournament_key: tkey, name: umpire_name }, { $set: { last_time_on_court_ts: last_time_on_court_ts, status: status, court_id: court_id } }, { returnUpdatedDocs: true }, function (err, numAffected, changed_umpire) {
		if (err) {
			console.error(err);
			return;
		}
		const admin = require('./admin');
		admin.notify_change(app, tkey, 'umpire_updated', changed_umpire);
	});
}

module.exports ={
    add_player_to_tabletoperator_list,
	call_match,
	match_update,
	uncall_match,
	fetch_tabletoperator,
	remove_player_on_court,
	remove_tablet_on_court,
	remove_umpire_on_court
};