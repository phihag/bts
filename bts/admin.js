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
		'btp_ip', 'btp_password','btp_autofetch_timeout_intervall',
		'is_team', 'is_nation_competition',
		'warmup', 'warmup_ready', 'warmup_start',
		'upcoming_matches_animation_speed', 'upcoming_matches_max_count','upcoming_matches_animation_pause',
		'ticker_enabled', 'ticker_url', 'ticker_password',
		'language', 'dm_style', 'displaysettings_general',
		'tabletoperator_enabled', 'tabletoperator_break_seconds',
		'announcement_speed','announcement_pause_time_ms',
		'tabletoperator_set_break_after_tabletservice','tabletoperator_with_state_enabled',
		'tabletoperator_with_state_from_match_enabled',
		'tabletoperator_winner_of_quaterfinals_enabled','tabletoperator_split_doubles',
		'tabletoperator_use_manual_counting_boards_enabled', 'tabletoperator_with_umpire_enabled', 
		'annoncement_include_event', 'annoncement_include_round','annoncement_include_matchnumber',
		'preparation_meetingpoint_enabled', 'preparation_tabletoperator_setup_enabled',
		'call_preparation_matches_automatically_enabled', 'call_next_possible_scheduled_match_in_preparation' ,
		'logo_background_color', 'logo_foreground_color', 'scoring_formats']);

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

function handle_tournament_edit_prop(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (typeof msg.field === 'undefined') {
		return ws.respond(msg, {message: 'Missing field'});
	}

	const allowed_fields = new Set([
		'name', 'tguid',
		'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
		'btp_ip', 'btp_password', 'btp_autofetch_timeout_intervall', 'btp_timezone',
		'is_team', 'is_nation_competition',
		'warmup', 'warmup_ready', 'warmup_start',
		'upcoming_matches_animation_speed', 'upcoming_matches_max_count', 'upcoming_matches_animation_pause',
		'ticker_enabled', 'ticker_url', 'ticker_password',
		'language', 'dm_style', 'displaysettings_general',
		'tabletoperator_enabled', 'tabletoperator_break_seconds',
		'announcement_speed', 'announcement_pause_time_ms',
		'tabletoperator_set_break_after_tabletservice', 'tabletoperator_with_state_enabled',
		'tabletoperator_with_state_from_match_enabled',
		'tabletoperator_winner_of_quaterfinals_enabled', 'tabletoperator_split_doubles',
		'tabletoperator_use_manual_counting_boards_enabled', 'tabletoperator_with_umpire_enabled',
		'annoncement_include_event', 'annoncement_include_round', 'annoncement_include_matchnumber',
		'preparation_meetingpoint_enabled', 'preparation_tabletoperator_setup_enabled',
		'call_preparation_matches_automatically_enabled', 'call_next_possible_scheduled_match_in_preparation',
		'logo_background_color', 'logo_foreground_color',
	]);

	const field = msg.field;
	if (!allowed_fields.has(field)) {
		return ws.respond(msg, {message: 'Unsupported field ' + field});
	}

	const key = msg.key;
	let value = msg.value;
	if (field === 'btp_timezone') {
		value = value === 'system' ? undefined : value;
	}
	const props = {};
	props[field] = value;

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
			if (/^btp_/.test(field)) {
				btp_manager.reconfigure(app, t);
			}
			if (/^ticker_/.test(field)) {
				ticker_manager.reconfigure(app, t);
			}
			notify_change(app, key, 'prop_changed', { field, value: t[field] });

			if (!tournament.displaysettings_general || (field === 'displaysettings_general' && tournament.displaysettings_general != t.displaysettings_general)){
				const bupws = require('./bupws');
				bupws.change_default_display_mode(app, t, tournament.displaysettings_general, t.displaysettings_general);
			}

			ws.respond(msg, err);
		});
	});
}

