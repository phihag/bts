'use strict';

const assert = require('assert');
const utils = require('./utils');

const MATCH_TYPES = {
	'1': 'MS',
	'2': 'WS',
	'3': 'MD',
	'4': 'WD',
	'5': 'XD',
	'6': 'S',
	'7': 'D',
	'8': 'BS',
	'9': 'GS',
	'10': 'BD',
	'11': 'GD',
};


function _calc_match_id(bm, is_league) {
	if (is_league) {
		return `cp_${bm.TeamMatchID[0]}_${bm.ID[0]}`;
	} else {
		return `${bm.DrawID[0]}_${bm.PlanningID[0]}`;
	}
}

function filter_matches(all_btp_matches, is_league) {
	if (is_league) {
		return all_btp_matches.filter(bm => {
			return bm.Team1Player1ID && bm.Team2Player1ID;
		});
	}

	return all_btp_matches.filter(bm => {
		return (
			bm.IsMatch &&
			bm.IsPlayable
			&& bm.MatchNr && (bm.MatchNr[0] !== undefined)
			&& bm.From1);
	});
}

// bts_players: Array of array of players participating.
//              Only for matches, not individual players
// bts_winners: Array of players who have won this match.
function _calc_match_players(matches_by_pid, entries, players, bm, is_league) {
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
	let p1ar, p2ar;
	if (is_league) {
		if (!bm.Team1Player1ID) return;

		p1ar = [players.get(bm.Team1Player1ID[0])];
		if (bm.Player2ID) {
			p1ar.push(players.get(bm.Team1Player2ID[0]));
		}
		p2ar = [players.get(bm.Team2Player1ID[0])];
		if (bm.Player2ID) {
			p2ar.push(players.get(bm.Team2Player2ID[0]));
		}
	} else {
		assert(bm.DrawID);
		assert(bm.DrawID[0]);
		if (!bm.From1) {
			return;
		}
		assert(bm.From1);
		assert(bm.From1[0]);
		const m1 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From1[0], is_league);
		assert(m1);
		_calc_match_players(matches_by_pid, entries, players, m1);
		p1ar = m1.bts_winners;
		assert(bm.From2);
		assert(bm.From2[0]);
		const m2 = matches_by_pid.get(bm.DrawID[0] + '_' + bm.From2[0], is_league);
		assert(m2);
		_calc_match_players(matches_by_pid, entries, players, m2, is_league);
		p2ar = m2.bts_winners;
	}

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

function _resolve_team(btp_tm, planning_id, team_matches_by_planning, entries, teams) {
	const draw_id = btp_tm.DrawID[0];
	const pseudo_match = team_matches_by_planning.get(`${draw_id}_${planning_id}`);
	if (!pseudo_match.EntryID) {
		return null; // throw error?
	}
	const entry = entries.get(pseudo_match.EntryID[0]);
	const team_id = entry.Player1ID[0];

	const team = teams.get(team_id);
	if (! team) {
		return null; // throw error?
	}
	
	return team;
}

function _annotate_league_teammatch(btp_tm, team_matches_by_planning, entries, teams, draws, events) {
	if (! (btp_tm.From1 && btp_tm.From2)) return;
	if (!btp_tm.IsPlayable || !btp_tm.IsPlayable[0]) return;
	if (!btp_tm.IsMatch || !btp_tm.IsMatch[0]) return;

	const draw = draws.get(btp_tm.DrawID[0]);
	const draw_name = draw.Name[0];
	const event = events.get(draw.EventID[0])
	const event_name = event.Name[0];
	btp_tm.bts_event_name = event_name === draw_name ? draw_name : `${event_name} ${draw_name}`;

	const btp_teams = [
		_resolve_team(btp_tm, btp_tm.From1[0], team_matches_by_planning, entries, teams),
		_resolve_team(btp_tm, btp_tm.From2[0], team_matches_by_planning, entries, teams),
	];

	if (btp_teams[0] && btp_teams[1]) {
		btp_tm.btp_teams = btp_teams;
		btp_tm.btp_draw = draw;
	}
}

// TODO move this into a separate process
function get_btp_state(response) {
	const btp_t = response.Result[0].Tournament[0];
	const is_league = !!btp_t.PlayerMatches;

	// When a list is empty the whole entry is missing :(
	let all_btp_matches;
	if (is_league) { // LeaguePlanner format
		all_btp_matches = btp_t.PlayerMatches[0].PlayerMatch;
		assert(all_btp_matches);
	} else {
		all_btp_matches = btp_t.Matches ? btp_t.Matches[0].Match : [];
	}
	const matches_by_pid = utils.make_index(all_btp_matches, bm => _calc_match_id(bm, is_league));
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

	const entries = utils.make_index(all_btp_entries, e => e.ID[0]);
	const events = utils.make_index(all_btp_events, e => e.ID[0]);
	const draws = utils.make_index(all_btp_draws, d => d.ID[0]);

	let team_matches = undefined;
	let teams = undefined;
	if (is_league) {
		const all_btp_team_matches = btp_t.Matches[0].Match;
		team_matches = utils.make_index(all_btp_team_matches, m => m.ID[0]);
		teams = utils.make_index(btp_t.Teams[0].Team, m => m.ID[0]);
		const team_matches_by_planning = utils.make_index(all_btp_team_matches, m => `${m.DrawID[0]}_${m.PlanningID[0]}`);

		for (const btp_tm of all_btp_team_matches) {
			_annotate_league_teammatch(btp_tm, team_matches_by_planning, entries, teams, draws, events);
		}
	}

	const matches = filter_matches(all_btp_matches, is_league);
	const players = utils.make_index(all_btp_players, p => p.ID[0]);
	const officials = utils.make_index(all_btp_officials, o => o.ID[0]);
	const courts = utils.make_index(all_btp_courts, c => c.ID[0]);

	for (const bm of matches) {
		_calc_match_players(matches_by_pid, entries, players, bm, is_league);
	}
	return {
		courts,
		draws,
		events,
		matches,
		officials,
		is_league,
		match_types: new Map(Object.entries(MATCH_TYPES)),
		team_matches,
		teams,
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
