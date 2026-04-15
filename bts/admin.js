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
const match_automation = require('./match_automation');


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
		'automation_enabled',
		'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
		'btp_ip', 'btp_password','btp_autofetch_timeout_intervall',
		'is_team', 'is_nation_competition',
		'warmup', 'warmup_ready', 'warmup_start',
		'upcoming_matches_animation_speed', 'upcoming_matches_max_count','upcoming_matches_animation_pause',
		'self_check_in_called_overlay_duration_ms',
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
		'call_preparation_matches_automatically_enabled', 'call_next_possible_scheduled_match_in_preparation',
		'preparation_successor_rally_count',
		'preparation_call_time_limit_before_scheduled_enabled',
		'preparation_call_time_limit_before_scheduled_minutes',
		'preparation_call_block_ahead_limit_enabled',
		'preparation_call_block_ahead_limit',
		'preparation_call_time_ahead_of_frontier_enabled',
		'preparation_call_time_ahead_of_frontier_minutes',
		'preparation_call_matches_ahead_of_frontier_enabled',
		'preparation_call_matches_ahead_of_frontier_limit',
		'preparation_call_player_pause_expired_enabled',
		'preparation_call_technical_officials_available_enabled',
		'call_on_court_time_limit_before_scheduled_enabled',
		'call_on_court_time_limit_before_scheduled_minutes',
		'call_on_court_only_preparation_enabled',
		'call_on_court_only_preparation_minutes',
		'call_on_court_block_ahead_limit_enabled',
		'call_on_court_block_ahead_limit',
		'call_on_court_time_ahead_of_frontier_enabled',
		'call_on_court_time_ahead_of_frontier_minutes',
		'call_on_court_matches_ahead_of_frontier_enabled',
		'call_on_court_matches_ahead_of_frontier_limit',
		'call_on_court_participant_readiness_mode',
		'call_on_court_player_pause_expired_enabled',
		'call_on_court_technical_officials_mode',
		'call_on_court_require_official_space_enabled',
		'official_rotation_mode',
		'technical_official_auto_assignment_mode',
		'technical_official_break_after_assignment_seconds',
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
			if (utils.has_key(props, (k) => k === 'technical_official_auto_assignment_mode' || k === 'official_rotation_mode')) {
				const match_utils = require('./match_utils');
				match_utils.queue_auto_assign_technical_officials_when_available(app, key);
			}
			if (utils.has_key(props, (k) => k === 'technical_official_break_after_assignment_seconds')) {
				const match_utils = require('./match_utils');
				match_utils.queue_process_expired_technical_official_breaks(app, key);
			}
			if (props.automation_enabled === true) {
				const match_utils = require('./match_utils');
				match_utils.queue_auto_assign_technical_officials_when_available(app, key);
				match_utils.queue_auto_execute_preparation_selections(app, key, (selectionErr) => {
					if (selectionErr) {
						console.warn('[bts] failed to resume preparation automation', selectionErr && (selectionErr.stack || selectionErr.message || String(selectionErr)));
						return;
					}
					match_utils.auto_call_matches_on_free_courts(app, key, (callErr) => {
						if (callErr) {
							console.warn('[bts] failed to resume on-court automation', callErr && (callErr.stack || callErr.message || String(callErr)));
						}
					});
				});
			}

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
		'automation_enabled',
		'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
		'btp_ip', 'btp_password', 'btp_autofetch_timeout_intervall', 'btp_timezone',
		'is_team', 'is_nation_competition',
		'warmup', 'warmup_ready', 'warmup_start',
		'upcoming_matches_animation_speed', 'upcoming_matches_max_count', 'upcoming_matches_animation_pause',
		'self_check_in_called_overlay_duration_ms',
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
		'preparation_successor_rally_count',
		'preparation_call_time_limit_before_scheduled_enabled',
		'preparation_call_time_limit_before_scheduled_minutes',
		'preparation_call_block_ahead_limit_enabled',
		'preparation_call_block_ahead_limit',
		'preparation_call_time_ahead_of_frontier_enabled',
		'preparation_call_time_ahead_of_frontier_minutes',
		'preparation_call_matches_ahead_of_frontier_enabled',
		'preparation_call_matches_ahead_of_frontier_limit',
		'preparation_call_player_pause_expired_enabled',
		'preparation_call_technical_officials_available_enabled',
		'call_on_court_time_limit_before_scheduled_enabled',
		'call_on_court_time_limit_before_scheduled_minutes',
		'call_on_court_only_preparation_enabled',
		'call_on_court_only_preparation_minutes',
		'call_on_court_block_ahead_limit_enabled',
		'call_on_court_block_ahead_limit',
		'call_on_court_time_ahead_of_frontier_enabled',
		'call_on_court_time_ahead_of_frontier_minutes',
		'call_on_court_matches_ahead_of_frontier_enabled',
		'call_on_court_matches_ahead_of_frontier_limit',
		'call_on_court_participant_readiness_mode',
		'call_on_court_player_pause_expired_enabled',
		'call_on_court_technical_officials_mode',
		'call_on_court_require_official_space_enabled',
		'official_rotation_mode',
		'technical_official_auto_assignment_mode',
		'technical_official_break_after_assignment_seconds',
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
			if (field === 'automation_enabled' && t[field] === true) {
				const match_utils = require('./match_utils');
				match_utils.queue_auto_assign_technical_officials_when_available(app, key);
				match_utils.queue_auto_execute_preparation_selections(app, key, (selectionErr) => {
					if (selectionErr) {
						console.warn('[bts] failed to resume preparation automation', selectionErr && (selectionErr.stack || selectionErr.message || String(selectionErr)));
						return;
					}
					match_utils.auto_call_matches_on_free_courts(app, key, (callErr) => {
						if (callErr) {
							console.warn('[bts] failed to resume on-court automation', callErr && (callErr.stack || callErr.message || String(callErr)));
						}
					});
				});
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
			is_active: true,
			has_umpire: true,
			has_service_judge: true,
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
		const has_umpire = (msg.has_umpire != undefined ? msg.has_umpire : (court.has_umpire != undefined ? court.has_umpire : true));
		const has_service_judge = (msg.has_service_judge != undefined ? msg.has_service_judge : (court.has_service_judge != undefined ? court.has_service_judge : true));
		app.db.courts.update(query, { $set: {is_active, has_umpire, has_service_judge} }, {}, (err) => {
			if(err) {
				ws.respond(msg, err);
				return;
			}
			notify_change(app, msg.tournament_key, 'court_changed', {court_id, is_active, has_umpire, has_service_judge, match_id: court.match_id ?? null});
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

async function async_handle_preparation_selection_get(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	const selections = await match_automation.fetch_all_location_preparation_selections(app, msg.tournament_key);
	return ws.respond(msg, null, {
		selections: selections.map((selection) => ({
			location_id: selection.location_id,
			required_preparation_count: selection.required_preparation_count,
			current_preparation_count: selection.current_preparation_count,
			missing_preparation_count: selection.missing_preparation_count,
			candidate_match_nums: selection.candidates.map((match) => match?.setup?.match_num).filter((num) => num != null),
			selected_match_nums: selection.selected_matches.map((match) => match?.setup?.match_num).filter((num) => num != null),
		})),
	});
}

async function async_handle_preparation_selection_execute(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'location_id'])) {
		return;
	}

	const match_utils = require('./match_utils');
	try {
		const called_matches = await update_queue.instance().execute(update_queue.named('preparation_selection_execute', async () => {
			const tournament = await app.db.tournaments.findOne_async({ key: msg.tournament_key });
			if (!tournament) {
				throw new Error('Cannot find tournament ' + msg.tournament_key);
			}

			const selection = await match_automation.fetch_location_preparation_selection(app, msg.tournament_key, msg.location_id);
			const called_matches = [];

			for (const match of selection.selected_matches) {
				await new Promise((resolve, reject) => {
					match_utils.call_match_in_preparation(app, tournament, match, msg.location_id, (err) => {
						if (err) return reject(err);
						called_matches.push({
							_id: match._id,
							match_num: match?.setup?.match_num,
						});
						resolve(null);
					});
				});
			}

			return called_matches;
		}));

		return ws.respond(msg, null, {
			location_id: msg.location_id,
			called_matches,
		});
	} catch (err) {
		return ws.respond(msg, err);
	}
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
			app.db.matches.findOne({_id: msg.id, tournament_key}, function(old_err, old_match) {
				if (old_err) {
					ws.respond(msg, old_err);
					return;
				}
				if (!old_match) {
					ws.respond(msg, new Error('Cannot find match ' + msg.id + ' of tournament ' + tournament_key + ' in database'));
					return;
				}

				const dependent_releases = _collect_dependent_official_releases(setup);
				const official_sync_meta = _build_match_edit_official_sync_meta(old_match.setup || {}, setup || {});
				const update_set = { setup };
				if (official_sync_meta.has_official_change) {
					update_set.btp_needsync = true;
				}
				app.db.matches.update({_id: msg.id, tournament_key}, {$set: update_set}, {returnUpdatedDocs: true}, function(err, numAffected, changed_match) {
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

					_apply_match_edit_official_state_changes(app, tournament_key, old_match.setup || {}, changed_match.setup || {}, function(official_err) {
						if (official_err) {
							ws.respond(msg, official_err);
							return;
						}
						_apply_wait_releases(app, tournament_key, dependent_releases, Date.now() / 10, function(release_err) {
							if (release_err) {
								ws.respond(msg, release_err);
								return;
							}
							notify_change(app, tournament_key, 'match_edit', {match__id: msg.id, match: changed_match});
							if (msg.btp_update) {
								btp_manager.update_score(app, changed_match);
							}
							app.db.umpires.find({ tournament_key }, function (umpire_err, all_umpires) {
								if (umpire_err) {
									ws.respond(msg, umpire_err);
									return;
								}
								notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
								ws.respond(msg, err);
							});
						});
					});
				});
			});
		}
	});
}