function handle_tournament_edit_scoring_format(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (! msg.scoring_format) {
		return ws.respond(msg, {message: 'Missing scoring_format'});
	}

	const key = msg.key;
	const scoring_format = msg.scoring_format;
	app.db.tournaments.findOne({ key }, async (err, tournament) => {
		if (err || !tournament) {
			ws.respond(msg, err);
			return;
		}

		const btp_sync = require('./btp_sync');
		const scoring_formats = tournament.scoring_formats || { formats: [], default_id: null };
		const formats = Array.isArray(scoring_formats.formats) ? scoring_formats.formats.slice() : [];
		const index = formats.findIndex(f => Number(f.id) === Number(scoring_format.id));
		if (index === -1) {
			return ws.respond(msg, {message: 'Unknown scoring format ' + scoring_format.id});
		}

		formats[index] = btp_sync._sanitize_scoring_format(scoring_format);
		const updated_scoring_formats = {
			...scoring_formats,
			formats,
		};

		app.db.tournaments.update(
			{ key },
			{ $set: { scoring_formats: updated_scoring_formats } },
			{ returnUpdatedDocs: true },
			function (err) {
				if (err) {
					ws.respond(msg, err);
					return;
				}
				notify_change(app, key, 'scoring_format_changed', {
					scoring_format: formats[index],
				});
				notify_change(app, key, 'props', {
					scoring_formats: updated_scoring_formats,
				});
				ws.respond(msg, err);
			}
		);
	});
}


