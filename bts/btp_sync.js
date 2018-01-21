'use strict';

const assert = require('assert');

const async = require('async');

const btp_parse = require('./btp_parse');
const utils = require('./utils');


function _date_str(dt) {
	return utils.pad(dt.hour, 2, '0') + ':' + utils.pad(dt.minute, 2, '0');
}

function _craft_team(par) {
	if (!par) {
		return {players: []};
	}

	const players = par.map(p => {
		return {name: p.Firstname + ' ' + p.Lastname};
	});
	return {players};
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

function integrate_matches(app, tkey, btp_state, court_map, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const {draws, events, officials} = btp_state;

	async.each(btp_state.matches, function(bm, cb) {
		const draw = draws.get(bm.DrawID[0]);
		assert(draw);

		const event = events.get(draw.EventID[0]);
		assert(event);

		const match_num = bm.MatchNr[0];
		assert(typeof match_num === 'number');
		const btp_id = tkey + '_' + draw.Name[0] + '_' + match_num;
		const btp_match_ids = [{
			id: bm.ID[0],
			draw: bm.DrawID[0],
			planning: bm.PlanningID[0],
		}];

		const query = {
			btp_id,
			tournament_key: tkey,
		};
		app.db.matches.findOne(query, (err, cur_match) => {
			if (err) return cb(err);

			if (cur_match && cur_match.btp_needsync) {
				cb();
				return;
			}

			if (!bm.IsMatch) {
				cb();
				return;
			}

			if (!bm.bts_complete) {
				// TODO: register them as incomplete, but continue instead of returning
				cb();
				return;
			}

			const gtid = event.GameTypeID[0];
			assert((gtid === 1) || (gtid === 2));

			const scheduled_time_str = (bm.PlannedTime ? _date_str(bm.PlannedTime[0]) : undefined);
			const match_name = bm.RoundName[0];
			const event_name = draw.Name[0];
			const teams = _craft_teams(bm);

			const btp_player_ids = [];
			for (const team of bm.bts_players) {
				for (const p of team) {
					btp_player_ids.push(p.ID[0]);
				}
			}

			const setup = {
				incomplete: !bm.bts_complete,
				is_doubles: (gtid === 2),
				match_num,
				counting: '3x21',
				team_competition: false,
				match_name,
				event_name,
				teams,
			};
			if (scheduled_time_str) {
				setup.scheduled_time_str = scheduled_time_str;
			}
			if (bm.CourtID) {
				const btp_court_id = bm.CourtID[0];
				const court_id = court_map.get(btp_court_id);
				assert(court_id);
				setup.court_id = court_id;
			}
			if (bm.Official1ID) {
				const o = officials.get(bm.Official1ID[0]);
				assert(o);
				setup.umpire_name = o.FirstName + ' ' + o.Name;
			}

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
			match._id = 'btp_' + btp_id;

			if (cur_match) {
				if (utils.plucked_deep_equal(match, cur_match, Object.keys(match))) {
					// No update required
					cb();
					return;
				}

				app.db.matches.update({_id: cur_match._id}, {$set: match}, {}, (err) => {
					if (err) return cb(err);

					admin.notify_change(app, match.tournament_key, 'match_edit', {match__id: match._id, setup});
					cb();
				});
				return;
			}

			// New match
			app.db.matches.insert(match, function(err) {
				if (err) return cb(err);

				admin.notify_change(app, tkey, 'match_add', {match});
				cb();
			});
		});
	}, callback);
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
		const num = parseInt(name, 10) || btp_id;
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
					app.db.courts.update(alt_query, {$set: { 'match_id': btp_id }}, {}, (err) => cb(err));
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
		const name = (o.FirstName ? (o.FirstName[0] + ' ') : '') + o.Name[0];
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

function fetch(app, tkey, response, callback) {
	const btp_state = btp_parse.get_btp_state(response);

	async.waterfall([
		cb => integrate_umpires(app, tkey, btp_state, cb),
		cb => integrate_courts(app, tkey, btp_state, cb),
		(court_map, cb) => integrate_matches(app, tkey, btp_state, court_map, cb),
	], callback);
}

module.exports = {
	fetch,
};