function _roles_by_official_id_from_setup(setup) {
	const map = new Map();
	['umpire', 'service_judge'].forEach((role) => {
		const official = setup && setup[role];
		if (official && official._id) {
			if (!map.has(official._id)) {
				map.set(official._id, { official, roles: new Set() });
			}
			map.get(official._id).roles.add(role);
		}
	});
	return map;
}

function _build_match_edit_official_sync_meta(old_setup, new_setup) {
	const result = {
		has_official_change: false
	};
	['umpire', 'service_judge'].forEach((role) => {
		const suppressed_key = role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id';
		const old_official = old_setup && old_setup[role];
		const new_official = new_setup && new_setup[role];
		const old_btp_id = old_official && old_official.btp_id != null ? String(old_official.btp_id) : null;
		const new_btp_id = new_official && new_official.btp_id != null ? String(new_official.btp_id) : null;
		if (old_btp_id !== new_btp_id) {
			result.has_official_change = true;
			if (old_official && old_official.btp_id != null) {
				new_setup[suppressed_key] = old_official.btp_id;
			}
		}
		if (new_official && new_official.btp_id != null) {
			delete new_setup[suppressed_key];
		}
	});
	return result;
}

function _collect_dependent_official_releases(setup) {
	const releases = [];
	if (!setup.umpire && setup.service_judge) {
		const dependent = setup.service_judge;
		if (dependent && dependent.btp_id != null) {
			setup.suppressed_service_judge_btp_id = dependent.btp_id;
		}
		delete setup.service_judge;
		if (dependent && dependent._id) {
			releases.push({
				official_id: dependent._id,
				wait_field: 'service_judge_wait',
				target_position: 'front'
			});
		}
	}
	return releases;
}

function _remove_official_from_setup(setup, role) {
	const current_btp_id = setup[role] && setup[role].btp_id != null ? setup[role].btp_id : null;
	delete setup[role];
	if (current_btp_id != null) {
		setup[role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'] = current_btp_id;
	}
	return _collect_dependent_official_releases(setup);
}

function _official_wait_set_obj(wait_field, ts) {
	const setObj = {
		inactive_list: null,
		service_judge_pause: null,
		umpire_pause: null,
		service_judge_manual_pause: null,
		umpire_manual_pause: null,
		service_judge_wait: null,
		umpire_wait: null,
		service_judge_on_court: null,
		umpire_on_court: null,
		is_planed_as_service_judge: false,
		is_planed_as_umpire: false
	};
	setObj[wait_field] = ts;
	return setObj;
}

function _official_list_target_ts(to_list, base_ts, tournament) {
	return base_ts;
}

function _official_list_target_field(to_list) {
	if (to_list === 'umpire_pause') {
		return 'umpire_manual_pause';
	}
	if (to_list === 'service_judge_pause') {
		return 'service_judge_manual_pause';
	}
	return to_list;
}

function _apply_wait_releases(app, tournament_key, releases, start_ts, cb) {
	if (!releases.length) {
		cb(null, []);
		return;
	}
	let index = 0;
	const updated_ids = [];
	const next = () => {
		if (index >= releases.length) {
			cb(null, updated_ids);
			return;
		}
		const release = releases[index++];
		updated_ids.push(release.official_id);
		const release_ts = release.target_position === 'front'
			? index
			: (start_ts + index - 1);
		app.db.umpires.update(
			{ _id: release.official_id, tournament_key },
			{ $set: _official_wait_set_obj(release.wait_field, release_ts) },
			{},
			function (err) {
				if (err) {
					cb(err);
					return;
				}
				next();
			}
		);
	};
	next();
}

function _preferred_wait_field_from_roles(official_doc, old_roles) {
	if (old_roles.has('service_judge') && !old_roles.has('umpire')) {
		return 'service_judge_wait';
	}
	if (old_roles.has('umpire') && !old_roles.has('service_judge')) {
		return 'umpire_wait';
	}
	if (official_doc && official_doc.is_umpire && !official_doc.is_service_judge) {
		return 'umpire_wait';
	}
	if (official_doc && official_doc.is_service_judge && !official_doc.is_umpire) {
		return 'service_judge_wait';
	}
	return 'umpire_wait';
}

function _apply_match_edit_official_state_changes(app, tournament_key, old_setup, new_setup, cb) {
	const old_roles_by_id = _roles_by_official_id_from_setup(old_setup);
	const new_roles_by_id = _roles_by_official_id_from_setup(new_setup);
	const affected_ids = [...new Set([...old_roles_by_id.keys(), ...new_roles_by_id.keys()])];
	if (!affected_ids.length) {
		cb();
		return;
	}

	app.db.umpires.find({ tournament_key, _id: { $in: affected_ids } }, function (err, officials) {
		if (err) {
			cb(err);
			return;
		}
		const official_by_id = new Map((officials || []).map((official) => [official._id, official]));
		const updates = affected_ids.map((official_id) => {
			const official_doc = official_by_id.get(official_id);
			if (!official_doc) {
				return null;
			}
			const old_roles = old_roles_by_id.get(official_id)?.roles || new Set();
			const new_roles = new_roles_by_id.get(official_id)?.roles || new Set();
			const same_roles = old_roles.size === new_roles.size && [...old_roles].every((role) => new_roles.has(role));
			if (same_roles) {
				return null;
			}
			const setObj = {
				inactive_list: null,
				service_judge_pause: null,
				umpire_pause: null,
				service_judge_manual_pause: null,
				umpire_manual_pause: null,
				service_judge_wait: null,
				umpire_wait: null,
				service_judge_on_court: null,
				umpire_on_court: null,
				is_planed_as_service_judge: new_roles.has('service_judge'),
				is_planed_as_umpire: new_roles.has('umpire')
			};
			if (new_roles.size === 0) {
				setObj[_preferred_wait_field_from_roles(official_doc, old_roles)] = Date.now() / 10;
			}
			return { official_id, setObj };
		}).filter(Boolean);

		if (!updates.length) {
			cb();
			return;
		}

		let index = 0;
		const next = () => {
			if (index >= updates.length) {
				cb();
				return;
			}
			const update = updates[index++];
			app.db.umpires.update(
				{ _id: update.official_id, tournament_key },
				{ $set: update.setObj },
				{},
				function (update_err) {
					if (update_err) {
						cb(update_err);
						return;
					}
					next();
				}
			);
		};
		next();
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
		}, { force: true });
	});
}

