'use strict';

const assert = require('assert');

const async = require('async');

const utils = require('./utils');

function filter_matches(all_btp_matches) {
	// TODO for group matches, note the opposite match as well
	return all_btp_matches.filter(btp_m => (btp_m.IsMatch && btp_m.IsPlayable));
}

function _calc_match_players(matches_by_pid, entries, players, bm) {
	if (bm.bts_winners) {
		return bm.bts_winners;
	}

	if (bm.EntryID) { // Either placeholer match or match won
		const e = entries.get(bm.EntryID[0]);
		if (!e) {
			throw new Error('Cannot find entry ' + bm.EntryID[0]);
		}

		const p1 = players.get(e.Player1ID[0]);
		assert(p1);
		const res = [p1];
		if (e.Player2ID) {
			const p2 = players.get(e.Player2ID[0]);
			assert(p2);
			res.push(p2);
		}
		bm.bts_winners = res;
		if (! bm.IsMatch) {
			// Placeholder, we're done here
			return res;
		}
	}

	// Normal match
	assert(bm.DrawID);
	assert(bm.DrawID[0]);
	assert(bm.From1);
	assert(bm.From1[0]);
	const m1 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From1[0]);
	assert(m1);
	const p1ar = _calc_match_players(matches_by_pid, entries, players, m1);
	assert(bm.From2);
	assert(bm.From2[0]);
	const m2 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From2[0]);
	assert(m2);
	const p2ar = _calc_match_players(matches_by_pid, entries, players, m2);

	bm.bts_players = [p1ar, p2ar];
	if (p1ar && p2ar) {
		bm.bts_complete = true;
		if (bm.Winner) {
			assert(bm.bts_winners);
			return bm.bts_winners;
		}
	}
	return null; // No winner yet
}

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
	const {courts, draws, events, officials} = btp_state;

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

			// TODO court id
			if (cur_match) {
				// TODO: update if different (and notify about that!)
				//console.log('Skipping ' + bm.ID[0] + ': already present in database');
				cb();
				return;
			}

			if (!bm.bts_complete) {
				//console.log('Skipping ' + bm.ID[0] + ': incomplete');
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
				scheduled_time_str,
				match_name,
				event_name,
				teams,
			};
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
				// TODO court_id
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
	const courts = btp_state.courts.values();
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
					app.db.courts.update(alt_query, {$set: court}, {}, (err) => cb(err));
					return;
				}

				changed = true;
				app.db.courts.insert(court, (err) => cb(err));
			});
		});
	}, (err) => {
		if (err) return callback(err);

		if (changed) {
			// TODO notify about court change
			/*
			stournament.get_courts(app.db, tournament_key, function(err, all_courts) {
			notify_change(app, tournament_key, 'courts_changed', {all_courts});
			*/
		}
		callback(err, res);
	});
}

function integrate_umpires(app, tournament_key, btp_state, callback) {
	const officials = btp_state.officials.values();
	var changed = false;

	async.each(officials, (o, cb) => {
		const name = o.FirstName[0] + ' ' + o.Name[0];
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
				_id: 'btp_' + btp_id,
				btp_id,
				name,
				tournament_key,
			};
			changed = true;
			app.db.umpires.insert(u, err => cb(err));
		});
	}, err => {
		if (changed) {
			// TODO notify about umpire change
		}
		callback(err);
	});
}

function fetch(app, tkey, response, callback) {
	const btp_t = response.Result[0].Tournament[0];
	const all_btp_matches = btp_t.Matches[0].Match;

	const matches = filter_matches(all_btp_matches);
	const matches_by_pid = utils.make_index(
		all_btp_matches, bm => bm.DrawID[0] + '_' + bm.PlanningID[0]);
	const entries = utils.make_index(btp_t.Entries[0].Entry, e => e.ID[0]);
	const events = utils.make_index(btp_t.Events[0].Event, e => e.ID[0]);
	const players = utils.make_index(btp_t.Players[0].Player, p => p.ID[0]);
	const draws = utils.make_index(btp_t.Draws[0].Draw, d => d.ID[0]);
	const officials = utils.make_index(btp_t.Officials[0].Official, o => o.ID[0]);
	const courts = utils.make_index(btp_t.Courts[0].Court, c => c.ID[0]);

	for (const bm of matches) {
		_calc_match_players(matches_by_pid, entries, players, bm);
	}
	const btp_state = {
		courts,
		draws,
		events,
		matches,
		officials,
	};

	// TODO sync available officials
	async.waterfall([
		cb => integrate_umpires(app, tkey, btp_state, cb),
		cb => integrate_courts(app, tkey, btp_state, cb),
		(court_map, cb) => integrate_matches(app, tkey, btp_state, court_map, cb),
	], callback);
}

module.exports = {
	fetch,
};