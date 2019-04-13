'use strict';

const assert = require('assert');
const utils = require('./utils');

function filter_matches(all_btp_matches) {
	// TODO for group matches, note the opposite match as well
	// return all_btp_matches.filter(bm => (bm.IsMatch && bm.IsPlayable && bm.MatchNr && bm.MatchNr[0] && bm.From1));
	return all_btp_matches.filter(bm => bm.Team1Player1ID);
}

// bts_players: Array of array of players participating.
//              Only for matches, not individual players
// bts_winners: Array of players who have won this match.
function _calc_match_players(matches_by_pid, entries, players, bm) {
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

	bm.bts_players = [p1ar, p2ar];
	if (p1ar && p2ar) {
		bm.bts_complete = true;
	}

return; // dead code ahead
	if (bm.EntryID) { // Either placeholder match or match won
		const e = entries.get(bm.EntryID[0]);
		if (!e) {
			throw new Error('Cannot find entry ' + bm.EntryID[0]);
		}

		// console.log({players: JSON.stringify(Array.from(players.keys()).sort()), p1id: e.Player1ID});
		const p1 = players.get(e.Player1ID[0]);
		// console.log({p1})
		if (!p1) {
			// console.log('Cannot find player');
			return;
		}
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
	/*assert(bm.DrawID);
	assert(bm.DrawID[0]);
	if (!bm.From1) {
		return;
	}
	assert(bm.From1);
	assert(bm.From1[0]);
	const m1 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From1[0]);
	assert(m1);
	*/
	// _calc_match_players(null, entries, players, m1);
	/*const p1ar = m1.bts_winners;
	assert(bm.From2);
	assert(bm.From2[0]);
	const m2 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From2[0]);
	assert(m2);
	*/
	// _calc_match_players(null, entries, players, m2);
	// const p2ar = m2.bts_winners;

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
	c
	return;
}


// TODO move this into a separate process
function get_btp_state(response) {
	const btp_t = response.Result[0].Tournament[0];
	// TODO if not league then different
	// const all_btp_matches = btp_t.Matches[0].Match;
	const all_btp_team_matches = btp_t.Matches[0].Match;
	const team_matches_by_id = utils.make_index(
		all_btp_team_matches, tm => tm.ID[0]);

	const all_btp_matches = btp_t.PlayerMatches[0].PlayerMatch;
	const matches = filter_matches(all_btp_matches);
	const entries = utils.make_index(btp_t.Entries[0].Entry, e => e.ID[0]);
	const events = utils.make_index(btp_t.Events[0].Event, e => e.ID[0]);
	const players = utils.make_index(btp_t.Players[0].Player, p => p.ID[0]);
	const draws = utils.make_index(btp_t.Draws[0].Draw, d => d.ID[0]);
	let officials;
	if (btp_t.Officials) {
		officials = utils.make_index(btp_t.Officials[0].Official, o => o.ID[0]);
	} else {
		officials = new Map();
	}
	const courts = utils.make_index(btp_t.Courts[0].Court, c => c.ID[0]);

	for (const bm of matches) {
		const tm = team_matches_by_id.get(bm.TeamMatchID[0]);
		if (!tm) {
			console.log('Match without teammatch: ' + JSON.stringify(bm));
			continue;
		}
		bm.DrawID = tm.DrawID;

		_calc_match_players(null, entries, players, bm);
	}
	return {
		courts,
		draws,
		events,
		matches,
		officials,
		// Testing only
		// _matches_by_pid: matches_by_pid,
	};
}

module.exports = {
	get_btp_state,
	// Testing only
	_calc_match_players,
};