function handle_match_player_check_in (app, ws, msg) {
	const match_utils = require('./match_utils');

	if (!_require_msg(ws, msg, ['tournament_key', 'player_id', 'match_id', 'checked_in'])) {
		return;
	}

	update_queue.instance().execute(update_queue.named('handle_match_player_check_in', () => new Promise((resolve, reject) => {
		app.db.tournaments.findOne({ key: msg.tournament_key }, async (err, tournament) => {
			if (err) {
				return reject(err);
			}

			app.db.matches.findOne({tournament_key: msg.tournament_key, _id: msg.match_id}, async (err, match) => {
				if (err) {
					return reject(err);
				}
				if (!match || !match.setup) {
					return reject(new Error('Match not found'));
				}

				let player_found = false;
				for (const team of match.setup.teams) {
					for (const player of team.players) {
						if (player.btp_id == msg.player_id) {
							player.checked_in = msg.checked_in;
							player_found = true;
						}
					}
				}

				if (!player_found) {
					return reject(new Error('Player not found in match'));
				}

				match_utils.match_update(app, match, undefined, (err) => {
					if (err) {
						return reject(err);
					}
					console.log('[bts] auto_call_trace:player_check_in_updated', {
						ts: Date.now(),
						tournament_key: msg.tournament_key,
						match_id: msg.match_id,
						player_id: msg.player_id,
						checked_in: !!msg.checked_in,
					});
					trigger_auto_call_after_readiness_change(app, msg.tournament_key);
					resolve();
				});
			});
		});
	}))).then(() => ws.respond(msg)).catch((err) => ws.respond(msg, err));
}

function trigger_auto_call_after_readiness_change(app, tournament_key) {
	const match_utils = require('./match_utils');
	console.log('[bts] auto_call_trace:readiness_trigger_start', {
		ts: Date.now(),
		tournament_key,
	});
	match_utils.queue_auto_execute_preparation_selections(app, tournament_key, (selectionErr) => {
		if (selectionErr) {
			console.warn('[bts] failed to auto select preparation matches after readiness change', selectionErr && (selectionErr.stack || selectionErr.message || String(selectionErr)));
			return;
		}
		console.log('[bts] auto_call_trace:readiness_trigger_after_preparation_selection', {
			ts: Date.now(),
			tournament_key,
		});
		match_utils.auto_call_matches_on_free_courts(app, tournament_key, (callErr) => {
			if (callErr) {
				console.warn('[bts] failed to auto call matches on free courts after readiness change', callErr && (callErr.stack || callErr.message || String(callErr)));
				return;
			}
			console.log('[bts] auto_call_trace:readiness_trigger_after_auto_call', {
				ts: Date.now(),
				tournament_key,
			});
		});
	});
}

