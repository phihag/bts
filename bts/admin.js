'use strict';

const async = require('async');
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid/v4');
const {promisify} = require('util');

const btp_manager = require('./btp_manager');
const update_queue = require('./update_queue');
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

function handle_confirm_match_finished(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament' });
	}
	if (!msg.court_id) {
		return ws.respond(msg, { message: 'Missing court' });
	}
	const bupws = require('./bupws');
	bupws.send_finshed_confirmed(app, msg.tournament_key, msg.court_id);
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
		'name','tguid',
		'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
		'btp_ip', 'btp_password',
		'is_team', 'is_nation_competition',
		'warmup', 'warmup_ready', 'warmup_start',
		'ticker_enabled', 'ticker_url', 'ticker_password',
		'language', 'dm_style', 'displaysettings_general',
		'tabletoperator_enabled', 'tabletoperator_break_seconds',
		'announcement_speed','announcement_pause_time_ms',
		'tabletoperator_set_break_after_tabletservice','tabletoperator_with_state_enabled',
		'tabletoperator_winner_of_quaterfinals_enabled','tabletoperator_split_doubles',
		'tabletoperator_use_manual_counting_boards_enabled', 'tabletoperator_with_umpire_enabled', 
		'annoncement_include_event', 'annoncement_include_round','annoncement_include_matchnumber',
		'preparation_meetingpoint_enabled', 'preparation_tabletoperator_setup_enabled',
		'call_preparation_matches_automatically_enabled', 'call_next_possible_scheduled_match_in_preparation' ,
		'logo_background_color', 'logo_foreground_color']);

	if (msg.props.btp_timezone) {
		props.btp_timezone = msg.props.btp_timezone === 'system' ? undefined : msg.props.btp_timezone;
	}
	app.db.tournaments.findOne({ key }, async (err, tournament) => {
		if (err || !tournament) {
			ws.respond(msg, err);
			return;
		}
		app.db.tournaments.update({ key }, { $set: props }, { returnUpdatedDocs: true }, function (err, num, t) {
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

			if (!tournament.displaysettings_general || (tournament.displaysettings_general != t.displaysettings_general)){

				const bupws = require('./bupws');
				bupws.change_default_display_mode(app, t, tournament.displaysettings_general, t.displaysettings_general);
			}

			ws.respond(msg, err);
		});
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

function generate_tournament_web_url(tournament) {
	var url = "";
	if (tournament.ticker_enabled) {
		url = "https://" + tournament.ticker_url.split("/")[2];
	} else {
		url = "https://" + ((tournament.btp_settings && tournament.btp_settings.tournament_urn) ? tournament.btp_settings.tournament_urn : "www.turnier.de") + "/tournament" + (tournament.tguid ? "/" + tournament.tguid + "/matches" : "s/");
	}
	return url;
}
function handle_tournament_get(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}

	app.db.tournaments.findOne({ key: msg.key }, function (err, tournament) {
		if (!err && !tournament) {
			err = { message: 'No tournament ' + msg.key };
		}
		if (err) {
			ws.respond(msg, err);
			return;
		}
		async.parallel([
		function (cb) { 
			try {
				const qrcode = require('qrcode');
				
				const url = generate_tournament_web_url(tournament);
				qrcode.toDataURL(url, function (error, data) {
					const qrCodeDataUrl = data;
					tournament.mainQrCode = qrCodeDataUrl;
					cb(error);
				});
			} catch (error)
			{ }
		},
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
		}, function (cb) {
			stournament.get_tabletoperators(app.db, tournament.key, function (err, tabletoperators) {
				tournament.tabletoperators = tabletoperators;
				cb(err);
			});
		}, function(cb) {
			stournament.get_matches(app.db, tournament.key, function(err, matches) {
				tournament.matches = matches;
				cb(err);
			});
		}, function (cb) {
		stournament.get_displays(app, tournament, function (err, displays) {
			tournament.displays = displays;
			cb(err);
		});
		}, function (cb) {
			stournament.get_normalizations(app.db, tournament.key, function (err, normalizations) {
				tournament.normalizations = normalizations;
				cb(err);
			});
		}, function (cb) {
		stournament.get_displaysettings(app.db, tournament.key, function (err, displaysettings) {
			tournament.displaysettings = displaysettings;
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
		'umpire',
		'service_judge_name',
		'service_judge',
		'highlight',
		'is_doubles',
		'is_match',
		'incomplete',
		'links',
		'scheduled_time_str',
		'scheduled_date',
		'called_timestamp',
		'preparation_call_timestamp',
		'teams',
		'team_competition',
		'tabletoperators',
		'override_colors',
		'warmup',
		'warmup_ready',
		'warmup_start',
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

function handle_normalization_add(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}

	if (!msg.normalization) {
		return ws.respond(msg, { message: 'Missing required normalization' });
	}

	app.db.normalizations.insert(msg.normalization, function (err, inserted_normalization) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		notify_change(app, msg.tournament_key, 'normalization_add', { normalization: inserted_normalization });
	});
}

function handle_normalization_remove(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}

	if (!msg.normalization_id) {
		return ws.respond(msg, { message: 'Missing required normalization' });
	}

	const query = { _id: msg.normalization_id };
	app.db.normalizations.remove(query, {}, (err) => {
		notify_change(app, msg.tournament_key, 'normalization_removed', {normalization_id: msg.normalization_id});
		return;
	});
}
function handle_tabletoperator_move_up(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}
	if (!msg.tabletoperator) {
		return ws.respond(msg, { message: 'Missing tabletoperator' });
	}
	const tournament_key = msg.tournament_key;
	const tabletoperator = msg.tabletoperator

	const tabletoperator_querry = { 'tournament_key': msg.tournament_key, court: null };

	
	app.db.tabletoperators.find(tabletoperator_querry).sort({ 'start_ts': 1 }).exec((err, tabletoperators) => {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		
		let start_ts_1 = 0;
		let start_ts_2 = 0;
		let index = 0;

		while (index <  tabletoperators.length && tabletoperators[index]._id != tabletoperator._id) {
			start_ts_2 = start_ts_1;
			start_ts_1 = tabletoperators[index].start_ts;
			index++;
		}
		app.db.tabletoperators.update({ _id: tabletoperator._id, tournament_key: tournament_key }, { $set: { start_ts: (start_ts_1 + start_ts_2)/2 } }, { returnUpdatedDocs: true}, function (err, numAffected, changed_tabletoperator) {
			if (err) {
				ws.respond(msg, err);
				return;
			}
			notify_change(app, tournament_key, 'tabletoperator_moved_up', { tabletoperator: changed_tabletoperator });
		});
	});
}

function handle_tabletoperator_move_down(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}
	if (!msg.tabletoperator) {
		return ws.respond(msg, { message: 'Missing tabletoperator' });
	}
	const tournament_key = msg.tournament_key;
	const tabletoperator = msg.tabletoperator

	const tabletoperator_querry = { 'tournament_key': msg.tournament_key, court: null };

	
	app.db.tabletoperators.find(tabletoperator_querry).sort({ 'start_ts': -1 }).exec((err, tabletoperators) => {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		
		let start_ts_1 = Date.now();
		let start_ts_2 = Date.now();
		let index = 0;

		while (index <  tabletoperators.length && tabletoperators[index]._id != tabletoperator._id) {
			start_ts_2 = start_ts_1;
			start_ts_1 = tabletoperators[index].start_ts;
			index++;
		}
		app.db.tabletoperators.update({ _id: tabletoperator._id, tournament_key: tournament_key }, { $set: { start_ts: (start_ts_1 + start_ts_2)/2 } }, { returnUpdatedDocs: true}, function (err, numAffected, changed_tabletoperator) {
			if (err) {
				ws.respond(msg, err);
				return;
			}
			notify_change(app, tournament_key, 'tabletoperator_moved_up', { tabletoperator: changed_tabletoperator });
		});
	});
}
function handle_tabletoperator_remove(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}
	if (!msg.tabletoperator) {
		return ws.respond(msg, { message: 'Missing tabletoperator' });
	}
	const tournament_key = msg.tournament_key;
	const tabletoperator = msg.tabletoperator
	app.db.tabletoperators.update({ _id: tabletoperator._id, tournament_key: tournament_key }, { $set: { court: -1 } }, { returnUpdatedDocs: true}, function (err, numAffected, changed_tabletoperator) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		notify_change(app, tournament_key, 'tabletoperator_removed', { tabletoperator: changed_tabletoperator });
	});
}

function handle_tabletoperator_add(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}
	const tournament_key = msg.tournament_key;
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(err);
		}

		var team = null;
		if (msg.match) {
			const team_id = msg.team_id;
			const match = msg.match
			team = match.setup.teams[team_id];
		} else if (msg.tabletoperator_name) {
			team = {
				"players": [
					{
						"asian_name": false,
						"name": msg.tabletoperator_name,
						"firstname": "",
						"lastname": "",
						"btp_id": -1
					}
				],
				"name": "N/N"
			};

		}
		if (team != null) {
			team.players.forEach((player) => {
				var tabletoperator = [];
				if (tournament.tabletoperator_with_state_enabled && player.state) {
					tabletoperator.push({
						"asian_name": false,
						"name": player.state,
						"firstname": "",
						"lastname": "",
						"btp_id": -1
					});
				} else { 
					tabletoperator.push(player);
				}
				const new_tabletoperator = {
					tournament_key,
					tabletoperator,
					'match_id': 'manually_added',
					'start_ts': Date.now(),
					'end_ts': null,
					'court': null,
					'played_on_court': null
				};
				app.db.tabletoperators.insert(new_tabletoperator, function (err, inserted_tabletoperator) {
					if (err) {
						ws.respond(msg, err);
						return;
					}
					notify_change(app, tournament_key, 'tabletoperator_add', { tabletoperator: inserted_tabletoperator });
				});
			});
		} else {
			return ws.respond(msg, { message: 'Not enough Information to add a tabletoperator to list' });
		}
	});
}

