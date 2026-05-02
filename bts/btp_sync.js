'use strict';

const assert = require('assert');
const {promisify} = require('util');

const async = require('async');

const btp_parse = require('./btp_parse');
const countries = require('./countries');
const utils = require('./utils');
const { fix_player } = require('./name_fixup');


function time_str(dt) {
	return utils.pad(dt.hour, 2, '0') + ':' + utils.pad(dt.minute, 2, '0');
}

function date_str(dt) {
	return utils.pad(dt.year, 2, '0') + '-' + utils.pad(dt.month, 2, '0') + '-' + utils.pad(dt.day, 2, '0');
}

function craft_match(tkey, btp_id, court_map, event, draw, officials, bm, match_ids_on_court, match_types, is_league, btp_state) {
	assert.equal(typeof is_league, 'boolean');
	if (!is_league && !bm.IsMatch) {
		return;
	}

	if (!bm.bts_complete) {
		// TODO: register them as incomplete, but continue instead of returning
		return;
	}

	const gtid = event.GameTypeID[0];
	assert((gtid === 1) || (gtid === 2));

	const scheduled_time_str = (bm.PlannedTime ? time_str(bm.PlannedTime[0]) : undefined);
	const scheduled_date = (bm.PlannedTime ? date_str(bm.PlannedTime[0]) : undefined);
	let match_name;
	if (is_league) {
		assert(bm.MatchTypeID);
		const match_type_id = bm.MatchTypeID[0];
		const mt = match_types.get(String(match_type_id));
		assert(mt, `Unknown match type ${match_type_id}`);
		match_name = mt;

		if (bm.MatchTypeNo && bm.MatchTypeNo[0]) {
			match_name += String(bm.MatchTypeNo[0]);
		}
	} else {
		match_name = bm.RoundName[0];
	}
	const event_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + ' - ' + draw.Name[0];
	const teams = _craft_teams(bm);
	if (is_league) {
		// league, set team names
		const tm = btp_state.team_matches.get(bm.TeamMatchID[0]);
		assert(tm);

		for (let i = 0; i < teams.length;i++) {
			teams[i].name = tm.btp_teams[i].Name[0];
		}
	}

	const btp_player_ids = [];
	for (const team of bm.bts_players) {
		for (const p of team) {
			btp_player_ids.push(p.ID[0]);
		}
	}

	let is_doubles;
	if (is_league) {
		is_doubles = teams[0].players.length === 2; 
	} else {
		is_doubles = gtid === 2;
	}
	const match_num = is_league ? bm.ID[0] : bm.MatchNr[0];
	const setup = {
		incomplete: !bm.bts_complete,
		is_doubles: is_doubles,
		match_num: match_num,
		counting: '3x21',
		team_competition: is_league,
		match_name,
		event_name,
		teams,
	};
	if (scheduled_time_str) {
		setup.scheduled_time_str = scheduled_time_str;
	}
	if (scheduled_date) {
		setup.scheduled_date = scheduled_date;
	}
	if (bm.CourtID) {
		const btp_court_id = bm.CourtID[0];
		const court_id = court_map.get(btp_court_id);
		assert(court_id);
		setup.court_id = court_id;
		setup.now_on_court = match_ids_on_court.has(bm.ID[0]);
	}
	if (bm.Official1ID) {
		const o = officials.get(bm.Official1ID[0]);
		assert(o);
		setup.umpire_name = o.FirstName + ' ' + o.Name;
	}
	if (bm.Official2ID) {
		const o = officials.get(bm.Official2ID[0]);
		assert(o);
		setup.service_judge_name = o.FirstName + ' ' + o.Name;
	}

	const btp_data = {
		id: bm.ID[0],
	};
	if (is_league) {
		btp_data.TeamMatchID = bm.TeamMatchID[0];
		assert(btp_data.TeamMatchID !== undefined);
		btp_data.MatchTypeID = bm.MatchTypeID[0];
		assert(btp_data.MatchTypeID !== undefined);
		btp_data.MatchTypeNo = bm.MatchTypeNo[0];
		assert(btp_data.MatchTypeNo !== undefined);
		btp_data.MatchOrder = bm.MatchOrder[0];
		assert(btp_data.MatchOrder !== undefined);

		btp_data.Team1Player1ID = bm.Team1Player1ID[0];
		assert(btp_data.Team1Player1ID !== undefined);
		if (bm.Team1Player2ID && bm.Team1Player2ID[0]) {
			btp_data.Team1Player2ID = bm.Team1Player2ID[0];
		}
		btp_data.Team2Player1ID = bm.Team2Player1ID[0];
		assert(btp_data.Team2Player1ID !== undefined);
		if (bm.Team1Player2ID && bm.Team2Player2ID[0]) {
			btp_data.Team2Player2ID = bm.Team2Player2ID[0];
		}
	} else {
		btp_data.nr = bm.MatchNr[0];
		btp_data.draw = bm.DrawID[0];
		btp_data.planning = bm.PlanningID[0];
	}
	const btp_match_ids = [btp_data];

	const match = {
		tournament_key: tkey,
		btp_id,
		btp_match_ids,
		btp_player_ids,
		setup,
	};
	match.team1_won = undefined;
	match.btp_winner = undefined;
	if (bm.Winner) {
		match.btp_winner = bm.Winner[0];
		match.team1_won = (match.btp_winner === 1);
	}
	if (bm.Sets) {
		match.network_score = _parse_score(bm);
	}
	if (bm.Shuttles) {
		match.shuttle_count = bm.Shuttles[0];
	}
	if (bm.DisplayOrder) {
		match.match_order = bm.DisplayOrder[0];
	}
	match._id = 'btp_' + btp_id;

	return match;
}