function handle_match_participant_check_in(app, ws, msg) {
	const match_utils = require('./match_utils');

	if (!_require_msg(ws, msg, ['tournament_key', 'match_id', 'role', 'checked_in'])) {
		return;
	}

	update_queue.instance().execute(update_queue.named('handle_match_participant_check_in', () => new Promise((resolve, reject) => {
		app.db.tournaments.findOne({ key: msg.tournament_key }, (tournament_err, tournament) => {
			if (tournament_err) {
				return reject(tournament_err);
			}
			app.db.matches.findOne({ tournament_key: msg.tournament_key, _id: msg.match_id }, async (err, match) => {
				if (err) {
					return reject(err);
				}
				if (!match || !match.setup) {
					return reject(new Error('Match not found'));
				}

				let participant_found = false;
				const checked_in = !!msg.checked_in;

				if (msg.role === 'umpire' || msg.role === 'service_judge') {
					if (tournament?.btp_settings?.check_in_per_match === false) {
						return resolve();
					}
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
					return reject(new Error('Participant not found in match'));
				}

				match_utils.match_update(app, match, undefined, (update_err) => {
					if (update_err) {
						return reject(update_err);
					}
					console.log('[bts] auto_call_trace:participant_check_in_updated', {
						ts: Date.now(),
						tournament_key: msg.tournament_key,
						match_id: msg.match_id,
						role: msg.role,
						participant_id: msg.participant_id,
						checked_in,
					});
					if ((msg.role === 'umpire' || msg.role === 'service_judge') && tournament?.btp_settings?.check_in_per_match !== false) {
						const participant = match.setup[msg.role];
						if (!participant) {
							trigger_auto_call_after_readiness_change(app, msg.tournament_key);
							return resolve();
						}
						const official_query = participant._id
							? { tournament_key: msg.tournament_key, _id: participant._id }
							: { tournament_key: msg.tournament_key, btp_id: msg.participant_id };
						return app.db.umpires.update(
							official_query,
							{ $set: { checked_in } },
							{ returnUpdatedDocs: true },
							(official_err, numAffected, updated_official) => {
								if (official_err) {
									return reject(official_err);
								}
								if (numAffected > 0 && updated_official) {
									notify_change(app, msg.tournament_key, 'umpire_updated', updated_official);
								}
								trigger_auto_call_after_readiness_change(app, msg.tournament_key);
								resolve();
							}
						);
					}
					trigger_auto_call_after_readiness_change(app, msg.tournament_key);
					resolve();
				});
			});
		});
	}))).then(() => ws.respond(msg)).catch((err) => ws.respond(msg, err));
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
  const match_utils = require('./match_utils');
  if (!_require_msg(ws, msg, [
    'tournament_key',
    'official_id',
    'from_list',
    'to_list'
  ])) {
    return;
  }

  const {
    tournament_key,
    official_id,
    prev_btp_id,
    next_btp_id,
    prev_official_id,
    next_official_id,
    ordered_official_ids,
    from_list,
    to_list
  } = msg;

  app.db.tournaments.findOne({ key: tournament_key }, function (tournament_err, tournament) {
    if (tournament_err) return cerror.ws(ws, tournament_err);
    if (!tournament) return cerror.ws(ws, new Error('tournament not found'));

    if (Array.isArray(ordered_official_ids) && ordered_official_ids.length > 0) {
      const unique_ordered_ids = [...new Set(ordered_official_ids.filter(Boolean))];
      if (!unique_ordered_ids.includes(official_id)) {
        unique_ordered_ids.push(official_id);
      }
      return app.db.umpires.find({
        tournament_key,
        _id: { $in: unique_ordered_ids }
      }, function(err, docs) {
      if (err) return cerror.ws(ws, err);
      const currentUmpire = docs.find((u) => u._id === official_id);
      if (!currentUmpire) {
        return cerror.ws(ws, new Error('current umpire not found'));
      }

      const now = Date.now();
      const updates = unique_ordered_ids.map((id, index) => {
        const setObj = {};
        if (id === official_id) {
          setObj[from_list] = null;
          setObj['inactive_list'] = null;
          setObj['service_judge_pause'] = null;
          setObj['umpire_pause'] = null;
          setObj['service_judge_manual_pause'] = null;
          setObj['umpire_manual_pause'] = null;
          setObj['service_judge_wait'] = null;
          setObj['umpire_wait'] = null;
          setObj['service_judge_on_court'] = null;
          setObj['umpire_on_court'] = null;
          setObj['is_planed_as_service_judge'] = false;
          setObj['is_planed_as_umpire'] = false;
        }
        setObj[_official_list_target_field(to_list)] = _official_list_target_ts(to_list, now + index, tournament);
        const updated_official = { ...(docs.find((u) => u._id === id) || {}), ...setObj };
        setObj.checked_in = match_utils.get_effective_technical_official_checked_in(updated_official, tournament);
        return { _id: id, setObj };
      });

      return async.eachSeries(updates, function(entry, next) {
        app.db.umpires.update(
          { _id: entry._id, tournament_key },
          { $set: entry.setObj },
          {},
          next
        );
      }, function(err2) {
        if (err2) return cerror.ws(ws, err2);
        app.db.umpires.find(
          { tournament_key, _id: { $in: unique_ordered_ids } },
          function(err3, updatedOfficials) {
            if (err3) return cerror.ws(ws, err3);
            app.db.umpires.find({ tournament_key }, function(err4, all_umpires) {
              if (err4) return cerror.ws(ws, err4);
              updatedOfficials.forEach((updated) => {
                notify_change(app, tournament_key, 'umpire_updated', updated);
              });
              notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
              notify_change(app, tournament_key, 'official_list_move', {
                official_id,
                from_list,
                to_list,
                new_ts: _official_list_target_ts(to_list, now + unique_ordered_ids.indexOf(official_id), tournament),
              });
              ws.respond(msg);
            });
          }
        );
      });
      });
    }

    // btp_id sicher normalisieren
    const prevId = (prev_btp_id == null) ? null : Number(prev_btp_id);
    const nextId = (next_btp_id == null) ? null : Number(next_btp_id);

    const neighborOfficialIds = [];
    if (prev_official_id) neighborOfficialIds.push(prev_official_id);
    if (next_official_id) neighborOfficialIds.push(next_official_id);

    const neighborBtpIds = [];
    if (Number.isFinite(prevId)) neighborBtpIds.push(prevId);
    if (Number.isFinite(nextId)) neighborBtpIds.push(nextId);

    // Query: current über _id, prev/next primär über _id, fallback über btp_id
    const query = {
      tournament_key,
      $or: [{ _id: official_id }]
    };
    if (neighborOfficialIds.length > 0) {
      query.$or.push({ _id: { $in: neighborOfficialIds } });
    }
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
      if (prev_official_id && u._id === prev_official_id) {
        prevUmpire = u;
        continue;
      }
      if (next_official_id && u._id === next_official_id) {
        nextUmpire = u;
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
    newTS = _official_list_target_ts(to_list, newTS, tournament);

    // --- Update vorbereiten ---
    // Spezifikation:
    // - currentUmpire[from_list] = null
    // - currentUmpire[to_list] = newTS
	    const setObj = {};
		
		    setObj[from_list] = null;
		    setObj['inactive_list'] = null;
		    setObj['service_judge_pause'] = null;
		    setObj['umpire_pause'] = null;
		    setObj['service_judge_manual_pause'] = null;
		    setObj['umpire_manual_pause'] = null;
		    setObj['service_judge_wait'] = null;
		    setObj['umpire_wait'] = null;
		    setObj['service_judge_on_court'] = null;
		    setObj['umpire_on_court'] = null;
		    setObj['is_planed_as_service_judge'] = false;
		    setObj['is_planed_as_umpire'] = false;
    setObj[_official_list_target_field(to_list)] = newTS;
    setObj.checked_in = match_utils.get_effective_technical_official_checked_in({ ...currentUmpire, ...setObj }, tournament);

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
            notify_change(app, tournament_key, 'umpire_updated', updated);

			ws.respond(msg);	
          }
        );
      }
    );
    });
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

function handle_official_roles_edit(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'is_umpire', 'is_service_judge'])) {
    return;
  }

  const { tournament_key, official_id } = msg;
  const setObj = {
    is_umpire: !!msg.is_umpire,
    is_service_judge: !!msg.is_service_judge,
    updated_at: Date.now()
  };

  app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err, umpire) {
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

    app.db.umpires.update(
      { _id: official_id, tournament_key },
      { $set: setObj },
      {},
      function (err2) {
        if (err2) {
          return ws.respond(msg, err2);
        }

        app.db.umpires.findOne(
          { _id: official_id, tournament_key },
          function (err3, updated) {
            if (err3) {
              return ws.respond(msg, err3);
            }

            notify_change(app, tournament_key, 'umpire_updated', updated);
            ws.respond(msg);
          }
        );
      }
    );
  });
}