function handle_tournament_edit_logo(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (! msg.props) {
		return ws.respond(msg, {message: 'Missing props'});
	}

	const key = msg.key;
	const props = utils.pluck(msg.props, [
		'logo_background_color', 'logo_foreground_color']);

	app.db.tournaments.findOne({ key }, async (err, tournament) => {
		if (err || !tournament) {
			ws.respond(msg, err);
			return;
		}
		app.db.tournaments.update({ key }, { $set: props }, { returnUpdatedDocs: true }, function (err) {
			if (err) {
				ws.respond(msg, err);
				return;
			}

			notify_change(app, key, 'logo_changed', {logo_foreground_color : props.logo_foreground_color, logo_background_color: props.logo_background_color});

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

function handle_court_edit(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'court_id'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const court_id = msg.court_id;

	const query = {
		tournament_key,
		_id: court_id,
	};

	app.db.courts.findOne(query, async (err, court) => {
		if (err || !court) {
			ws.respond(msg, err);
			return;
		}
		const is_active = (msg.is_active != undefined ? msg.is_active : court.is_active);
		app.db.courts.update(query, { $set: {is_active} }, {}, (err) => {
			if(err) {
				ws.respond(msg, err);
				return;
			}
			notify_change(app, msg.tournament_key, 'court_changed', {court_id, is_active});
			ws.respond(msg);
			return;
		});
	});
}

function handle_location_changed(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'location_id', 'highlight', 'preparation_addition', 'meetingpoint_announcement'])) {
		return;
	}
	const location_id = msg.location_id;
	const preparation_addition = msg.preparation_addition;
	const meetingpoint_announcement = msg.meetingpoint_announcement;
	const highlight = msg.highlight;

	const query = {
		tournament_key: msg.tournament_key,
		_id: msg.location_id,
	};

	app.db.locations.findOne(query, async (err, old_location) => {
		if(err) {
			ws.respond(msg, err);
			return;
		}

		app.db.locations.update(query, { $set: {highlight, preparation_addition, meetingpoint_announcement} }, {}, (err) => {
			if(err) {
				ws.respond(msg, err);
				return;
			}

			notify_change(app, msg.tournament_key, 'location_changed', {location_id, highlight, preparation_addition, meetingpoint_announcement});
			notify_change(app, msg.tournament_key, 'location_highlight_changed', {old_location_highlight: old_location.highlight, new_location_highlight: highlight});
			

			const match_querry = {
				tournament_key: msg.tournament_key,
				'setup.highlight': old_location.highlight,
			};
			app.db.matches.update(
				match_querry,
				{ $set: { 'setup.highlight': highlight } },
				{ multi: true, returnUpdatedDocs: true },
				(err, numAffected, affectedDocs) => {
					if (err) {
						ws.respond(msg, err);
						return;
					}
			
					const btp_manager = require('./btp_manager');
			
					// Wenn mehrere Matches aktualisiert wurden:
					if (Array.isArray(affectedDocs)) {
						for (const match of affectedDocs) {
							btp_manager.update_highlight(app, match);
						}
					} else if (affectedDocs) {
						// Falls nur ein Match betroffen war
						btp_manager.update_highlight(app, affectedDocs);
					}
			
					ws.respond(msg);
					return;
				}
			);
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
			stournament.get_locations(app.db, tournament.key, function(err, locations) {

				tournament.locations = locations;
				cb(err);
			});
		}, function(cb) {
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
			stournament.get_advertisements(app.db, tournament.key, function (err, advertisements) {
				tournament.advertisements = advertisements;
				cb(err);
			});
		}, function (cb) {
			stournament.get_displaysettings(app.db, tournament.key, function (err, displaysettings) {
				tournament.displaysettings = displaysettings;
				cb(err);
			});
		}], function(err) {
			if (tournament.scoring_formats && Array.isArray(tournament.scoring_formats.formats)) {
				const btp_sync = require('./btp_sync');
				tournament.scoring_formats = {
					...tournament.scoring_formats,
					formats: tournament.scoring_formats.formats.map(f => btp_sync._sanitize_scoring_format(f)),
				};
			}
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
		'scoring_format',
		'called_timestamp',
		'preparation_call_timestamp',
		'location_id',
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
function handle_advertisement_add(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}

	if (!msg.advertisement) {
		return ws.respond(msg, { message: 'Missing required advertisement' });
	}

	app.db.advertisements.insert(msg.advertisement, function (err, inserted_advertisement) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		notify_change(app, msg.tournament_key, 'advertisement_add', { advertisement: inserted_advertisement });
		const bupws = require('./bupws');
		bupws.send_advertisement_add(app, msg.tournament_key,inserted_advertisement);
		return;
	});
}

function handle_advertisement_remove(app, ws, msg) {
	if (!msg.tournament_key) {
		return ws.respond(msg, { message: 'Missing tournament_key' });
	}

	if (!msg.advertisement_id) {
		return ws.respond(msg, { message: 'Missing required advertisement' });
	}

	const query = { _id: msg.advertisement_id };
	app.db.advertisements.remove(query, {}, (err) => {
		notify_change(app, msg.tournament_key, 'advertisement_removed', { advertisement_id: msg.advertisement_id });
		const bupws = require('./bupws');
		bupws.send_advertisement_remove(app, msg.tournament_key,msg.advertisement_id);
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

	if (!_require_msg(ws, msg, ['tournament_key', 'match', 'location_id'])) {
		return;
	}
	if (match_utils.match_completly_initialized(msg.match.setup) == false) {
		return ws.respond("Match cannot be called one or more Teams are not set.");
	}

	const tournament_key = msg.tournament_key;
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (err) {
			return ws.respond(err);
		}

		match_utils.call_match_in_preparation(app, tournament, msg.match, msg.location_id, (err) => {
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



			match_utils.match_update(app, match, undefined, (err) => {
				ws.respond(msg, err);
				return;
			});
		});
	});
}

function handle_match_participant_check_in(app, ws, msg) {
	const match_utils = require('./match_utils');

	if (!_require_msg(ws, msg, ['tournament_key', 'match_id', 'role', 'checked_in'])) {
		return;
	}

	app.db.matches.findOne({ tournament_key: msg.tournament_key, _id: msg.match_id }, async (err, match) => {
		if (err) {
			return ws.respond(msg, err);
		}
		if (!match || !match.setup) {
			return ws.respond(msg, new Error('Match not found'));
		}

		let participant_found = false;
		const checked_in = !!msg.checked_in;

		if (msg.role === 'umpire' || msg.role === 'service_judge') {
			const participant = match.setup[msg.role];
			if (participant && participant.btp_id == msg.participant_id) {
				participant.checked_in = checked_in;
				participant_found = true;
			}
		} else if (msg.role === 'tabletoperator' && Array.isArray(match.setup.tabletoperators)) {
			match.setup.tabletoperators.forEach((participant) => {
				if (participant.btp_id == msg.participant_id) {
					participant.checked_in = checked_in;
					participant_found = true;
				}
			});
		}

		if (!participant_found) {
			return ws.respond(msg, new Error('Participant not found in match'));
		}

		match_utils.match_update(app, match, undefined, (update_err) => {
			ws.respond(msg, update_err);
			return;
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

function handle_emergency_announce(app, ws, msg) {

	if (!_require_msg(ws, msg, ['tournament_key', 'enable'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	const enable = msg.enable;

	notify_change(app, tournament_key, 'emergency_announce', enable);

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

function handle_second_preparation_call_tabletoperator(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_preparation_call_tabletoperator', {setup});
	
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

function handle_second_preparation_call_umpire(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_preparation_call_umpire', { setup });

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

function handle_second_preparation_call_servicejudge(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_preparation_call_servicejudge', { setup });

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


function handle_second_preparation_call_team_one(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_preparation_call_team_one', {setup});
	
	ws.respond(msg);
}

function handle_official_list_move(app, ws, msg) {
  if (!_require_msg(ws, msg, [
    'tournament_key',
    'official_id',
    'from_list',
    'to_list',
    'prev_btp_id',
    'next_btp_id'
  ])) {
    return;
  }

  const {
    tournament_key,
    official_id,
    prev_btp_id,
    next_btp_id,
    from_list,
    to_list
  } = msg;

  // btp_id sicher normalisieren
  const prevId = (prev_btp_id == null) ? null : Number(prev_btp_id);
  const nextId = (next_btp_id == null) ? null : Number(next_btp_id);

  const neighborBtpIds = [];
  if (Number.isFinite(prevId)) neighborBtpIds.push(prevId);
  if (Number.isFinite(nextId)) neighborBtpIds.push(nextId);

  // Query: current über _id, prev/next über btp_id
  const query = {
    tournament_key,
    $or: [{ _id: official_id }]
  };
  if (neighborBtpIds.length > 0) {
    query.$or.push({ btp_id: { $in: neighborBtpIds } });
  }

  app.db.umpires.find(query, function (err, docs) {
    if (err) return cerror.ws(ws, err);

    let currentUmpire = null;
    let prevUmpire = null;
    let nextUmpire = null;

    for (const u of docs) {
      if (u._id === official_id) {
        currentUmpire = u;
        continue;
      }
      if (Number.isFinite(prevId) && Number(u.btp_id) === prevId) {
        prevUmpire = u;
        continue;
      }
      if (Number.isFinite(nextId) && Number(u.btp_id) === nextId) {
        nextUmpire = u;
      }
    }

    if (!currentUmpire) {
      return cerror.ws(ws, new Error('current umpire not found'));
    }

    // --- Timestamp für to_list berechnen gemäß deiner Regeln (robust gegen null) ---
    const now = Date.now();

    const prevTS = (prevUmpire && prevUmpire[to_list] != null) ? Number(prevUmpire[to_list]) : null;
    const nextTS = (nextUmpire && nextUmpire[to_list] != null) ? Number(nextUmpire[to_list]) : null;

    const prevOk = (prevTS != null) && Number.isFinite(prevTS);
    const nextOk = (nextTS != null) && Number.isFinite(nextTS);

    let newTS;

    // Ende der Liste: wenn es keinen Nachfolger gibt -> aktueller Timestamp
    if (!nextUmpire || !nextOk) {
      newTS = now;

    // Anfang der Liste: kein Vorgänger, aber Nachfolger -> zwischen 0 und next
    } else if (!prevUmpire || !prevOk) {
      newTS = nextTS / 2;

    // Zwischen zwei Elementen -> Mittelwert
    } else {
      newTS = (prevTS + nextTS) / 2;
    }

    // --- Update vorbereiten ---
    // Spezifikation:
    // - currentUmpire[from_list] = null
    // - currentUmpire[to_list] = newTS
	    const setObj = {};
		
		    setObj[from_list] = null;
		    setObj['inactive_list'] = null;
		    setObj['service_judge_pause'] = null;
		    setObj['umpire_pause'] = null;
		    setObj['service_judge_wait'] = null;
		    setObj['umpire_wait'] = null;
		    setObj['service_judge_on_court'] = null;
		    setObj['umpire_on_court'] = null;
		    setObj['is_planed_as_service_judge'] = false;
		    setObj['is_planed_as_umpire'] = false;
    setObj[to_list] = newTS;

    app.db.umpires.update(
      { _id: currentUmpire._id, tournament_key },
      { $set: setObj },
      {},
      function (err2) {
        if (err2) return cerror.ws(ws, err2);

        // Optional: aktualisiertes Objekt laden (für Broadcast/Clients)
        app.db.umpires.findOne(
          { _id: currentUmpire._id, tournament_key },
          function (err3, updated) {
            if (err3) return cerror.ws(ws, err3);

            notify_change(app, tournament_key, 'official_list_move', {
              official_id: currentUmpire._id,
              from_list,
              to_list,
              new_ts: newTS,
            });

			ws.respond(msg);	
          }
        );
      }
    );
  });
}

function handle_official_edit(app, ws, msg) {
  // Pflichtfelder prüfen
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'field', 'value'])) {
    return;
  }

  const { tournament_key, official_id, field, value } = msg;

  // Nur diese Felder dürfen vom Client geändert werden
  if (field !== 'is_umpire' && field !== 'is_service_judge') {
    return ws.respond(
      msg,
      new Error('Field not allowed for official_edit: ' + field)
    );
  }

  // Checkbox-Wert normalisieren
  const newVal = !!value;

  // Offiziellen suchen
  app.db.umpires.findOne(
    { _id: official_id, tournament_key },
    function (err, umpire) {
      if (err) {
        return ws.respond(msg, err);
      }

      if (!umpire) {
        return ws.respond(
          msg,
          new Error(
            'Cannot find official ' +
              official_id +
              ' of tournament ' +
              tournament_key +
              ' in database'
          )
        );
      }

      // Update vorbereiten
      const setObj = {};
      setObj[field] = newVal;
      setObj.updated_at = Date.now(); // optional

      // DB-Update
      app.db.umpires.update(
        { _id: official_id, tournament_key },
        { $set: setObj },
        {},
        function (err2) {
          if (err2) {
            return ws.respond(msg, err2);
          }

          // Aktualisiertes Dokument laden (für Broadcast)
          app.db.umpires.findOne(
            { _id: official_id, tournament_key },
            function (err3, updated) {
              if (err3) {
                return ws.respond(msg, err3);
              }

              // Broadcast an alle Clients
              notify_change(app, tournament_key, 'official_edit', {
                official_id,
                field,
                value: newVal
              });

              ws.respond(msg);
            }
          );
        }
      );
    }
  );
}

function handle_add_officials_to_match(app, ws, msg) {
  // 1) Pflichtfelder prüfen
  if (!_require_msg(ws, msg, ['tournament_key', 'match_id'])) {
    return;
  }

  const { tournament_key, match_id } = msg;

  function pack_official(u) {
    return {
      _id: u._id,
      btp_id: u.btp_id,
      name: u.name,
      firstname: u.firstname,
      surname: u.surname,
      country: u.country,
      checked_in: false
    };
  }

  // 2) Match laden und prüfen, ob schon Officials gesetzt sind
  app.db.matches.findOne({ _id: match_id, tournament_key }, function (err, match) {
    if (err) return ws.respond(msg, err);
    if (!match) {
      return ws.respond(
        msg,
        new Error('Cannot find match ' + match_id + ' of tournament ' + tournament_key + ' in database')
      );
    }

    if (match.setup?.umpire || match.setup?.service_judge) {
      return ws.respond(
        msg,
        new Error('Match already has assigned officials')
      );
    }

	const setup = match.setup;

    // 3) Ältesten Umpire suchen
    app.db.umpires
      .find({ tournament_key, umpire_wait: { $ne: null } })
      .sort({ umpire_wait: 1 })
      .limit(1)
      .exec(function (err2, umps) {
        if (err2) return ws.respond(msg, err2);
        if (!umps || umps.length === 0) {
          return ws.respond(msg, new Error('No umpire available'));
        }

        const umpire = umps[0];

        // 4) Atomar reservieren (Race-Condition-sicher)
        app.db.umpires.update(
          { _id: umpire._id, tournament_key, umpire_wait: { $ne: null } },
          { $set: { umpire_wait: null,
				    is_planed_as_umpire: true } },
          {},
          function (err3, affected1) {
            if (err3) return ws.respond(msg, err3);
            if (affected1 === 0) {
              return ws.respond(msg, new Error('Umpire was already taken by another assignment'));
            }

            // 5) Ältesten Service Judge suchen
            app.db.umpires
              .find({ tournament_key, service_judge_wait: { $ne: null } })
              .sort({ service_judge_wait: 1 })
              .limit(1)
              .exec(function (err4, sjs) {
                if (err4) return ws.respond(msg, err4);
                if (!sjs || sjs.length === 0) {
                  // Rollback Umpire
                  app.db.umpires.update(
                    { _id: umpire._id, tournament_key },
                    { $set: { umpire_wait: Date.now(),
				              is_planed_as_umpire: false } }
                  );
                  return ws.respond(msg, new Error('No service judge available'));
                }

                const service_judge = sjs[0];

                // 6) Atomar reservieren
                app.db.umpires.update(
                  { _id: service_judge._id, tournament_key, service_judge_wait: { $ne: null } },
                  { $set: { service_judge_wait: null,
					        is_planed_as_service_judge: true
				   } },
                  {},
                  function (err5, affected2) {
                    if (err5) return ws.respond(msg, err5);
                    if (affected2 === 0) {
                      // Rollback Umpire
                      app.db.umpires.update(
                        { _id: umpire._id, tournament_key },
                        { $set: { umpire_wait: Date.now(),
					              is_planed_as_service_judge: true } }
                      );
                      return ws.respond(msg, new Error('Service judge was already taken'));
                    }

                    // 7) Match.setup updaten
                    setup.umpire = pack_official(umpire);
                    setup.service_judge = pack_official(service_judge);

                    app.db.matches.update(
                      { _id: match_id, tournament_key },
                      { $set: {setup} },
                      {},
                      function (err6) {
                        if (err6) {
                          // Rollback beider Officials
                          app.db.umpires.update(
                            { _id: umpire._id, tournament_key },
                            { $set: { umpire_wait: Date.now()/10,
									  is_planed_as_umpire: false
							 } }
                          );
                          app.db.umpires.update(
                            { _id: service_judge._id, tournament_key },
                            { $set: { service_judge_wait: Date.now()/10,
								    is_planed_as_service_judge: false
							 } }
                          );
                          return ws.respond(msg, err6);
                        }

                        // 8) Broadcast
                        app.db.matches.findOne(
                          { _id: match_id, tournament_key },
                          function (err7, updatedMatch) {
                            if (err7) return ws.respond(msg, err7);

                            notify_change(app, tournament_key, 'match_edit', {match__id: msg.match_id, match: updatedMatch});
							btp_manager.update_score(app, updatedMatch);

                            // Officials ebenfalls broadcasten
                            app.db.umpires.find(
                              { tournament_key, _id: { $in: [umpire._id, service_judge._id] } },
                              function (err8, updatedOfficials) {
                                if (!err8 && updatedOfficials) {
                                  for (const u of updatedOfficials) {
                                    notify_change(app, tournament_key, 'umpire_updated', u);
                                  }
                                }

                                // 9) Erfolg
                                return ws.respond(msg);
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              });
          }
        );
      });
  });
}



function handle_display_delete(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'display_client_id'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const client_id = msg.display_client_id;

	const query_remove = {client_id: client_id};
	app.db.display_court_displaysettings.remove(query_remove, {}, (err) => {
		notify_change(app, tournament_key, 'delete_display', client_id);
	});

	ws.respond(msg);
}

function handle_display_reset(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'display_client_id'])) {
		return;
	}
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_client_id;
	const bupws = require('./bupws');

	bupws.restart_panel(app, tournament_key, client_id);
	ws.respond(msg);
}

function handle_edit_display_setting(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'displaysetting'])) {
		return;
	}
	const bupws = require('./bupws');
	const querry = {id : msg.displaysetting.id};
	const displaysetting = msg.displaysetting;
	const tournament_key = msg.tournament_key;

	app.db.displaysettings.update(querry, {$set: displaysetting}, {returnUpdatedDocs: true}, (err, numAffected, changed_setting) => {

	});

	notify_change(app, msg.tournament_key, 'update_display_setting', {setting: displaysetting});

	app.db.display_court_displaysettings.find({}, function(err, all_displays) {
		if (err) {
			return ws.respond(msg, err);
		}

		const updated_displays = all_displays.filter(
			m => (m.displaysetting_id  == displaysetting.id)
		);

		updated_displays.forEach((display) => {
			bupws.change_display_mode(app, tournament_key, display.client_id, displaysetting.id);
		});

		ws.respond(msg);	
	});
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
	
	ws.respond(msg);
}


function handle_relocate_display(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_setting_id;
	const new_court_id = msg.new_court_id;
	const bupws = require('./bupws');
	bupws.restart_panel(app, tournament_key, client_id, new_court_id);
	ws.respond(msg);
}

function handle_change_display_mode(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const client_id = msg.display_setting_id;
	const new_displaysettings_id = msg.new_displaysettings_id;
	const bupws = require('./bupws');
	bupws.change_display_mode(app, tournament_key, client_id, new_displaysettings_id);
	ws.respond(msg);
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


function handle_second_preparation_call_team_two(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'setup'])) {
		return;
	}

	const tournament_key = msg.tournament_key;
	const setup = _extract_setup(msg.setup);

	notify_change(app, tournament_key, 'second_preparation_call_team_two', {setup});
	
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
	if (!_require_msg(ws, msg, ['tournament_key', 'data_url', 'name'])) {
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
	const logo_name = msg.name;

	const [_, updated_tournament] = await app.db.tournaments.update_async( // eslint-disable-line no-unused-vars
		{key: msg.tournament_key},
		{$set: {logo_id, logo_name}},
		{returnUpdatedDocs: true});
	notify_change(app, msg.tournament_key, 'logo_changed', {logo_id, logo_name});

	return ws.respond(msg, null, {});
}

async function async_handle_tournament_upload_location_logo(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'data_url', 'name', 'location_id'])) {
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
	const logo_name = msg.name;
	const location_id = msg.location_id;
	const tournament_key = msg.tournament_key

	const [_, updated_tournament] = await app.db.locations.update_async( // eslint-disable-line no-unused-vars
		{tournament_key, _id: location_id},
		{$set: {logo_id, logo_name}},
		{returnUpdatedDocs: true});
	notify_change(app, msg.tournament_key, 'location_logo_changed', {location_id, logo_id, logo_name});

	return ws.respond(msg, null, {});
}

module.exports = {
	handle_edit_display_setting,
	async_handle_delete_display_setting,
	async_handle_match_delete,
	async_handle_tournament_upload_logo,
	async_handle_tournament_upload_location_logo,
	handle_begin_to_play_call,
	handle_announce_match_manually,
	handle_btp_fetch,
	handle_confirm_match_finished,
	handle_normalization_add,
	handle_normalization_remove,
	handle_advertisement_add,
	handle_advertisement_remove,
	handle_tabletoperator_add,
	handle_tabletoperator_move_up,
	handle_tabletoperator_move_down,
	handle_tabletoperator_remove,
	handle_fetch_allscoresheets_data,
	handle_create_tournament,
	handle_courts_add,
	handle_court_edit,
	handle_location_changed,
	handle_match_add,
	handle_match_edit,
	handle_match_call_on_court,
	handle_match_preparation_call,
	handle_match_player_check_in,
	handle_match_participant_check_in,
	handle_ticker_pushall,
	handle_ticker_reset,
	handle_free_announce,
	handle_emergency_announce,
	handle_official_list_move,
	handle_official_edit,
	handle_add_officials_to_match,
	handle_second_call_umpire,
	handle_second_preparation_call_umpire,
	handle_second_call_servicejudge,
	handle_second_preparation_call_servicejudge,
	handle_second_call_tabletoperator,
	handle_second_preparation_call_tabletoperator,
	handle_second_call_team_one,
	handle_second_call_team_two,
	handle_second_preparation_call_team_one,
	handle_second_preparation_call_team_two,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit_prop,
	handle_tournament_edit_scoring_format,
	handle_tournament_edit_props,
	handle_tournament_edit_logo,
	handle_display_delete,
	handle_display_reset,
	handle_relocate_display,
	handle_change_display_mode,
	notify_change,
	generate_tournament_web_url,
	on_close,
	on_connect,
};
