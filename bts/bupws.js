'use strict';
const async = require('async');
const serror = require('./serror');
const utils = require('./utils');
const admin = require('./admin');
const dns = require('dns');
const cp = require('child_process');
const os = require('os');

const btp_manager = require('./btp_manager');
const btp_conn = require('./btp_conn');
const ticker_manager = require('./ticker_manager');
const update_queue = require('./update_queue');
const stournament = require('./stournament');
const all_panels = [];

const default_tournament_key = 'default';
const default_displaysettings_key = default_tournament_key;
function on_close(app, ws) {
	if (!utils.remove(all_panels, ws)) {
		serror.silent('Removing Scoreboard ws, but it was not connected!?');
	}
	notify_admin_display_status_changed(app, ws, false);
}

async function on_connect(app, ws) {
	all_panels.push(ws);
	notify_admin_display_status_changed(app, ws, true);
}

async function notify_admin_display_status_changed(app, ws, ws_online) {
	app.db.tournaments.findOne({ key: default_tournament_key }, async (err, tournament) => {
		if (!err || !tournament) {
			err = { message: 'No tournament ' + default_tournament_key };
		}
		const client_id = determine_client_id(ws);
		const hostname = await determine_client_hostname(ws);
		var display_court_displaysetting = await get_display_court_displaysettings(app, client_id);
		if (display_court_displaysetting == null) {
			display_court_displaysetting = create_display_court_displaysettings(client_id, hostname, null, generate_default_displaysettings_id(tournament));
		}
		display_court_displaysetting.online = ws_online;
		admin.notify_change(app, default_tournament_key, 'display_status_changed', {'display_court_displaysetting': display_court_displaysetting });	
	});
}

function generate_default_displaysettings_id(tournament) {
	return (tournament && tournament.displaysettings_general) ? tournament.displaysettings_general : default_displaysettings_key;
}

function notify_change(tournament_key, court_id, ctype, val) {
	for (const panel_ws of all_panels) {
		notify_change_ws(panel_ws, tournament_key, court_id, ctype, val);
	}
}

function notify_change_broadcast(tournament_key, ctype, val) {
	for (const panel_ws of all_panels) {
		notify_change_send(panel_ws, tournament_key, ctype, val);
	}
}

function notify_change_ws(ws, tournament_key, court_id, ctype, val) {
	if (ws == null) {
		notify_change(tournament_key, court_id, ctype, val);
	} else { 
		if (ws.court_id === court_id) { 
			notify_change_send(ws,tournament_key, ctype, val);
		}
	}
}

function notify_change_send(ws,tournament_key, ctype, val) {
	ws.sendmsg({
		type: 'change',
		tournament_key,
		ctype,
		val,
	});
}

function send_courts(app, ws, tournament_key) {
	stournament.get_courts(app.db, tournament_key, function (err, courts) {
		notify_change_ws(ws,tournament_key, ws.court_id, "courts-update", courts);
	});
}
function send_error(ws, tournament_key, msg) {
	ws.sendmsg({
		type: 'error',
		tournament_key,
		msg
	});
}

function all_matches_delivery() {
	for (const panel_ws of all_panels) {
		if (panel_ws.court_id === undefined) {
			return true;
		}
	}
}

async function handle_reset_display_settings(app, ws, msg) {
	const client_id = determine_client_id(ws);
	var client_court_displaysetting = await get_display_court_displaysettings(app, client_id);
	if (client_court_displaysetting != null) {
		const updatevalues = {
			client_id: 'deleted'
		}
		client_court_displaysetting = await update_client_court_displaysetting(app, client_court_displaysetting.client_id, updatevalues);
	}
}