function _assign_next_umpire_to_match(app, tournament_key, match_id, options = {}) {
  const skip_btp_push = options && options.skip_btp_push === true;
  return new Promise((resolve, reject) => {
    app.db.tournaments.findOne({ key: tournament_key }, function (tournament_err, tournament) {
      if (tournament_err) return reject(tournament_err);
    app.db.matches.findOne({ _id: match_id, tournament_key }, function (err, match) {
      if (err) return reject(err);
      if (!match) {
        return reject(
          new Error('Cannot find match ' + match_id + ' of tournament ' + tournament_key + ' in database')
        );
      }

      if (match.setup?.umpire) {
        return reject(
          new Error('Match already has assigned umpire')
        );
      }

	  const setup = match.setup;
	  if (setup.court_id) {
		return app.db.courts.findOne({ tournament_key, _id: setup.court_id }, function(courtErr, court) {
			if (courtErr) return reject(courtErr);
			if (court && court.has_umpire === false) {
				return reject(new Error('Court has no space for an umpire'));
			}
			return continue_assign();
		});
	  }

	  return continue_assign();

	  function continue_assign() {

      app.db.umpires
        .find({ tournament_key, umpire_wait: { $ne: null } })
        .sort({ umpire_wait: 1 })
        .limit(1)
        .exec(function (err2, umps) {
          if (err2) return reject(err2);
          if (!umps || umps.length === 0) {
            return reject(new Error('No umpire available'));
          }

          const umpire = umps[0];

          app.db.umpires.update(
            { _id: umpire._id, tournament_key, umpire_wait: { $ne: null } },
            { $set: { umpire_wait: null,
					      service_judge_wait: null,
					      is_planed_as_umpire: true,
					      is_planed_as_service_judge: false } },
            {},
            function (err3, affected1) {
              if (err3) return reject(err3);
              if (affected1 === 0) {
                return reject(new Error('Umpire was already taken by another assignment'));
              }

              setup.umpire = _pack_official_for_match(umpire, options.tournament || tournament || null);

              app.db.matches.update(
                { _id: match_id, tournament_key, 'setup.umpire': { $exists: false } },
                { $set: { setup, btp_needsync: true } },
                {},
                function (err4, affectedMatch) {
                  if (err4 || affectedMatch === 0) {
                    app.db.umpires.update(
                      { _id: umpire._id, tournament_key },
                      { $set: { umpire_wait: umpire.is_umpire ? Date.now()/10 : null,
							    service_judge_wait: umpire.is_service_judge ? Date.now()/10 : null,
							    is_planed_as_umpire: false,
							    is_planed_as_service_judge: false
						   } }
                    );
                    return reject(err4 || new Error('Match changed during official assignment'));
                  }

                  app.db.matches.findOne(
                    { _id: match_id, tournament_key },
                    function (err5, updatedMatch) {
                      if (err5) return reject(err5);

                      notify_change(app, tournament_key, 'match_edit', {match__id: match_id, match: updatedMatch});
					  if (!skip_btp_push) {
					  	btp_manager.update_score(app, updatedMatch);
					  }

                      app.db.umpires.find(
                        { tournament_key, _id: umpire._id },
                        function (err6, updatedOfficials) {
                          if (err6) {
                            return reject(err6);
                          }
                          if (updatedOfficials) {
                            for (const u of updatedOfficials) {
                              notify_change(app, tournament_key, 'umpire_updated', u);
                            }
                          }
                          app.db.umpires.find({ tournament_key }, function (err7, all_umpires) {
                            if (err7) {
                              return reject(err7);
                            }
                            notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
                            resolve();
                          });
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
    });
    });
  });
}

function assign_next_umpire_to_match(app, tournament_key, match_id) {
  return update_queue.instance().execute(update_queue.named('handle_add_officials_to_match', () => _assign_next_umpire_to_match(app, tournament_key, match_id)));
}

function handle_add_officials_to_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'match_id'])) {
    return;
  }

  const { tournament_key, match_id } = msg;
  assign_next_umpire_to_match(app, tournament_key, match_id)
    .then(() => ws.respond(msg))
    .catch((err) => ws.respond(msg, err));
}

function _assign_next_service_judge_to_match(app, tournament_key, match_id, options = {}) {
  const skip_btp_push = options && options.skip_btp_push === true;
  return new Promise((resolve, reject) => {
    app.db.tournaments.findOne({ key: tournament_key }, function (tournament_err, tournament) {
      if (tournament_err) return reject(tournament_err);
    app.db.matches.findOne({ _id: match_id, tournament_key }, function (err, match) {
      if (err) return reject(err);
      if (!match) {
        return reject(
          new Error('Cannot find match ' + match_id + ' of tournament ' + tournament_key + ' in database')
        );
      }

      if (!match.setup?.umpire) {
        return reject(new Error('Match has no assigned umpire'));
      }
      if (match.setup?.service_judge) {
        return reject(new Error('Match already has assigned service judge'));
      }

      const setup = match.setup;
      if (setup.court_id) {
		return app.db.courts.findOne({ tournament_key, _id: setup.court_id }, function(courtErr, court) {
			if (courtErr) return reject(courtErr);
			if (court && court.has_service_judge === false) {
				return reject(new Error('Court has no space for a service judge'));
			}
			return continue_assign();
		});
      }

      return continue_assign();

      function continue_assign() {

      app.db.umpires
        .find({ tournament_key, service_judge_wait: { $ne: null } })
        .sort({ service_judge_wait: 1 })
        .limit(1)
        .exec(function (err2, sjs) {
          if (err2) return reject(err2);
          if (!sjs || sjs.length === 0) {
            return reject(new Error('No service judge available'));
          }

          const service_judge = sjs[0];

          app.db.umpires.update(
            { _id: service_judge._id, tournament_key, service_judge_wait: { $ne: null } },
            { $set: { service_judge_wait: null, umpire_wait: null, is_planed_as_service_judge: true, is_planed_as_umpire: false } },
            {},
            function (err3, affected) {
              if (err3) return reject(err3);
              if (affected === 0) {
                return reject(new Error('Service judge was already taken'));
              }

              setup.service_judge = _pack_official_for_match(service_judge, options.tournament || tournament || null);

              app.db.matches.update(
                { _id: match_id, tournament_key, 'setup.umpire': { $exists: true }, 'setup.service_judge': { $exists: false } },
                { $set: { setup, btp_needsync: true } },
                {},
                function (err4, affectedMatch) {
                  if (err4 || affectedMatch === 0) {
                    app.db.umpires.update(
                      { _id: service_judge._id, tournament_key },
                      { $set: {
						  service_judge_wait: service_judge.is_service_judge ? Date.now() / 10 : null,
						  umpire_wait: service_judge.is_umpire ? Date.now() / 10 : null,
						  is_planed_as_service_judge: false,
						  is_planed_as_umpire: false
					  } }
                    );
                    return reject(err4 || new Error('Match changed during service judge assignment'));
                  }

                  app.db.matches.findOne(
                    { _id: match_id, tournament_key },
                    function (err5, updatedMatch) {
                      if (err5) return reject(err5);

                      notify_change(app, tournament_key, 'match_edit', { match__id: match_id, match: updatedMatch });
                      if (!skip_btp_push) {
                      	btp_manager.update_score(app, updatedMatch);
                      }

                      app.db.umpires.findOne(
                        { tournament_key, _id: service_judge._id },
                        function (err6, updatedOfficial) {
                          if (err6) {
                            return reject(err6);
                          }
                          if (updatedOfficial) {
                            notify_change(app, tournament_key, 'umpire_updated', updatedOfficial);
                          }
                          app.db.umpires.find({ tournament_key }, function (err7, all_umpires) {
                            if (err7) {
                              return reject(err7);
                            }
                            notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
                            resolve();
                          });
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
    });
    });
  });
}

function assign_next_service_judge_to_match(app, tournament_key, match_id) {
  return update_queue.instance().execute(update_queue.named('handle_add_service_judge_to_match', () => _assign_next_service_judge_to_match(app, tournament_key, match_id)));
}

function handle_add_service_judge_to_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'match_id'])) {
    return;
  }

  const { tournament_key, match_id } = msg;
  assign_next_service_judge_to_match(app, tournament_key, match_id)
    .then(() => ws.respond(msg))
    .catch((err) => ws.respond(msg, err));
}

function _pack_official_for_match(u, tournament = null) {
  const match_utils = require('./match_utils');
  return {
    _id: u._id,
    btp_id: u.btp_id,
    name: u.name,
    firstname: u.firstname,
    surname: u.surname,
    country: u.country,
    is_umpire: !!u.is_umpire,
    is_service_judge: !!u.is_service_judge,
    umpire_wait: u.umpire_wait ?? null,
    service_judge_wait: u.service_judge_wait ?? null,
    checked_in: match_utils.get_effective_technical_official_checked_in(u, tournament)
  };
}

function handle_assign_official_to_preparation_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'match_id', 'role'])) {
    return;
  }

  const { tournament_key, official_id, match_id, role, source_match_id, source_type, source_role } = msg;
  if (role !== 'umpire' && role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid role for assign_official_to_preparation_match: ' + role));
  }
  if (source_type != null && source_type !== 'preparation' && source_type !== 'assigned') {
    return cerror.ws(ws, new Error('Invalid source_type for assign_official_to_preparation_match: ' + source_type));
  }
  if (source_role != null && source_role !== 'umpire' && source_role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid source_role for assign_official_to_preparation_match: ' + source_role));
  }

  const role_flag = role === 'umpire' ? 'is_planed_as_umpire' : 'is_planed_as_service_judge';

  update_queue.instance().execute(update_queue.named('handle_assign_official_to_preparation_match', () => new Promise((resolve, reject) => {
    app.db.tournaments.findOne({ key: tournament_key }, function (tournament_err, tournament) {
      if (tournament_err) return reject(tournament_err);
    app.db.matches.find({ tournament_key, _id: { $in: [...new Set([match_id, source_match_id].filter(Boolean))] } }, function (err, matches) {
      if (err) return reject(err);
      const match = matches.find((m) => m._id === match_id);
      if (!match) return reject(new Error('Cannot find match ' + match_id));
      if ((match.setup || {}).state !== 'preparation') {
        return reject(new Error('Match is not in preparation'));
      }
      const source_match = source_match_id ? matches.find((m) => m._id === source_match_id) : null;
      if (source_match_id && !source_match) {
        return reject(new Error('Cannot find source match ' + source_match_id));
      }
      const same_match_move = !!source_match && source_match._id === match_id;
      if (match.setup && match.setup[role] && (!same_match_move || source_role !== role || match.setup[role]._id !== official_id)) {
        return reject(new Error('Match already has assigned ' + role));
      }
      if (source_match) {
        const source_setup = source_match.setup || {};
        const source_official = source_setup[source_role];
        if (!source_official || source_official._id !== official_id) {
          return reject(new Error('Official is not assigned to the source match/role'));
        }
      }

      app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err2, official) {
        if (err2) return reject(err2);
        if (!official) return reject(new Error('Cannot find official ' + official_id));

        const target_setup = structuredClone(match.setup || {});
        const source_setup = source_match ? structuredClone(source_match.setup || {}) : null;
        if (source_setup && source_role) {
          const current_btp_id = source_setup[source_role] && source_setup[source_role].btp_id != null ? source_setup[source_role].btp_id : null;
          delete source_setup[source_role];
          if (current_btp_id != null) {
            source_setup[source_role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'] = current_btp_id;
          }
          if (same_match_move) {
            delete target_setup[source_role];
            if (current_btp_id != null) {
              target_setup[source_role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'] = current_btp_id;
            }
          }
        }
        target_setup[role] = _pack_official_for_match(official, tournament || null);
        delete target_setup[role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'];

	        const officialSetObj = {
	          inactive_list: null,
	          service_judge_pause: null,
	          umpire_pause: null,
	          service_judge_manual_pause: null,
	          umpire_manual_pause: null,
	          service_judge_wait: null,
          umpire_wait: null,
          service_judge_on_court: null,
          umpire_on_court: null,
          is_planed_as_service_judge: false,
          is_planed_as_umpire: false
        };
        officialSetObj[role_flag] = true;

        app.db.umpires.update(
          { _id: official_id, tournament_key },
          { $set: officialSetObj },
          {},
          function (err3) {
            if (err3) return reject(err3);

            const finish = () => {
              app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err6, updatedOfficial) {
                if (err6) return reject(err6);
                const match_ids = [...new Set([match_id, source_match_id].filter(Boolean))];
                app.db.matches.find({ tournament_key, _id: { $in: match_ids } }, function (err7, updatedMatches) {
                  if (err7) return reject(err7);
                  updatedMatches.forEach((updatedMatch) => {
                    notify_change(app, tournament_key, 'match_edit', { match__id: updatedMatch._id, match: updatedMatch });
                    btp_manager.update_score(app, updatedMatch);
                  });
                  notify_change(app, tournament_key, 'umpire_updated', updatedOfficial);
                  resolve();
                });
              });
            };

            if (same_match_move) {
              const same_guard = { _id: match_id, tournament_key, [`setup.${source_role}._id`]: official_id };
              if (source_role !== role) {
                same_guard[`setup.${role}`] = { $exists: false };
              }
              app.db.matches.update(
                same_guard,
                { $set: { setup: target_setup, btp_needsync: true } },
                {},
                function (err4, affected) {
                  if (err4) return reject(err4);
                  if (!affected) return reject(new Error('Match changed during official reassignment'));
                  finish();
                }
              );
              return;
            }

            const update_source = (cb) => {
              if (!source_match) return cb();
              const source_guard = { _id: source_match_id, tournament_key, [`setup.${source_role}._id`]: official_id };
              app.db.matches.update(
                source_guard,
                { $set: { setup: source_setup, btp_needsync: true } },
                {},
                function (err4, affected) {
                  if (err4) return cb(err4);
                  if (!affected) return cb(new Error('Source match changed during official move'));
                  cb();
                }
              );
            };

            update_source(function (err4) {
              if (err4) return reject(err4);
              const guard = { _id: match_id, tournament_key };
              guard[`setup.${role}`] = { $exists: false };
              app.db.matches.update(
                guard,
                { $set: { setup: target_setup, btp_needsync: true } },
                {},
                function (err5, affected) {
                  if (err5) return reject(err5);
                  if (!affected) return reject(new Error('Match changed during official assignment'));
                  finish();
                }
              );
            });
          }
        );
      });
    });
    });
  }))).then(() => ws.respond(msg)).catch((err) => cerror.ws(ws, err));
}

function handle_assign_official_to_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'match_id', 'role'])) {
    return;
  }

  const { tournament_key, official_id, match_id, role, source_match_id, source_type, source_role } = msg;
  if (role !== 'umpire' && role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid role for assign_official_to_match: ' + role));
  }
  if (source_type != null && source_type !== 'preparation' && source_type !== 'assigned') {
    return cerror.ws(ws, new Error('Invalid source_type for assign_official_to_match: ' + source_type));
  }
  if (source_role != null && source_role !== 'umpire' && source_role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid source_role for assign_official_to_match: ' + source_role));
  }

  const role_flag = role === 'umpire' ? 'is_planed_as_umpire' : 'is_planed_as_service_judge';

  update_queue.instance().execute(update_queue.named('handle_assign_official_to_match', () => new Promise((resolve, reject) => {
    app.db.tournaments.findOne({ key: tournament_key }, function (tournament_err, tournament) {
      if (tournament_err) return reject(tournament_err);
    app.db.matches.find({ tournament_key, _id: { $in: [...new Set([match_id, source_match_id].filter(Boolean))] } }, function (err, matches) {
      if (err) return reject(err);
      const match = matches.find((m) => m._id === match_id);
      if (!match) return reject(new Error('Cannot find match ' + match_id));
      const state = (match.setup || {}).state;
      if (state === 'preparation' || ['oncourt', 'blocked', 'finished'].includes(state)) {
        return reject(new Error('Match cannot be assigned in state ' + state));
      }
      const source_match = source_match_id ? matches.find((m) => m._id === source_match_id) : null;
      if (source_match_id && !source_match) {
        return reject(new Error('Cannot find source match ' + source_match_id));
      }
      const same_match_move = !!source_match && source_match._id === match_id;
      if (match.setup && match.setup[role] && (!same_match_move || source_role !== role || match.setup[role]._id !== official_id)) {
        return reject(new Error('Match already has assigned ' + role));
      }
      if (source_match) {
        const source_setup = source_match.setup || {};
        const source_official = source_setup[source_role];
        if (!source_official || source_official._id !== official_id) {
          return reject(new Error('Official is not assigned to the source match/role'));
        }
      }

      app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err2, official) {
        if (err2) return reject(err2);
        if (!official) return reject(new Error('Cannot find official ' + official_id));

        const target_setup = structuredClone(match.setup || {});
        const source_setup = source_match ? structuredClone(source_match.setup || {}) : null;
        if (source_setup && source_role) {
          const current_btp_id = source_setup[source_role] && source_setup[source_role].btp_id != null ? source_setup[source_role].btp_id : null;
          delete source_setup[source_role];
          if (current_btp_id != null) {
            source_setup[source_role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'] = current_btp_id;
          }
          if (same_match_move) {
            delete target_setup[source_role];
            if (current_btp_id != null) {
              target_setup[source_role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'] = current_btp_id;
            }
          }
        }
        target_setup[role] = _pack_official_for_match(official, tournament || null);
        delete target_setup[role === 'umpire' ? 'suppressed_umpire_btp_id' : 'suppressed_service_judge_btp_id'];

	        const officialSetObj = {
	          inactive_list: null,
	          service_judge_pause: null,
	          umpire_pause: null,
	          service_judge_manual_pause: null,
	          umpire_manual_pause: null,
	          service_judge_wait: null,
          umpire_wait: null,
          service_judge_on_court: null,
          umpire_on_court: null,
          is_planed_as_service_judge: false,
          is_planed_as_umpire: false
        };
        officialSetObj[role_flag] = true;

        app.db.umpires.update(
          { _id: official_id, tournament_key },
          { $set: officialSetObj },
          {},
          function (err3) {
            if (err3) return reject(err3);

            const finish = () => {
              app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err6, updatedOfficial) {
                if (err6) return reject(err6);
                const match_ids = [...new Set([match_id, source_match_id].filter(Boolean))];
                app.db.matches.find({ tournament_key, _id: { $in: match_ids } }, function (err7, updatedMatches) {
                  if (err7) return reject(err7);
                  updatedMatches.forEach((updatedMatch) => {
                    notify_change(app, tournament_key, 'match_edit', { match__id: updatedMatch._id, match: updatedMatch });
                    btp_manager.update_score(app, updatedMatch);
                  });
                  notify_change(app, tournament_key, 'umpire_updated', updatedOfficial);
                  resolve();
                });
              });
            };

            if (same_match_move) {
              const same_guard = { _id: match_id, tournament_key, [`setup.${source_role}._id`]: official_id };
              if (source_role !== role) {
                same_guard[`setup.${role}`] = { $exists: false };
              }
              app.db.matches.update(
                same_guard,
                { $set: { setup: target_setup, btp_needsync: true } },
                {},
                function (err4, affected) {
                  if (err4) return reject(err4);
                  if (!affected) return reject(new Error('Match changed during official reassignment'));
                  finish();
                }
              );
              return;
            }

            const update_source = (cb) => {
              if (!source_match) return cb();
              const source_guard = { _id: source_match_id, tournament_key, [`setup.${source_role}._id`]: official_id };
              app.db.matches.update(
                source_guard,
                { $set: { setup: source_setup, btp_needsync: true } },
                {},
                function (err4, affected) {
                  if (err4) return cb(err4);
                  if (!affected) return cb(new Error('Source match changed during official move'));
                  cb();
                }
              );
            };

            update_source(function (err4) {
              if (err4) return reject(err4);
              const guard = { _id: match_id, tournament_key };
              guard[`setup.${role}`] = { $exists: false };
              app.db.matches.update(
                guard,
                { $set: { setup: target_setup, btp_needsync: true } },
                {},
                function (err5, affected) {
                  if (err5) return reject(err5);
                  if (!affected) return reject(new Error('Match changed during official assignment'));
                  finish();
                }
              );
            });
          }
        );
      });
    });
    });
  }))).then(() => ws.respond(msg)).catch((err) => cerror.ws(ws, err));
}

function handle_remove_official_from_preparation_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'match_id', 'role', 'to_list'])) {
    return;
  }

  const { tournament_key, official_id, match_id, role, to_list, ordered_official_ids } = msg;
  if (role !== 'umpire' && role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid role for remove_official_from_preparation_match: ' + role));
  }

  update_queue.instance().execute(update_queue.named('handle_remove_official_from_preparation_match', () => new Promise((resolve, reject) => {
    app.db.matches.findOne({ _id: match_id, tournament_key }, function (err, match) {
      if (err) return reject(err);
      if (!match) return reject(new Error('Cannot find match ' + match_id));
      const currentOfficial = match.setup && match.setup[role];
      if (!currentOfficial || currentOfficial._id !== official_id) {
        return reject(new Error('Official is not assigned to this preparation role'));
      }

      app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err2, official) {
        if (err2) return reject(err2);
        if (!official) return reject(new Error('Cannot find official ' + official_id));

        const setup = structuredClone(match.setup || {});
        const dependent_releases = _remove_official_from_setup(setup, role);

	        const baseSetObj = {
	          inactive_list: null,
	          service_judge_pause: null,
	          umpire_pause: null,
	          service_judge_manual_pause: null,
	          umpire_manual_pause: null,
	          service_judge_wait: null,
          umpire_wait: null,
          service_judge_on_court: null,
          umpire_on_court: null,
          is_planed_as_service_judge: false,
          is_planed_as_umpire: false
        };

        app.db.matches.update(
          { _id: match_id, tournament_key, [`setup.${role}._id`]: official_id },
          { $set: { setup, btp_needsync: true } },
          {},
          function (err3, affected) {
            if (err3) return reject(err3);
            if (!affected) return reject(new Error('Match changed during official removal'));

            const applyOfficialUpdates = (cb) => {
              if (Array.isArray(ordered_official_ids) && ordered_official_ids.length > 0) {
                const unique_ordered_ids = [...new Set(ordered_official_ids.filter(Boolean))];
                if (!unique_ordered_ids.includes(official_id)) {
                  unique_ordered_ids.push(official_id);
                }
                const now = Date.now();
                return async.eachSeries(unique_ordered_ids, (id, next) => {
                  const setObj = (id === official_id) ? { ...baseSetObj } : {};
                  setObj[_official_list_target_field(to_list)] = _official_list_target_ts(to_list, now + unique_ordered_ids.indexOf(id), null);
                  app.db.umpires.update(
                    { _id: id, tournament_key },
                    { $set: setObj },
                    {},
                    next
                  );
                }, function(series_err) {
                  if (series_err) return cb(series_err);
                  _apply_wait_releases(app, tournament_key, dependent_releases, now + unique_ordered_ids.length, cb);
                });
              }
              const setObj = { ...baseSetObj };
              const now = Date.now();
              setObj[_official_list_target_field(to_list)] = _official_list_target_ts(to_list, now, null);
              app.db.umpires.update(
                { _id: official_id, tournament_key },
                { $set: setObj },
                {},
                function(update_err) {
                  if (update_err) return cb(update_err);
                  _apply_wait_releases(app, tournament_key, dependent_releases, now + 1, cb);
                }
              );
            };

            applyOfficialUpdates(function (err4) {
              if (err4) return reject(err4);

              app.db.matches.findOne({ _id: match_id, tournament_key }, function (err5, updatedMatch) {
                if (err5) return reject(err5);
                const affected_official_ids = [...new Set(
                  (Array.isArray(ordered_official_ids) ? ordered_official_ids.filter(Boolean) : [])
                    .concat([official_id], dependent_releases.map((release) => release.official_id))
                )];
                const officialQuery = { tournament_key, _id: { $in: affected_official_ids } };
                app.db.umpires.find(officialQuery, function (err6, updatedOfficials) {
                  if (err6) return reject(err6);
                  app.db.umpires.find({ tournament_key }, function (err7, all_umpires) {
                    if (err7) return reject(err7);
                    notify_change(app, tournament_key, 'match_edit', { match__id: match_id, match: updatedMatch });
                    btp_manager.update_score(app, updatedMatch);
                    (updatedOfficials || []).forEach((updatedOfficial) => {
                      notify_change(app, tournament_key, 'umpire_updated', updatedOfficial);
                    });
                    notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
                    resolve();
                  });
                });
              });
            });
          }
        );
      });
    });
  }))).then(() => ws.respond(msg)).catch((err) => cerror.ws(ws, err));
}

