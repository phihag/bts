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
		(wcb) => remove_player_on_court(app, tournament.key, match._id, null, wcb),
		(wcb) => update_btp_courts(app, tournament.key, match, wcb)],
		(err) => {
			return callback(err);
		}
	);
}


async function call_match(app, tournament, match, callback) {
    if (!match.setup.court_id || !match._id) {
        return; // TODO in async we would assert both to be true
    }
	if (match_completly_initialized(match.setup) == false) { 
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
		(wcb) => set_player_on_tablet(app, tournament.key, match.setup, wcb),
		(wcb) => update_btp_courts(app, tournament.key, match, wcb),
		(wcb) => call_next_possible_match_for_preparation(app, tournament.key, wcb)],
		(err) => {
			return callback(err, match);
		}
	);
}

function match_completly_initialized(setup) {
	if (setup.teams[0].players.length == 0 || setup.teams[1].players.length == 0) {
		return false;
	}
	return true;
}

function add_called_timestamp(match, callback) {
	const setup = match.setup;
	const called_timestamp = Date.now();
	setup.called_timestamp = called_timestamp;
	setup.state = 'oncourt';
	remove_preparation_call_timestamp(setup);
	return callback(null);
}

function remove_called_timestamp(match, callback) {
	const setup = match.setup;
	setup.called_timestamp = undefined;
	setup.state = 'scheduled';
	return callback(null);
}

function add_preparation_call_timestamp(setup) {
	setup.highlight = 6;
	setup.preparation_call_timestamp = Date.now();
	setup.state = 'preparartion';
}

function remove_preparation_call_timestamp(setup) {
	setup.preparation_call_timestamp = undefined;
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
                if (!setup.umpire || !setup.umpire.name || (tournament.tabletoperator_with_umpire_enabled && tournament.tabletoperator_with_umpire_enabled == true)) {
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

	if (setup.umpire) {
		update_umpire(app, tournament.key, setup.umpire, 'oncourt', setup.called_timestamp, court_id);
	}

	if (setup.service_judge) {
		update_umpire(app, tournament.key, setup.service_judge, 'oncourt', setup.called_timestamp, court_id);
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

function calc_match_set_player_on_tablet(match, match_on_court_setup) {
	if(match.setup.now_on_court == false) {
		return null;
	}
	
	if(!match_on_court_setup.tabletoperators || match_on_court_setup.tabletoperators.length <1) {
		return null;
	}
	
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
		return match;
	}

	return null;
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
			const changed_match = calc_match_set_player_on_tablet(match, match_on_court_setup)
			if (changed_match != null) {
				const setup = changed_match.setup;
				const match_q = {_id: changed_match._id};
				app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
					if (err) return callback(err);
					admin.notify_change(app, changed_match.tournament_key, 'update_player_status', {match__id: changed_match._id,
																									btp_winner: changed_match.btp_winner, 
																									setup: changed_match.setup});
				});
			}
		});

		callback(null);
	});
}

function calc_match_set_player_on_court(match, match_on_court_setup) {
	if(match.setup.now_on_court == false) {
		return null;
	}
	
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
		match.setup.state = 'blocked';
		change = true;
	}

	if (match.setup.teams[0].players.length > 1 && on_court_btp_ids.includes(match.setup.teams[0].players[1].btp_id)) {
		match.setup.teams[0].players[1].now_playing_on_court = match_on_court_setup.court_id;
		match.setup.teams[0].players[1].tablet_break_active = false;
		match.setup.state = 'blocked';
		change = true;
	}

	if (match.setup.teams[1].players.length > 0 && on_court_btp_ids.includes(match.setup.teams[1].players[0].btp_id)) {
		match.setup.teams[1].players[0].now_playing_on_court = match_on_court_setup.court_id;
		match.setup.teams[1].players[0].tablet_break_active = false;
		match.setup.state = 'blocked';
		change = true;
	}

	if (match.setup.teams[1].players.length > 1 && on_court_btp_ids.includes(match.setup.teams[1].players[1].btp_id)) {
		match.setup.teams[1].players[1].now_playing_on_court = match_on_court_setup.court_id;
		match.setup.teams[1].players[1].tablet_break_active = false;
		match.setup.state = 'blocked';
		change = true;
	}
	if (change) {
		return match;
	}
	return null;
}