function _craft_team(par) {
	if (!par) {
		return {players: []};
	}

	const players = par.map(p => {
		const asian_name = !! (p.Asianname && p.Asianname[0]);
		const pres = {asian_name};
		if (p.Firstname && p.Lastname) {
			if (asian_name) {
				pres.name = p.Lastname[0].toUpperCase() + ' ' + p.Firstname[0];
			} else {
				pres.name = p.Firstname[0] + ' ' + p.Lastname[0];
			}

			pres.firstname = p.Firstname[0];
			pres.lastname = p.Lastname[0];
		} else if (p.Lastname) {
			pres.name = p.Lastname[0];
			pres.lastname = p.Lastname[0];
			pres.firstname = '';
		} else if (p.Firstname) {
			pres.name = p.Firstname[0];
			pres.lastname = p.Firstname[0];
			pres.firstname = '';
		}

		if (p.Country && p.Country[0]) {
			pres.nationality = p.Country[0];
		}
		fix_player(pres);
		return pres;
	});

	const tres = {
		players,
	};

	if ((players.length === 2) && (players[0].nationality != players[1].nationality)) {
		tres.name = countries.lookup(players[0].nationality) + ' / ' + countries.lookup(players[1].nationality);
	} else if ((players.length > 0) && (players[0].nationality)) {
		tres.name = countries.lookup(players[0].nationality);
	}

	return tres;
}

function _craft_teams(bm) {
	assert(bm.bts_players);
	return bm.bts_players.map(_craft_team);
}

function _parse_score(bm) {
	assert(bm.Sets);
	assert(bm.Sets[0]);
	assert(bm.Sets[0].Set);

	return bm.Sets[0].Set.map(s => [s.T1[0], s.T2[0]]);
}

async function integrate_matches(app, tkey, btp_state, court_map) {
	const admin = require('./admin'); // avoid dependency cycle
	const {draws, events, officials, match_types} = btp_state;

	const match_ids_on_court = calculate_match_ids_on_court(btp_state);
	const db_findOne = promisify(app.db.matches.findOne.bind(app.db.matches));
	const db_update = promisify(app.db.matches.update.bind(app.db.matches));
	const db_insert = promisify(app.db.matches.insert.bind(app.db.matches));

	for (const bm of btp_state.matches) {
		let draw_id;
		const is_league = !!bm.TeamMatchID;
		if (is_league) {
			// Team Match
			const team_match = btp_state.team_matches.get(bm.TeamMatchID[0]);
			assert(team_match);

			draw_id = team_match.DrawID[0];
			assert(draw_id);
		} else {
			// Individual match
			draw_id = bm.DrawID[0];
		}

		assert(Number.isInteger(draw_id));
		const draw = draws.get(draw_id);
		assert(draw);

		const event = events.get(draw.EventID[0]);
		assert(event);

		const discipline_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + '_' + draw.Name[0];
		const btp_id = tkey + '_' + discipline_name + '_' + bm.ID[0];

		const query = {
			btp_id,
			tournament_key: tkey,
		};
		// TODO get all matches upfront here
		const cur_match = await db_findOne(query);

		if (cur_match && cur_match.btp_needsync) {
			continue;
		}
		const match = craft_match(tkey, btp_id, court_map, event, draw, officials, bm, match_ids_on_court, match_types, is_league, btp_state);
		if (!match) {
			continue;
		}

		if (cur_match) {
			if (utils.plucked_deep_equal(match, cur_match, Object.keys(match), true)) {
				// No update required
				continue;
			}

			await db_update({_id: cur_match._id}, {$set: match}, {});
			admin.notify_change(app, match.tournament_key, 'match_edit', {match__id: match._id, setup: match.setup});
			continue;
		}

		await db_insert(match);
		admin.notify_change(app, tkey, 'match_add', {match});
	}
}