function handle_match_call_on_court(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'court_id', 'match_id'])) {
		return;
	}
	app.db.tournaments.findOne({ key: msg.tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(msg, err);
		}

		update_queue.instance().execute(process_match,app, msg, tournament).then(res => {
			ws.respond(msg);
		}).catch(err => {
			ws.respond(msg, err);
		});
	});

}


function process_match(app, msg, tournament) {
	return new Promise((resolve, reject) => {
		const match_utils = require('./match_utils');
		app.db.matches.findOne({ tournament_key: msg.tournament_key, _id: msg.match_id }, async (err, match) => {
			if (err) {
				reject(err);
				return;
			}
			if (match != null) {
				match.setup.court_id = msg.court_id;
				match.setup.now_on_court = true;
				match_utils.call_match(app, tournament, match, undefined, (err, updated_match) => {
					if (err) {
						reject(err);
					} else {
						resolve(updated_match);
					}
				});
			} else {
				reject(new Error("Match cannot be fetched from DB 222 " + msg.match_id));
			}
		});
	});
}

function handle_match_edit(app, ws, msg) {
	const match_utils = require('./match_utils');
	
	if (!_require_msg(ws, msg, ['tournament_key', 'id', 'match', 'old_court'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	const setup = msg.match.setup;

	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(msg, err);
		}

		if(setup.now_on_court && !setup.called_timestamp) {
			match_utils.call_match(app, tournament, msg.match, msg.old_court, (err, match) => {
				ws.respond(msg, err);
				return;
			});
		} 
		else if(setup.now_on_court && setup.court_id) {
			match_utils.switch_court(app, tournament, msg.match, msg.old_court, (err, match) => {
				ws.respond(msg, err);
				return;
			});
		}
		else if (!setup.now_on_court && setup.called_timestamp) {
			match_utils.uncall_match(app, tournament, msg.match, msg.old_court, (err) => {
				ws.respond(msg, err);
				return;
			});

		} else {
			console.log("ELSE");
			
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
				console.log(changed_match);
				notify_change(app, tournament_key, 'match_edit', {match__id: msg.id, match: changed_match});
				if (msg.btp_update) {
					btp_manager.update_score(app, changed_match);
				}
				ws.respond(msg, err);
			});
		}
	});
}