function set_player_on_court (app, tkey, match_on_court_setup, callback) {	
	const admin = require('./admin'); // avoid dependency cycle	
	app.db.matches.find({'tournament_key': tkey}, async (err, matches) => {
		if (err) {
			callback(err);
		}

		async.each(matches, async (match) => {
			const changed_match = calc_match_set_player_on_court(match, match_on_court_setup);
			if (changed_match != null) {
				const setup = changed_match.setup;
				const match_q = {_id: changed_match._id};
				app.db.matches.update(match_q, {$set: {setup}}, {}, (err) => {
					if (err) return callback(err);

					admin.notify_change(app, changed_match.tournament_key, 'update_player_status', {match__id: changed_match._id,
																							btp_winner: changed_match.btp_winner, 
																							setup: changed_match.setup});
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
					return callback(err);
				}
				add_player_to_tabletoperator_list_by_match(app, tournament, tournament_key, cur_match, end_ts, callback)
			});
		} else {
			return callback(null);
		}
	});
}

function add_player_to_tabletoperator_list_by_match(app, tournament, tournament_key, cur_match, end_ts, callback) {
	if (cur_match.network_score) {
		// walkovers and retirements will not be recorgnized.
		app.db.tabletoperators.findOne({ 'tournament_key': tournament_key, 'match_id': cur_match._id }, (err, no_tabletoperator) => {
			if (err) {
				return callback(err);
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

					var i = 0;
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
								return callback(err);
							}
							const admin = require('./admin'); // avoid dependency cycle
							admin.notify_change(app, tournament_key, 'tabletoperator_add', { tabletoperator: inserted_t });
							if (i == teams.length - 1) {
								callback(null);
							}
							i++;
						});
					}
				} else {
					return callback(null);
				}
			} else {
				return callback(null);
			}
		});
	} else {
		return callback(null);
	}
}
function fetch_match(app, tournament_key, match_id) {
	return new Promise((resolve, reject) => {
		app.db.matches.findOne({ tournament_key: tournament_key, _id: match_id }, async (err, match) => {
			if (err) {
				return reject(err);
			}
			if (match != null) {
				return resolve(match)
			} else {
				return reject("Match cannot be fetched from DB 111 " + match_id);
			}
		});
	});
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
		if (cur_match.setup.umpire) {
		
			update_umpire(app, tournament_key, cur_match.setup.umpire, 'ready', end_ts, null);
		}

		if (cur_match.setup.service_judge) {
			
			update_umpire(app, tournament_key, cur_match.setup.service_judge, 'ready', end_ts, null);
		}
		return callback(null);	

	});
}

function set_umpire_to_standby(app, tournament_key, setup) {
	if (setup.umpire) {
		update_umpire(app, tournament_key, setup.umpire, 'standby', null, null);
	}

	if (setup.service_judge) {
		update_umpire(app, tournament_key, setup.service_judge, 'standby', null, null);
	}
}



function update_umpire(app, tkey, umpire, status, last_time_on_court_ts, court_id, callback) {
	app.db.umpires.update({ tournament_key: tkey, name: umpire.name }, { $set: { last_time_on_court_ts: last_time_on_court_ts, status: status, court_id: court_id } }, { returnUpdatedDocs: true }, function (err, numAffected, changed_umpire) {
		if (err) {
			console.error(err);
			return;
		}
		const admin = require('./admin');
		admin.notify_change(app, tkey, 'umpire_updated', changed_umpire);
	});
}


function call_preparation_match_on_court(app, tournament_key, court_id) {
	return new Promise((resolve, reject) => {
		app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
			if (err) {
				return reject("No tournament found for ");
			}
			if (tournament.call_preparation_matches_automatically_enabled) {
				const match_querry = { 'tournament_key': tournament_key, 'setup.highlight': 6 };
				app.db.matches.find(match_querry).sort({ 'setup.preparation_call_timestamp': 1 }).exec((err, matches) => {
					if (err) {
						return reject(msg, err);
					}
					if (matches && matches.length > 0) {
						const next_match = matches[0];
						next_match.setup.court_id = court_id;
						next_match.setup.now_on_court = true;
						call_match(app, tournament, next_match, (err) => {
							if (err) {
								return reject(err);
							} else {
								return resolve(next_match);
							}
						});

					} else {
						return reject("No match found to call on court.");
					}
				});
			} else {
				return resolve("Function call_preparation_matches_automatically_enabled disabled");
			}
		});
	});
}