// Returns a map btp_court_id => court._id
function integrate_courts(app, tournament_key, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const courts = Array.from(btp_state.courts.values());
	const res = new Map();
	var changed = false;

	async.each(courts, (c, cb) => {
		const btp_id = c.ID[0];
		const name = c.Name[0];
		const num_m = /[0-9]+/.exec(name);
		let num = num_m ? parseInt(num_m[0]) : (parseInt(name, 10) || btp_id);
		const m = /^Court\s*([0-9]+)$/.exec(name);
		if (m) {
			num = parseInt(m[1]);
		}
		const query = {
			btp_id,
			name,
			num,
			tournament_key,
		};

		app.db.courts.findOne(query, (err, cur_court) => {
			if (err) return cb(err);
			if (cur_court) {
				res.set(btp_id, cur_court._id);
				return cb();
			}

			const alt_query = {
				tournament_key,
				num,
			};
			const court = {
				_id: tournament_key + '_' + num,
				tournament_key,
				btp_id,
				num,
				name,
			};
			res.set(btp_id, court._id);
			app.db.courts.findOne(alt_query, (err, cur_court) => {
				if (err) return cb(err);

				if (cur_court) {
					// Add BTP ID
					app.db.courts.update(alt_query, {$set: {btp_id}}, {}, (err) => cb(err));
					return;
				}

				changed = true;
				app.db.courts.insert(court, (err) => cb(err));
			});
		});
	}, (err) => {
		if (err) return callback(err);

		if (changed) {
			stournament.get_courts(app.db, tournament_key, function(err, all_courts) {
				admin.notify_change(app, tournament_key, 'courts_changed', {all_courts});
				callback(err, res);
			});
		} else {
			callback(err, res);
		}
	});
}

function integrate_umpires(app, tournament_key, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const officials = Array.from(btp_state.officials.values());
	var changed = false;

	async.each(officials, (o, cb) => {
		const name = (o.FirstName ? (o.FirstName[0] + ' ') : '') + ((o.Name && o.Name[0]) ? o.Name[0] : '');
		if (!name) {
			return cb();
		}
		const btp_id = o.ID[0];

		app.db.umpires.findOne({tournament_key, name}, (err, cur) => {
			if (err) return cb(err);

			if (cur) {
				if (cur.btp_id === btp_id) {
					return cb();
				} else {
					app.db.umpires.update({tournament_key, name}, {$set: {btp_id}}, {}, (err) => cb(err));
					return;
				}
			}

			const u = {
				_id: tournament_key + '_btp_' + btp_id,
				btp_id,
				name,
				tournament_key,
			};
			changed = true;
			app.db.umpires.insert(u, err => cb(err));
		});
	}, err => {
		if (changed) {
			stournament.get_umpires(app.db, tournament_key, function(err, all_umpires) {
				if (!err) {
					admin.notify_change(app, tournament_key, 'umpires_changed', {all_umpires});
				}
				callback(err);
			});
		} else {
			callback(err);
		}
	});
}

function calculate_match_ids_on_court(btp_state) {
	const res = new Set();
	for (const c of btp_state.courts.values()) {
		if (c.MatchID) {
			for (const match_id of c.MatchID) {
				res.add(match_id);
			}
		}
	}
	return res;
}

async function integrate_now_on_court(app, tkey) {
	const db_tournament_findOne = promisify(app.db.tournaments.findOne.bind(app.db.tournaments));
	const db_matches_find = promisify(app.db.matches.find.bind(app.db.matches));
	const db_courts_find = promisify(app.db.courts.find.bind(app.db.courts));
	const db_courts_update = promisify(app.db.courts.update.bind(app.db.courts));

	const tournament = await db_tournament_findOne({key: tkey});
	assert(tournament);
	if (!tournament.only_now_on_court) {
		return;
	}

	const now_on_court_matches = await db_matches_find({'setup.now_on_court': true});
	for (const match of now_on_court_matches) {
		const court_id = match.setup.court_id;
		const match_id = match._id;
		assert(court_id && match_id);

		const court_q = {_id: court_id};
		const courts = await db_courts_find(court_q);
		if (courts.length !== 1) continue;
		if (courts[0].match_id === match_id) continue; // Already set

		await db_courts_update(court_q, {$set: {match_id}}, {});
	}
}

async function fetch(app, tkey, response) {
	const btp_state = btp_parse.get_btp_state(response);
	await integrate_btp_state(app, tkey, btp_state);
}

async function integrate_btp_state(app, tkey, btp_state) {
	await promisify(integrate_umpires)(app, tkey, btp_state);
	const court_map = await promisify(integrate_courts)(app, tkey, btp_state);
	await integrate_matches(app, tkey, btp_state, court_map);
	await integrate_now_on_court(app, tkey);
}

module.exports = {
	calculate_match_ids_on_court,
	craft_match,
	date_str,
	fetch,
	time_str,
	integrate_btp_state,
	// test only
	_integrate_umpires: integrate_umpires,
};