function handle_match_preparation_call(app, ws, msg) {

	const match_utils = require('./match_utils');

	if (!_require_msg(ws, msg, ['tournament_key', 'id', 'setup'])) {
		return;
	}
	if (match_utils.match_completly_initialized(msg.setup) == false) {
		return ws.respond("Match cannot be called one or more Teams are not set.");
	}

	const tournament_key = msg.tournament_key;
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(err);
		}

		const setup = _extract_setup(msg.setup);
		match_utils.call_match_in_preparation(app, tournament, msg.id, setup, (err) => {
			ws.respond(msg, err);
			return;
		});
	});
}

function handle_match_player_check_in (app, ws, msg) {
	const match_utils = require('./match_utils');

	if (!_require_msg(ws, msg, ['tournament_key', 'player_id', 'match_id', 'checked_in'])) {
		return;
	}

	app.db.tournaments.findOne({ key: msg.tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(msg, err);
		}
		

		app.db.matches.findOne({tournament_key: msg.tournament_key, _id: msg.match_id}, async (err, match) => {
			if (err) {
				return ws.respond(msg, err);
			}
			

			for(const team of match.setup.teams) {
				for(const player of team.players) {
					if(player.btp_id == msg.player_id) {
						player.checked_in = msg.checked_in;
					}
				}
			}



			match_utils.match_update(app, match, (err) => {
				ws.respond(msg, err);
				return;
			});
		});
	});
}