async function call_next_possible_match_for_preparation(app, tournament_key, callback) {
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return callback("No tournament found for ");
		}
		if (tournament.call_next_possible_scheduled_match_in_preparation) {
			const match_querry = { 'tournament_key': tournament_key, 'setup.state': 'scheduled' };
			app.db.matches.find(match_querry).sort({ 'setup.scheduled_date': 1, 'setup.scheduled_time_str': 1, 'match_order': 1 }).exec((err, matches) => {
				if (err) {
					return callback(msg, err);
				}
				if (matches && matches.length > 0) {
					const now = new Date();
					for (var i = 0; i < matches.length; ++i) {
						var match = matches[i];
						var possible = true;
						for (let team_index = 0; team_index < Math.min(match.setup.teams.length, match.setup.teams.length); team_index++) {
							for (let player_index = 0; player_index < Math.min(match.setup.teams[team_index].players.length, match.setup.teams[team_index].players.length); player_index++) {
								if (possible == true) {
									const player = match.setup.teams[team_index].players[player_index];
									if (player.now_playing_on_court != undefined) {
										if (player.now_playing_on_court === false) {
											possible = true;
										} else {
											possible = false;
										}
									}
									if (possible) { 
										if (player.now_tablet_on_court != undefined) {
											if (player.now_tablet_on_court === false) {
												possible = true;
											} else {
												possible = false;
											}
										}
										if (possible) {
											if (player.last_time_on_court_ts) {
												const last_time_on_court = new Date(player.last_time_on_court_ts);
												if ((now - last_time_on_court) < tournament.btp_settings.pause_duration_ms) {
													possible = false;
												} else {
													possible = true;
												}
											}
										}
									}
								}
							}
						}
						if (possible) {
							call_match_in_preparation(app, tournament,match._id, match.setup, callback);
							break;
						}
					}
				} else {
					return callback("No match found to call on court.");
				}
			});
		} else {
			return callback(null);
		}
	});
}


async function call_match_in_preparation(app, tournament, match_id, setup, callback) {
	add_preparation_call_timestamp(setup);
	const tournament_key = tournament.key;
	const admin = require('./admin');

	if (tournament.preparation_tabletoperator_setup_enabled) {
		if (!setup.umpire || (tournament.tabletoperator_with_umpire_enabled && tournament.tabletoperator_with_umpire_enabled == true)) {
			if (!setup.tabletoperators || setup.tabletoperators == null) {
				setup.tabletoperators = await fetch_tabletoperator(admin, app, tournament_key, "prep_call");
			}
		}
	}
	set_umpire_to_standby(app, tournament_key, setup);

	app.db.matches.update({ _id: match_id, tournament_key }, { $set: { setup } }, { returnUpdatedDocs: true }, function (err, numAffected, changed_match) {
		if (err) {
			return callback(err);
		}
		if (numAffected !== 1) {
			return callback(new Error('Cannot find match ' + match_id + ' of tournament ' + tournament_key + ' in database'));
		}
		if (changed_match._id !== match_id) {
			const errmsg = 'Match ' + changed_match._id + ' changed by accident, intended to change ' + match_id + ' (old nedb version?)';
			serror.silent(errmsg);
				
			return callback(new Error(errmsg));
		}
		admin.notify_change(app, tournament_key, 'match_preparation_call', { match__id: match_id, match: changed_match });
		const btp_manager = require('./btp_manager');
		btp_manager.update_highlight(app, changed_match);
		return callback (null);
	});
}

function update_btp_courts(app, tournament_key, match, callback) {
	const stournament = require('./stournament');
	const btp_manager = require('./btp_manager');
	stournament.get_courts(app.db, tournament_key, (err, all_courts) => {
		if (err) {
			callback(err);
			return;
		}

		const courts = [];

		all_courts.forEach((element, index) => {
			if (match.setup.court_id === element._id && match.setup.now_on_court) {
				const court = {
					btp_id: element.btp_id,
					btp_match_id: match.btp_match_ids[0].id,
				}

				courts.push(court);
			} else if (element.match_id && element.match_id == ("btp_" + match.btp_id) && !match.setup.now_on_court) {
				const court = {
					btp_id: element.btp_id
				}

				courts.push(court);
			}
		});

		btp_manager.update_courts(app, tournament_key, courts);

		callback(null);
		return;
	});
}
function reset_player_tabletoperator(app, tournament_key, match_id, end_ts) {
	return new Promise((resolve, reject) => {
		async.waterfall([
			cb => remove_player_on_court(app, tournament_key, match_id, end_ts, cb),
			cb => remove_tablet_on_court(app, tournament_key, match_id, end_ts, cb),
			cb => remove_umpire_on_court(app, tournament_key, match_id, end_ts, cb),
			cb => add_player_to_tabletoperator_list(app, tournament_key, match_id, end_ts, cb)
		], function (err) {
			if (err) {
				return reject(err);
			}
			return resolve(null);
		});
	});
}

module.exports ={
    add_player_to_tabletoperator_list,
	call_match,
	calc_match_set_player_on_court,
	calc_match_set_player_on_tablet,
	match_update,
	uncall_match,
	fetch_match,
	fetch_tabletoperator,
	match_completly_initialized,
	remove_player_on_court,
	remove_tablet_on_court,
	remove_umpire_on_court,
	set_umpire_to_standby,
	add_preparation_call_timestamp,
	remove_preparation_call_timestamp,
	reset_player_tabletoperator,
	call_preparation_match_on_court,
	call_next_possible_match_for_preparation,
	call_match_in_preparation
};