function handle_remove_official_from_match(app, ws, msg) {
  if (!_require_msg(ws, msg, ['tournament_key', 'official_id', 'match_id', 'role', 'to_list'])) {
    return;
  }

  const { tournament_key, official_id, match_id, role, to_list, ordered_official_ids } = msg;
  if (role !== 'umpire' && role !== 'service_judge') {
    return cerror.ws(ws, new Error('Invalid role for remove_official_from_match: ' + role));
  }

  update_queue.instance().execute(update_queue.named('handle_remove_official_from_match', () => new Promise((resolve, reject) => {
    app.db.matches.findOne({ _id: match_id, tournament_key }, function (err, match) {
      if (err) return reject(err);
      if (!match) return reject(new Error('Cannot find match ' + match_id));
      const currentOfficial = match.setup && match.setup[role];
      if (!currentOfficial || currentOfficial._id !== official_id) {
        return reject(new Error('Official is not assigned to this role'));
      }

      app.db.umpires.findOne({ _id: official_id, tournament_key }, function (err2, official) {
        if (err2) return reject(err2);
        if (!official) return reject(new Error('Cannot find official ' + official_id));

        const setup = structuredClone(match.setup || {});
        const dependent_releases = _remove_official_from_setup(setup, role);

	        const baseSetObj = {
	          inactive_list: null,
	          service_judge_pause: null,
	          umpire_pause: null,
	          service_judge_manual_pause: null,
	          umpire_manual_pause: null,
	          service_judge_wait: null,
          umpire_wait: null,
          service_judge_on_court: null,
          umpire_on_court: null,
          is_planed_as_service_judge: false,
          is_planed_as_umpire: false
        };

        app.db.matches.update(
          { _id: match_id, tournament_key, [`setup.${role}._id`]: official_id },
          { $set: { setup, btp_needsync: true } },
          {},
          function (err3, affected) {
            if (err3) return reject(err3);
            if (!affected) return reject(new Error('Match changed during official removal'));

            const applyOfficialUpdates = (cb) => {
              if (Array.isArray(ordered_official_ids) && ordered_official_ids.length > 0) {
                const unique_ordered_ids = [...new Set(ordered_official_ids.filter(Boolean))];
                if (!unique_ordered_ids.includes(official_id)) {
                  unique_ordered_ids.push(official_id);
                }
                const now = Date.now();
                return async.eachSeries(unique_ordered_ids, (id, next) => {
                  const setObj = (id === official_id) ? { ...baseSetObj } : {};
                  setObj[_official_list_target_field(to_list)] = _official_list_target_ts(to_list, now + unique_ordered_ids.indexOf(id), null);
                  app.db.umpires.update(
                    { _id: id, tournament_key },
                    { $set: setObj },
                    {},
                    next
                  );
                }, function(series_err) {
                  if (series_err) return cb(series_err);
                  _apply_wait_releases(app, tournament_key, dependent_releases, now + unique_ordered_ids.length, cb);
                });
              }
              const setObj = { ...baseSetObj };
              const now = Date.now();
              setObj[_official_list_target_field(to_list)] = _official_list_target_ts(to_list, now, null);
              app.db.umpires.update(
                { _id: official_id, tournament_key },
                { $set: setObj },
                {},
                function(update_err) {
                  if (update_err) return cb(update_err);
                  _apply_wait_releases(app, tournament_key, dependent_releases, now + 1, cb);
                }
              );
            };

            applyOfficialUpdates(function (err4) {
              if (err4) return reject(err4);

              app.db.matches.findOne({ _id: match_id, tournament_key }, function (err5, updatedMatch) {
                if (err5) return reject(err5);
                const affected_official_ids = [...new Set(
                  (Array.isArray(ordered_official_ids) ? ordered_official_ids.filter(Boolean) : [])
                    .concat([official_id], dependent_releases.map((release) => release.official_id))
                )];
                const officialQuery = { tournament_key, _id: { $in: affected_official_ids } };
                app.db.umpires.find(officialQuery, function (err6, updatedOfficials) {
                  if (err6) return reject(err6);
                  app.db.umpires.find({ tournament_key }, function (err7, all_umpires) {
                    if (err7) return reject(err7);
                    notify_change(app, tournament_key, 'match_edit', { match__id: match_id, match: updatedMatch });
                    btp_manager.update_score(app, updatedMatch);
                    (updatedOfficials || []).forEach((updatedOfficial) => {
                      notify_change(app, tournament_key, 'umpire_updated', updatedOfficial);
                    });
                    notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
                    resolve();
                  });
                });
              });
            });
          }
        );
      });
    });
  }))).then(() => ws.respond(msg)).catch((err) => cerror.ws(ws, err));
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
function _notify_queue_hang(payload) {
	for (const admin_ws of all_admins) {
		admin_ws.sendmsg({
			type: 'change',
			tournament_key: admin_ws.last_tournament_key || 'default',
			ctype: 'queue_hang_warning',
			val: payload,
		});
	}
}
function notify_change(app, tournament_key, ctype, val) {
	let payload = val;
	const announcement_change_types = new Set([
		'match_preparation_call',
		'match_called_on_court',
		'begin_to_play_call',
		'second_call_tabletoperator',
		'second_preparation_call_tabletoperator',
		'second_call_umpire',
		'second_preparation_call_umpire',
		'second_call_servicejudge',
		'second_preparation_call_servicejudge',
		'second_call_team_one',
		'second_preparation_call_team_one',
		'second_call_team_two',
		'second_preparation_call_team_two',
		'free_announce',
	]);
	if (payload && typeof payload === 'object' && announcement_change_types.has(ctype) && payload._announcement_ts == null) {
		payload = {
			...payload,
			_announcement_ts: Date.now(),
		};
	}
	if (ctype === 'match_preparation_call' && payload && typeof payload === 'object') {
		console.log('[bts] debug:match_preparation_call_sent', {
			match_id: payload.match__id || payload.match?._id || null,
			announcement_ts: payload._announcement_ts || null,
			state: payload.match?.setup?.state || null,
			highlight: payload.match?.setup?.highlight || 0,
			location_id: payload.match?.setup?.location_id || null,
		});
	}
	for (const admin_ws of all_admins) {
		admin_ws.sendmsg({
			type: 'change',
			tournament_key,
			ctype,
			val: payload,
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
	update_queue.instance().set_hang_reporter(_notify_queue_hang);
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
	async_handle_preparation_selection_get,
	async_handle_preparation_selection_execute,
	handle_match_player_check_in,
	handle_match_participant_check_in,
	handle_ticker_pushall,
	handle_ticker_reset,
	handle_free_announce,
	handle_emergency_announce,
	handle_official_list_move,
	handle_official_edit,
	handle_official_roles_edit,
	handle_add_officials_to_match,
	handle_add_service_judge_to_match,
	assign_next_umpire_to_match,
	assign_next_service_judge_to_match,
	_assign_next_umpire_to_match,
	_assign_next_service_judge_to_match,
	handle_assign_official_to_match,
	handle_assign_official_to_preparation_match,
	handle_remove_official_from_match,
	handle_remove_official_from_preparation_match,
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
	_build_match_edit_official_sync_meta,
	_collect_dependent_official_releases,
	_remove_official_from_setup,
};
