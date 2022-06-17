'use strict';

const assert = require('assert');
const utils = require('./utils');

function filter_matches(all_btp_matches) {
	// TODO for group matches, note the opposite match as well
	// TODO in team tournaments this should be return all_btp_matches.filter(bm => bm.Team1Player1ID)
	return all_btp_matches.filter(bm => (bm.IsMatch && bm.IsPlayable && bm.MatchNr && bm.MatchNr[0] && bm.From1));
}

// bts_players: Array of array of players participating.
//              Only for matches, not individual players
// bts_winners: Array of players who have won this match.
function _calc_match_players(matches_by_pid, entries, players, bm) {
	if (bm.bts_winners) {
		return;
	}

	if (bm.EntryID) { // Either placeholder match or match won
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
			// Placeholder for one entry, we're done here
			return;
		}
	}

	// Normal match
	assert(bm.DrawID);
	assert(bm.DrawID[0]);
	if (!bm.From1) {
		return;
	}
	assert(bm.From1);
	assert(bm.From1[0]);
	const m1 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From1[0]);
	assert(m1);
	_calc_match_players(matches_by_pid, entries, players, m1);
	const p1ar = m1.bts_winners;
	assert(bm.From2);
	assert(bm.From2[0]);
	const m2 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From2[0]);
	assert(m2);
	_calc_match_players(matches_by_pid, entries, players, m2);
	const p2ar = m2.bts_winners;

	bm.bts_players = [p1ar, p2ar];
	if (p1ar && p2ar) {
		bm.bts_complete = true;
		if (bm.Winner) {
			//if (! bm.bts_winners) {
				// TODO: happened at DM O 35
				//serror.silent(
				//	'Strange match (num ' + bm.MatchNr + ') with Winner = ' + bm.Winner + ', '+
				//	'but no winning players');
			//}
			return;
		}
	}
	return;
}

/*
// TODO: team version
function _team_calc_player_matches(matches_by_pid, entries, players, bm) {
	if (bm.bts_winners) {
		return;
	}

	if (!bm.Team1Player1ID) return;
	const p1ar = [players.get(bm.Team1Player1ID[0])];
	const p2ar = [players.get(bm.Team2Player1ID[0])];
	if (bm.Team1Player2ID) {
	        p1ar.push(players.get(bm.Team1Player2ID[0]));
	}
	if (bm.Team2Player2ID) {
	        p2ar.push(players.get(bm.Team2Player2ID[0]));
	}
-
	bm.bts_players = [p1ar, p2ar];
	if (p1ar && p2ar) {
	        bm.bts_complete = true;
	}

}
*/

// TODO move this into a separate process
function get_btp_state(response) {
	const btp_t = response.Result[0].Tournament[0];

	// When a list is empty the whole entry is missing :(
	const all_btp_matches = btp_t.Matches ? btp_t.Matches[0].Match : [];
	const all_btp_entries = btp_t.Entries ? btp_t.Entries[0].Entry : [];
	const all_btp_events = btp_t.Events ? btp_t.Events[0].Event : [];
	const all_btp_players = btp_t.Players ? btp_t.Players[0].Player : [];
	const all_btp_draws = btp_t.Draws ? btp_t.Draws[0].Draw : [];
	const all_btp_officials = btp_t.Officials ? btp_t.Officials[0].Official : [];
	const all_btp_courts = btp_t.Courts ? btp_t.Courts[0].Court : [];

	const on_court_match_ids = new Set();
	for (const c of all_btp_courts) {
		if (c.MatchID) {
			for (const match_id of c.MatchID) {
				on_court_match_ids.add(match_id);
			}
		}
	}

	const matches = filter_matches(all_btp_matches);
	const matches_by_pid = utils.make_index(
		all_btp_matches, bm => bm.DrawID[0] + '_' + bm.PlanningID[0]);
	const entries = utils.make_index(all_btp_entries, e => e.ID[0]);
	const events = utils.make_index(all_btp_events, e => e.ID[0]);
	const players = utils.make_index(all_btp_players, p => p.ID[0]);
	const draws = utils.make_index(all_btp_draws, d => d.ID[0]);
	const officials = utils.make_index(all_btp_officials, o => o.ID[0]);
	const courts = utils.make_index(all_btp_courts, c => c.ID[0]);

	for (const bm of matches) {
		_calc_match_players(matches_by_pid, entries, players, bm);
	}
	return {
		courts,
		draws,
		events,
		matches,
		officials,
		// Testing only
		_matches_by_pid: matches_by_pid,
	};
}

// Parse umpires into our standard format
function parse_umpires(response) {
	const btp_t = response.Result[0].Tournament[0];
	if (!btp_t.Officials || !btp_t.Officials[0] || !btp_t.Officials[0].Official) return [];
	return btp_t.Officials[0].Official.map(o => {
		const res = {
			firstname: o.FirstName[0],
			lastname: o.Name[0],
			btp_id: o.ID[0],
		};
		if (o.Country && o.Country[0]) {
			res.nationality = o.Country[0];
		}
		res.name = res.firstname + ' ' + res.lastname;
		return res;
	});
}

module.exports = {
	get_btp_state,
	parse_umpires,
	// Testing only
	_calc_match_players,
};