function handle_begin_to_play_call(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'begin_to_play_call', {setup});
	
	ws.respond(msg);
}

function handle_announce_match_manually(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'match'])) {
		return;
	}
	notify_change(app, msg.tournament_key, 'match_called_on_court', msg.match);
	ws.respond(msg);
}


function handle_free_announce(app, ws, msg) {
	if (!_require_msg(ws, msg, ['text'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	const text = msg.text;

	notify_change(app, tournament_key, 'free_announce', {text});

	ws.respond(msg);
}

function handle_second_call_tabletoperator(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_call_tabletoperator', {setup});
	
	ws.respond(msg);
}

function handle_second_call_umpire(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_call_umpire', { setup });

	ws.respond(msg);
}
function handle_second_call_servicejudge(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_call_servicejudge', { setup });

	ws.respond(msg);
}


function handle_second_call_team_one(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_call_team_one', {setup});
	
	ws.respond(msg);
}

function handle_reset_display(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_setting_id;
	const bupws = require('./bupws');
	bupws.restart_panel(app, tournament_key, client_id);
	ws.respond("Angekommen: " + client_id);
}

async function async_handle_delete_display_setting(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const setting_id = msg.setting_id;
	const display = await app.db.display_court_displaysettings.findOne_async({displaysetting_id:setting_id});
	
	if(display) {
		ws.respond(msg, {message: `Could not delete displaysetting ${msg.setting_id} while in use`});
		return;
	}
	const query_remove = {id: setting_id};
	app.db.displaysettings.remove(query_remove, {}, (err) => {
		notify_change(app, tournament_key, 'delete_display_setting', setting_id);
	});
	
	ws.respond("Angekommen: " + setting_id);
}


function handle_relocate_display(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_setting_id;
	const new_court_id = msg.new_court_id;
	const bupws = require('./bupws');
	bupws.restart_panel(app, tournament_key, client_id, new_court_id);
	ws.respond("Angekommen: " + client_id);
}
function handle_change_display_mode(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_setting_id;
	const new_displaysettings_id = msg.new_displaysettings_id;
	const bupws = require('./bupws');
	bupws.change_display_mode(app, tournament_key, client_id, new_displaysettings_id);
	notify_change(app, tournament_key, 'update_general_displaysettings', {});
	ws.respond("Angekommen: " + client_id);
}







function handle_second_call_team_two(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_call_team_two', {setup});
	
	ws.respond(msg);
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
	async_handle_delete_display_setting,
	async_handle_match_delete,
	async_handle_tournament_upload_logo,
	handle_begin_to_play_call,
	handle_announce_match_manually,
	handle_btp_fetch,
	handle_confirm_match_finished,
	handle_normalization_add,
	handle_normalization_remove,
	handle_tabletoperator_add,
	handle_tabletoperator_move_up,
	handle_tabletoperator_move_down,
	handle_tabletoperator_remove,
	handle_fetch_allscoresheets_data,
	handle_create_tournament,
	handle_courts_add,
	handle_match_add,
	handle_match_edit,
	handle_match_call_on_court,
	handle_match_preparation_call,
	handle_match_player_check_in,
	handle_ticker_pushall,
	handle_ticker_reset,
	handle_free_announce,
	handle_second_call_umpire,
	handle_second_call_servicejudge,
	handle_second_call_tabletoperator,
	handle_second_call_team_one,
	handle_second_call_team_two,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit_props,
	handle_reset_display,
	handle_relocate_display,
	handle_change_display_mode,
	notify_change,
	generate_tournament_web_url,
	on_close,
	on_connect,
};