async function handle_persist_display_settings(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const court_id = msg.panel_settings.court_id;
	var setting = msg.panel_settings;

	const client_id = determine_client_id(ws);
	const hostname = await determine_client_hostname(ws);
	var client_court_displaysetting = await get_display_court_displaysettings(app, client_id);
	if (client_court_displaysetting == null) {
		setting.id = tournament_key + "_" + court_id + " _" + Date.now();
		setting = await persist_displaysetting(app, tournament_key, setting);
		client_court_displaysetting = create_display_court_displaysettings(client_id, hostname, court_id, setting.id);
		client_court_displaysetting = await persist_client_court_displaysetting(app, client_court_displaysetting);
	} else {
		setting.id = tournament_key + "_" + court_id + " _" + Date.now();
		setting = await persist_displaysetting(app, tournament_key, setting);
		const updatevalues = {
			court_id: court_id,
			displaysetting_id: setting.id,
		}
		client_court_displaysetting = await update_client_court_displaysetting(app, client_court_displaysetting.client_id, updatevalues);
	}
}
async function handle_score_update(app, ws, msg) {
	const match_utils = require('./match_utils');
	const tournament_key = msg.tournament_key;
	const score_data = msg.score;
	const match_id = score_data.match_id;
	
	var match = await match_utils.fetch_match(app, tournament_key, match_id);
	if (match == null || match.setup.now_on_court == false) {
		send_error(ws, tournament_key, "Match not found or not on court actualy.");
		return;
	}
	const update = {
		network_score: score_data.network_score,
		network_team1_left:score_data.network_team1_left,
		network_team1_serving:score_data.network_team1_serving,
		network_teams_player1_even:score_data.network_teams_player1_even,
		presses:score_data.presses,
		duration_ms:score_data.duration_ms,
		end_ts:score_data.end_ts,
		'setup.now_on_court': true,
	};

	const device_info = score_data.device;
	if (device_info) {
		const client_ip = ws._socket.remoteAddress;
		device_info.client_ip = client_ip;
	}

	const finish_confirmed = score_data.finish_confirmed ? score_data.finish_confirmed : false;
	if (finish_confirmed) {
		update.team1_won = score_data.team1_won,
			update.btp_winner = (update.team1_won === true) ? 1 : 2;
		update.btp_needsync = true;
		update["setup.now_on_court"] = false;
	}

	if (score_data.shuttle_count) {
		update.shuttle_count = score_data.shuttle_count;
	}
	const match_query = {
		_id: match_id,
		tournament_key,
	};

	const court_q = {
		tournament_key,
		_id: score_data.court_id,
	};
	const db = app.db;
	async.waterfall([
		cb => db.matches.update(match_query, { $set: update }, { returnUpdatedDocs: true }, (err, _, match) => cb(err, match)),
		(match, cb) => {
			if (match) {
				handle_score_change(app, tournament_key, match.setup.court_id);
				admin.notify_change(app, tournament_key, 'score', {
					match_id,
					network_score: update.network_score,
					team1_won: update.team1_won,
					shuttle_count: update.shuttle_count,
					presses: match.presses,
				});
			}
			cb(null, match);
		},
		(match, cb) => {
			if (match) {
				if (finish_confirmed) {
					update_queue.instance().execute(match_utils.reset_player_tabletoperator, app, tournament_key, match_id, update.end_ts)
						.then(() => {
							cb(null, match);
						})
						.catch((err) => {
							console.error("Error in reset_player_tabletoperator:", err);
							cb(null, match);
						});

				} else {
					cb(null, match);
				}
			} else {
				cb(null, match);
			}
		},
		(match, cb) => db.courts.findOne(court_q, (err, court) => cb(err, match, court)),
		(match, court, cb) => {
			if (!match) {
				if (court.match_id === match_id) {
					cb(null, match, court, false);
					return;
				}

				db.courts.update(court_q, { $set: { match_id: match_id } }, {}, (err) => {
					cb(err, match, court, true);
				});
			}
			cb(null, match, court, true);
		},
		(match, court, changed_court, cb) => {
			if (match && changed_court) {
				admin.notify_change(app, tournament_key, 'court_current_match', {
					match__id: match_id,
					match: match,
				});
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (match) {
				btp_manager.update_score(app, match);
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (match && match.setup.highlight &&
				match.setup.highlight == 6 &&
				match.network_score &&
				match.network_score.length > 0 &&
				match.network_score[0].length > 1 &&
				(match.network_score[0][0] > 0 || match.network_score[0][1] > 0)) {
				match.setup.highlight = 0;
				btp_manager.update_highlight(app, match);
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (changed_court) {
				ticker_manager.pushall(app, tournament_key);
			} else {
				if (match) {
					ticker_manager.update_score(app, match);
				}
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (!match) {
				return cb(new Error('Cannot find match ' + JSON.stringify(match)));
			}
			if (finish_confirmed && match.team1_won != undefined && match.team1_won != null) {
				const next_match = update_queue.instance().execute(match_utils.call_preparation_match_on_court,app, tournament_key, match.setup.court_id);
			}
			return cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (!device_info) {
				return cb(null, match, changed_court);
			}
			update_device_info(app, tournament_key, device_info);
			return cb(null, match, changed_court);
		},
	], function (err) {
		if (err) {
			send_error(ws, tournament_key, err.message);
			return;
		}
	});
}
async function handle_device_info(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	const device_info = msg.device;
	if (device_info) {
		device_info.client_ip = ws._socket.remoteAddress;
		update_device_info(app, tournament_key, device_info);
	}
}
async function update_device_info(app, tournament_key, device_info) {
	app.db.tournaments.findOne({ key: tournament_key }, async (err, tournament) => {
		if (!err || !tournament) {
			err = { message: 'No tournament ' + default_tournament_key };
		}
		const client_id = determine_client_id_from_ip(device_info.client_ip);
		const panel = fetch_panel(client_id);
		if (panel != null) {
			const hostname = await determine_client_hostname(panel);
			var display_court_displaysetting = await get_display_court_displaysettings(app, client_id);
			if (display_court_displaysetting == null) {
				display_court_displaysetting = create_display_court_displaysettings(client_id, hostname, panel.court_id, generate_default_displaysettings_id(tournament));
			} else {
				display_court_displaysetting.hostname = hostname;
			}
			panel.battery = device_info.battery
			display_court_displaysetting.battery = device_info.battery
			display_court_displaysetting.online = true;
			admin.notify_change(app, default_tournament_key, 'display_status_changed', { 'display_court_displaysetting': display_court_displaysetting });
		}
	});
}

function fetch_panel(client_id) {
	for (const panel_ws of all_panels) {
		if (client_id == panel_ws.client_id) {
			return panel_ws;
		}
	}
	return null;
}


function create_display_court_displaysettings(client_id, hostname, court_id, displaysetting_id) {
	return  {
		client_id: client_id,
		hostname: hostname,
		court_id: court_id,
		displaysetting_id: displaysetting_id,
	}
}

async function handle_init(app, ws, msg) {
	const tournament_key = msg.tournament_key;
	var court_id = msg.panel_settings.court_id;
	if (court_id) {
		ws.court_id = court_id;
	} else {
		ws.court_id = undefined;
		court_id = undefined;
	}
	if (msg.initialize_display) {
		initialize_client(ws, app, tournament_key, court_id);
	} else { 
		matches_handler(app, ws, tournament_key, ws.court_id);
	}
	send_courts(app, ws, tournament_key);
}

async function send_finshed_confirmed(app, tournament_key, court_id) {
	notify_change(tournament_key, court_id, 'confirm-match-finished', {});
}

async function send_advertisement_add(tournament_key, advertisement) {
	notify_change_broadcast(tournament_key, 'advertisement_add', advertisement);
}

async function send_advertisement_remove(tournament_key, advertisement_id) {
	notify_change_broadcast(tournament_key, 'advertisement_remove', { advertisement_id: advertisement_id });
}

async function initialize_client(ws, app, tournament_key, court_id, displaysetting) {
	const client_id = determine_client_id(ws);
	const hostname = await determine_client_hostname(ws);
	if (client_id) {
		let display_setting = await get_display_setting(app, tournament_key, client_id, court_id, displaysetting)
		if (display_setting != null) {
			ws.court_id = display_setting.court_id;
			court_id = display_setting.court_id;
			notify_change_ws(ws, tournament_key, court_id, "settings-update", display_setting);
			notify_change_ws(ws, tournament_key, court_id, "settings-update", display_setting);
		}
	}
	matches_handler(app, ws, tournament_key, ws.court_id);
}

function getComputerName() {
	switch (process.platform) {
	  case "win32":
		return process.env.COMPUTERNAME;
	  case "darwin":
		return cp.execSync("scutil --get ComputerName").toString().trim();
	  case "linux":
		const prettyname = cp.execSync("hostnamectl --pretty").toString().trim();
		return prettyname === "" ? os.hostname() : prettyname;
	  default:
		return os.hostname();
	}
  }

async function determine_client_hostname(ws) {
	return new Promise((resolve, reject)=> {
		if(!ws.hostname) {
			const remote_adress_seqments_v6 = ws._socket.remoteAddress.split(':');
			const ip_v4 = remote_adress_seqments_v6[remote_adress_seqments_v6.length - 1];
		
			// catch ip for localhost
			if(ip_v4 == '127.0.0.1') {
				ws.hostname = getComputerName();
				resolve(ws.hostname);
				return;
			}
			dns.reverse(ip_v4, (err, hostnames) => {
				if (err) {
					resolve("N/N")
				}
				if (hostnames && hostnames.length >= 1) {
					ws.hostname = hostnames[0].split('.')[0];
				}
				resolve(ws.hostname);
			});
		} 
		else {
			resolve(ws.hostname);
		}
	});
}

function determine_client_id(ws) {
	if (!ws.client_id) {
		ws.client_id = determine_client_id_from_ip (ws._socket.remoteAddress);
	}
	return ws.client_id;
}

function determine_client_id_from_ip(ip_adress) {
	if (ip_adress) {
		const remote_adress_seqments = ip_adress.split('.');
		return remote_adress_seqments[remote_adress_seqments.length - 1];
	} else {
		return "UNDEFINED";
	}
}

function persist_client_court_displaysetting(app, client_court_displaysetting) {
	return new Promise((resolve, reject) => {
		app.db.display_court_displaysettings.insert(client_court_displaysetting, function (err, inserted_t) {
			if (err) {
				reject(err);
			}
			resolve(inserted_t);
		});
	});
}

function update_client_court_displaysetting(app, client_court_displaysetting_id, updatevalues) {
	return new Promise((resolve, reject) => {
		app.db.display_court_displaysettings.update({ client_id: client_court_displaysetting_id }, { $set: updatevalues }, { returnUpdatedDocs: true }, function (err, numAffected, changed_objects) {
			if (err) {
				reject(err)
			}
			resolve(changed_objects)

		});
	});
}


function persist_displaysetting(app, tournament_key, setting) {
	setting._id = undefined;
	return new Promise((resolve, reject) => {
		app.db.displaysettings.insert(setting, function (err, inserted_t) {
			if (err) {
				reject(err);
			}
			admin.notify_change(app, tournament_key, 'update_display_setting', {setting: inserted_t});
			resolve(inserted_t);
		});
	});
}


function client_id(app, tkey, client_id) {
	return new Promise((resolve, reject) => {
		const display_court_query = { 'client_id': client_id };
		app.db.display_court_displaysettings.find(display_court_query).limit(1).exec((err, display_court_displaysetting) => {
			if (err) {
				return reject(err);
			}
			var returnvalue = null;
			if (display_court_displaysetting.length == 1) {
				returnvalue = display_court_displaysetting[0];
			}
			resolve(returnvalue);
		});
	});
}

function get_display_court_displaysettings(app, client_id) {
	return new Promise((resolve, reject) => {
		const display_court_query = { 'client_id': client_id };
		app.db.display_court_displaysettings.find(display_court_query).limit(1).exec((err, display_court_displaysetting) => {
			if (err) {
				return reject(err);
			}
			if (display_court_displaysetting.length == 1) {
				resolve(display_court_displaysetting[0]);
			}
			resolve(null);
		});
	});
}
function get_display_setting(app, tkey, client_id, court_id, displaysetting) {
	return new Promise((resolve, reject) => {
		const display_court_query = { 'client_id': client_id };
		app.db.display_court_displaysettings.find(display_court_query).limit(1).exec((err, display_court_displaysetting) => {
			if (err) {
				return reject(err);
			}
			var returnvalue = null;
			if (display_court_displaysetting.length == 1) {
				const display_query = { 'id': display_court_displaysetting[0].displaysetting_id };
				app.db.displaysettings.find(display_query).limit(1).exec((err, display_setting) => {
					if (err) {
						return reject(err);
					}
					if (display_setting.length == 1) {
						returnvalue = display_setting[0];
						returnvalue.court_id = display_court_displaysetting[0].court_id;
						returnvalue.displaymode_court_id = display_court_displaysetting[0].court_id;
					}
					app.db.advertisements.find({}, function (err, advertisements) {
						if (err) {
							return resolve(returnvalue);
						}
						returnvalue.advertisements = advertisements;
						resolve(returnvalue);

					});
				});
			} else {
				app.db.tournaments.findOne({ key: tkey }, async (err, tournament) => {
					if (err || !tournament) {
						return reject(err);
					}
					var displaysetting_id = generate_default_displaysettings_id(tournament);
					if (displaysetting) {
						displaysetting_id = displaysetting;
					}
					const display_query_default = { 'id': displaysetting_id };
					app.db.displaysettings.find(display_query_default).limit(1).exec((err, display_setting_default) => {
						if (err) {
							return reject(err);
						}
						if (display_setting_default.length == 1) {
							returnvalue = display_setting_default[0];
							returnvalue.court_id = court_id;
							returnvalue.displaymode_court_id = court_id;
						} 
						app.db.advertisements.find({}, function (err, advertisements) {
							if (err) {
								return resolve(returnvalue);
							}
							returnvalue.advertisements = advertisements;
							resolve(returnvalue);

						});
					});
				});
			}
		});
	});
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
			notify_change_ws(app, tournament_key, "score-update", msg);
		}

		if(db_matches){
		    let matches = db_matches.map(dbm => create_match_representation(tournament, dbm));
			if (!court_id) {
		        matches = matches.filter(m => m.setup.now_on_court);
		    }
			matches = matches.filter(m => m.setup.state == 'oncourt' || m.setup.state == 'finished');

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
			notify_change_ws(ws, tournament_key, court_id, "score-update", reply)
		}		
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
	else {
		try {
			const fs = require('fs');
			const path = require('path');
			const d = new Date();
			const datestring = d.toISOString().slice(0, 10);
			const filename = "logo/" + datestring +"_"+tournament._id + ".png";
			const filepath = path.join(utils.root_dir(), 'data', 'logos', datestring +"_"+tournament._id + ".png");
			if (!fs.existsSync(filepath)) {
				const qrcode = require('qrcode');
				const url = admin.generate_tournament_web_url(tournament);
				qrcode.toFile(filepath, url, { scale: 7, errorCorrectionLevel: 'H' }, function (error) { });
			}
			res.tournament_logo_url = `/h/${encodeURIComponent(tournament.key)}/${filename}`;
		} catch (error) {
			console.log("A error occured during generating QR-Code for displays");
		}
	}
	res.tournament_logo_background_color = tournament.logo_background_color || '#000000';
	res.tournament_logo_foreground_color = tournament.logo_foreground_color || '#aaaaaa';
	return res;
}

async function restart_panel(app, tournament_key, client_id, new_court_id) {
	var client_court_displaysetting = null;
	if (new_court_id) {
		if (new_court_id == "--") {
			new_court_id = undefined;
		}

		const updatevalues = {
			court_id: new_court_id
		}
		client_court_displaysetting = await update_client_court_displaysetting(app, client_id, updatevalues);
	}
	var display_online = reinitialize_panel(app, tournament_key, client_id, new_court_id, undefined);
	if (client_court_displaysetting != null) { 
		client_court_displaysetting.online = display_online;
		admin.notify_change(app, tournament_key, 'display_status_changed', { 'display_court_displaysetting': client_court_displaysetting });
	}
	
}

async function change_display_mode(app, tournament_key, client_id, new_displaysettings_id) {
	if (new_displaysettings_id) {
		const updatevalues = {
			displaysetting_id: new_displaysettings_id
		}
		const client_court_displaysetting = await update_client_court_displaysetting(app, client_id, updatevalues);
		var display_online = reinitialize_panel(app, tournament_key, client_id, null, new_displaysettings_id);
		if (client_court_displaysetting) { 
			client_court_displaysetting.online = display_online;
			admin.notify_change(app, tournament_key, 'display_status_changed', { 'display_court_displaysetting': client_court_displaysetting });
		}
	}
}
async function change_default_display_mode(app, tournament, old_displaysettings_id, new_displaysettings_id) {
	if (new_displaysettings_id) {
		app.db.display_court_displaysettings.find({ displaysetting_id: old_displaysettings_id }).exec( async (err, display_court_displaysettings) => {
			if (err) {
				return reject(err);
			}
			const updatevalues = {
				displaysetting_id: new_displaysettings_id
			}
			for (const displaysettings of display_court_displaysettings) {
				const client_court_displaysetting = await update_client_court_displaysetting(app, displaysettings.client_id, updatevalues);
				if (client_court_displaysetting) {
					var display_online = reinitialize_panel(app, tournament.key, displaysettings.client_id, null, undefined);

				}
			}
			for (const panel_ws of all_panels) {
				restart_panel(app, tournament.key, panel_ws.client_id);
			}
		});
	}
}



function reinitialize_panel(app, tournament_key, client_id, new_court_id, displaysetting) {
	for (const panel_ws of all_panels) {
		const ws_client_id = determine_client_id(panel_ws);
		if (client_id == ws_client_id) {
			if (new_court_id != null) {
				panel_ws.court_id = new_court_id;
			}
			initialize_client(panel_ws, app, tournament_key, panel_ws.court_id, displaysetting);
			return true;
		}
	}
	return false;;
}

async function add_display_status(app, tournament, displays, callback) {
	for (const d of displays) {
		d.online = false;
		for (const panel_ws of all_panels) {
			const ws_client_id = determine_client_id(panel_ws);
			if (d.client_id == ws_client_id) {
				d.online = true;
				d.battery = panel_ws.battery;
				d.hostname = await determine_client_hostname(panel_ws);
				break;
			}
		}
	}
	for (const panel_ws of all_panels) {
		var found = false;
		const ws_client_id = determine_client_id(panel_ws);
		for (const d of displays) {
			if (d.client_id == ws_client_id) {
				found = true;
				break;
			}
		}
		if (!found) {
			const ws_hostname = await determine_client_hostname(panel_ws);
			const client_court_displaysetting = create_display_court_displaysettings(ws_client_id, ws_hostname, panel_ws.court_id, generate_default_displaysettings_id(tournament));
			client_court_displaysetting.online = true;
			client_court_displaysetting.battery = panel_ws.battery;
			displays[displays.length] = client_court_displaysetting;

		}
	}
	return callback(displays);
}

module.exports = {
	on_close,
	on_connect,
	notify_change,
	handle_init,
	handle_score_change,
	handle_persist_display_settings,
	handle_reset_display_settings,
	handle_score_update,
	handle_device_info,
	update_device_info,
	restart_panel,
	send_finshed_confirmed,
	send_advertisement_add,
	send_advertisement_remove,
	change_display_mode,
	change_default_display_mode,
	add_display_status,
	create_match_representation,
	create_event_representation,
};