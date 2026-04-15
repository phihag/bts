'use strict';

const assert = require('assert');

const async = require('async');

const btp_parse = require('./btp_parse');
const countries = require('./countries');
const match_utils = require('./match_utils');
const utils = require('./utils');
const { fix_player } = require('./name_fixup');


function time_str(dt) {
	return utils.pad(dt.hour, 2, '0') + ':' + utils.pad(dt.minute, 2, '0');
}

function date_str(dt) {
	return utils.pad(dt.year, 2, '0') + '-' + utils.pad(dt.month, 2, '0') + '-' + utils.pad(dt.day, 2, '0');
}

function _format_btp_match_relation_label(relation_key, bm) {
	if (!bm || !bm.MatchNr || !bm.MatchNr[0]) {
		return null;
	}
	const relation = relation_key === 'winner' ? 'Gewinner' : 'Verlierer';
	const planned_time = bm.PlannedTime && bm.PlannedTime[0];
	if (!planned_time) {
		return `${relation} #${bm.MatchNr[0]}`;
	}
	return `${relation} #${bm.MatchNr[0]} - ${date_str(planned_time)} ${time_str(planned_time)}`;
}

function _is_displayable_btp_match_node(node) {
	return !!(node && node.MatchNr && node.MatchNr[0]);
}

function _same_btp_from_pair(a, b) {
	if (!a || !b || !a.From1 || !a.From2 || !b.From1 || !b.From2) {
		return false;
	}
	return a.From1[0] == b.From1[0] && a.From2[0] == b.From2[0];
}

function _find_visible_consolidation_match_for_hidden_node(draw_id, hidden_node, planning_nodes) {
	if (!hidden_node || !hidden_node.From1 || !hidden_node.From2) {
		return null;
	}
	const hidden_planning = hidden_node.PlanningID && hidden_node.PlanningID[0];
	for (const candidate of planning_nodes.values()) {
		if (!candidate || candidate.DrawID[0] !== draw_id) {
			continue;
		}
		if (hidden_planning != null && candidate.PlanningID && candidate.PlanningID[0] == hidden_planning) {
			continue;
		}
		if (!_is_displayable_btp_match_node(candidate)) {
			continue;
		}
		if (_same_btp_from_pair(candidate, hidden_node)) {
			return candidate;
		}
	}
	return null;
}

function _find_incoming_matches_for_planning(draw_id, source_planning, planning_nodes) {
	const incoming = [];
	for (const candidate of planning_nodes.values()) {
		if (!candidate || candidate.DrawID[0] !== draw_id) {
			continue;
		}
		if (!_is_displayable_btp_match_node(candidate)) {
			continue;
		}
		let relation = null;
		if (candidate.WinnerTo && candidate.WinnerTo[0] == source_planning) {
			relation = 'winner';
		} else if (candidate.LoserTo && candidate.LoserTo[0] == source_planning) {
			relation = 'loser';
		}
		if (relation) {
			incoming.push({ candidate, relation });
		}
	}
	return incoming;
}

function _find_visible_consolidation_match_for_incoming(draw_id, incoming, planning_nodes) {
	if (!incoming || incoming.length < 2) {
		return null;
	}
	const incoming_plannings = incoming
		.map((entry) => entry.candidate && entry.candidate.PlanningID ? entry.candidate.PlanningID[0] : null)
		.filter((planning) => planning != null);
	if (incoming_plannings.length !== incoming.length) {
		return null;
	}
	for (const candidate of planning_nodes.values()) {
		if (!candidate || candidate.DrawID[0] !== draw_id) {
			continue;
		}
		if (!_is_displayable_btp_match_node(candidate)) {
			continue;
		}
		const candidate_sources = [
			candidate.From1 && candidate.From1[0],
			candidate.From2 && candidate.From2[0],
		];
		if (candidate_sources.every((planning) => planning != null && incoming_plannings.includes(planning))) {
			return candidate;
		}
	}
	return null;
}

function _resolve_btp_dependency_link(draw_id, source_planning, target_planning, btp_links, planning_nodes, visited = new Set()) {
	if (source_planning == null) {
		return null;
	}
	const visit_key = `${draw_id}_${source_planning}_${target_planning || ''}`;
	if (visited.has(visit_key)) {
		return null;
	}
	visited.add(visit_key);

	const direct_link = btp_links.find((l) => l.DrawID[0] === draw_id && l.PlanningID[0] == source_planning);
	if (direct_link && direct_link.Link && direct_link.Link[0]) {
		return direct_link.Link[0];
	}

	const incoming = _find_incoming_matches_for_planning(draw_id, source_planning, planning_nodes);
	if (incoming.length > 1) {
		const unique_relations = [...new Set(incoming.map((entry) => entry.relation))];
		if (unique_relations.length === 1) {
			const consolidation_match = _find_visible_consolidation_match_for_incoming(draw_id, incoming, planning_nodes);
			if (consolidation_match) {
				return _format_btp_match_relation_label(unique_relations[0], consolidation_match);
			}
		}
	}

	const node = planning_nodes.get(`${draw_id}_${source_planning}`);
	if (!node) {
		if (incoming.length === 1) {
			return _format_btp_match_relation_label(incoming[0].relation, incoming[0].candidate);
		}
		return null;
	}

	if (_is_displayable_btp_match_node(node)) {
		if (target_planning != null && node.WinnerTo && node.WinnerTo[0] == target_planning) {
			const direct_label = _format_btp_match_relation_label('winner', node);
			if (node.PlannedTime && node.PlannedTime[0]) {
				return direct_label;
			}
		}
		if (target_planning != null && node.LoserTo && node.LoserTo[0] == target_planning) {
			const direct_label = _format_btp_match_relation_label('loser', node);
			if (node.PlannedTime && node.PlannedTime[0]) {
				return direct_label;
			}
		}
	}

	const consolidation_match = _find_visible_consolidation_match_for_hidden_node(draw_id, node, planning_nodes);
	if (consolidation_match) {
		if (target_planning != null && node.WinnerTo && node.WinnerTo[0] == target_planning) {
			return _format_btp_match_relation_label('winner', consolidation_match);
		}
		if (target_planning != null && node.LoserTo && node.LoserTo[0] == target_planning) {
			return _format_btp_match_relation_label('loser', consolidation_match);
		}
		if (consolidation_match.WinnerTo && consolidation_match.WinnerTo[0] == source_planning) {
			return _format_btp_match_relation_label('winner', consolidation_match);
		}
		if (consolidation_match.LoserTo && consolidation_match.LoserTo[0] == source_planning) {
			return _format_btp_match_relation_label('loser', consolidation_match);
		}
	}

	if (_is_displayable_btp_match_node(node)) {
		if (target_planning != null && node.WinnerTo && node.WinnerTo[0] == target_planning) {
			return _format_btp_match_relation_label('winner', node);
		}
		if (target_planning != null && node.LoserTo && node.LoserTo[0] == target_planning) {
			return _format_btp_match_relation_label('loser', node);
		}
	}

	if (node.From1 && node.From1[0]) {
		const nested_from1 = _resolve_btp_dependency_link(draw_id, node.From1[0], source_planning, btp_links, planning_nodes, visited);
		if (nested_from1) {
			return nested_from1;
		}
	}
	if (node.From2 && node.From2[0]) {
		const nested_from2 = _resolve_btp_dependency_link(draw_id, node.From2[0], source_planning, btp_links, planning_nodes, visited);
		if (nested_from2) {
			return nested_from2;
		}
	}

	return null;
}

async function craft_match(app, tkey, btp_id, location_map, court_map, event, stage, scoring_formats, draw, btp_links, planning_nodes, officials, clubs, districts, bm, match_ids_on_court, match_types, is_league) {
	return new Promise((resolve, reject) => {
		const stournament = require('./stournament'); // avoid dependency cycle

		const gtid = event.GameTypeID[0];
		assert((gtid === 1) || (gtid === 2));

		const scheduled_time_str = (bm.PlannedTime ? time_str(bm.PlannedTime[0]) : undefined);
		const scheduled_date = (bm.PlannedTime ? date_str(bm.PlannedTime[0]) : undefined);
		const phase_name_raw = (bm.RoundName && bm.RoundName[0] ? bm.RoundName[0] : undefined);
		var match_name = phase_name_raw;
		var event_name = event.Name[0];
		const teams = _craft_teams(bm, clubs, districts);

		const rounds = new Map();
		if(draw.Position[0] > 1) {
			rounds.set("Finale",  [ 1,  2]);
			rounds.set("HF",      [ 1,  4]);
			rounds.set("VF",      [ 1,  8]);
			rounds.set("R16",     [ 1, 16]);
			rounds.set("R32",     [ 1, 32]);
		}
		rounds.set("3/4",     [ 3,  4]);
		rounds.set("5/6",     [ 5,  6]);
		rounds.set("7/8",     [ 7,  8]);
		rounds.set("9/10",    [ 9, 10]);
		rounds.set("11/12",   [11, 12]);
		rounds.set("13/14",   [13, 14]);
		rounds.set("15/16",   [15, 16]);
		rounds.set("17/18",   [17, 18]);
		rounds.set("19/20",   [19, 20]);
		rounds.set("21/22",   [21, 22]);
		rounds.set("23/24",   [23, 24]);
		rounds.set("25/26",   [25, 26]);
		rounds.set("27/28",   [27, 28]);
		rounds.set("29/30",   [29, 30]);
		rounds.set("31/32",   [31, 32]);
		rounds.set("5/8",     [ 5,  8]);
		rounds.set("9/12",    [ 9, 12]);
		rounds.set("13/16",   [13, 16]);
		rounds.set("17/20",   [17, 20]);
		rounds.set("21/24",   [21, 24]);
		rounds.set("25/28",   [25, 28]);
		rounds.set("29/32",   [29, 32]); 
		rounds.set("9/16",    [ 9, 16]);
		rounds.set("17/24",   [17, 24]);
		rounds.set("25/32",   [25, 32]);
		rounds.set("17/32",   [17, 32]);
		rounds.set("CP- R16", [ 5, 16]);
		rounds.set("CP- VF",  [ 5, 12]);

		let phase_block_key = 'UNKNOWN';
		if (phase_name_raw) {
			if (/^G\d+$/.test(phase_name_raw)) {
				phase_block_key = phase_name_raw;
			} else if (['R64', 'R32', 'R16', 'VF', 'HF'].includes(phase_name_raw)) {
				phase_block_key = phase_name_raw;
			} else if (phase_name_raw === 'CP- R16') {
				phase_block_key = 'CP-R16';
			} else if (phase_name_raw === 'CP- VF') {
				phase_block_key = 'CP-VF';
			} else if (['Finale', '3/4'].includes(phase_name_raw)) {
				phase_block_key = 'FR';
			}
		}

		if(match_name && rounds.get(match_name)) {
			const best_place = rounds.get(match_name)[0] + draw.Position[0] - 1;
			const lowes_place = rounds.get(match_name)[1] + draw.Position[0] - 1;

			match_name = best_place + "/" + lowes_place;
		} else {
			event_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + (draw.DrawTypeID[0] > 1 ? ' - ' + draw.Name[0] : "");
		}

		const btp_player_ids = [];

		if (bm.bts_players && bm.bts_players.length > 0) {
			for (const team of bm.bts_players) {
				if (team && team.length > 0) {
					for (const p of team) {
						btp_player_ids.push(p.ID[0]);
					}
				}
			}
		}

		const links = {};
		try {
			links.from1 = bm.From1[0];
			links.from2 = bm.From2[0];

			if (bm.WinnerTo) {
				links.winner_to = bm.WinnerTo[0];
			}
			if (bm.LoserTo) {
				links.loser_to = bm.LoserTo[0];
			}
			if (bm.Link) {
				links.from_link = bm.Link;
			}
		} catch (err) {
			console.log(err);
		}

		if (teams[0].players.length < 1) {
			links.from1_link = _resolve_btp_dependency_link(bm.DrawID[0], links.from1, bm.PlanningID[0], btp_links, planning_nodes);
		}

		if (teams[1].players.length < 1) {
			links.from2_link = _resolve_btp_dependency_link(bm.DrawID[0], links.from2, bm.PlanningID[0], btp_links, planning_nodes);
		}


		let scoring_format = null;

		if (stage.ScoringFormat) {
			scoring_format = scoring_formats.get(Number(stage.ScoringFormat));
		} else {
			scoring_format = findDefaultScoringFormat(scoring_formats);
		}

		// Fallback, falls gar nichts gefunden wird
		if (!scoring_format) {
			scoring_format = fallbackScoringFormat();
		}

		const setup = {
			is_match: (bm.IsMatch && bm.IsMatch[0] ? true : false),
			incomplete: !bm.bts_complete,
			is_doubles: (gtid === 2),
			match_num: bm.MatchNr[0],
			scoring_format: scoring_format,
			team_competition: false,
			event_name,
			teams,
			warmup: "none",
			links: links,
			highlight: bm.Highlight[0],
			phase_name_raw,
			phase_block_key,
		};

		app.db.tournaments.findOne({ key: tkey }, (err, tournament) => {

			if (err) {
				reject(err);
			}
			if (tournament.warmup) {
				setup.warmup = tournament.warmup;
			}
			if (tournament.warmup_ready) {
				setup.warmup_ready = tournament.warmup_ready;
			}
			if (tournament.warmup_start) {
				setup.warmup_start = tournament.warmup_start;
			}
			if (tournament.btp_settings.check_in_per_match && teams.length > 1 && teams[0].players.length > 0) {
				teams[0].players[0].checked_in = (bm.Status & 0b0001) > 0;
				teams[0].players[0].check_in_per_match = true;
				if (teams[0].players.length > 1) {
					teams[0].players[1].checked_in = (bm.Status & 0b0010) > 0;
					teams[0].players[1].check_in_per_match = true;
				}

				if (teams[1].players.length > 0) {
					teams[1].players[0].checked_in = (bm.Status & 0b0100) > 0;
					teams[1].players[0].check_in_per_match = true;
					if (teams[1].players.length > 1) {
						teams[1].players[1].checked_in = (bm.Status & 0b1000) > 0;
						teams[1].players[1].check_in_per_match = true;
					}
				}
			}
			if (match_name) {
				setup.match_name = match_name;
			}

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
			if(bm.LocationID) {
				const btp_location_id = bm.LocationID[0];
				const location_id = location_map.get(btp_location_id);
				assert(location_id);
				setup.location_id = location_id;
			}
			if(setup.highlight != 0) {
				stournament.get_locations(app.db, tkey, function (err, all_locations) {
					const location = all_locations.find(loc => loc.highlight === setup.highlight);
					if(location) {
						setup.location_id = location._id;
					}
				});
			}
			if (bm.Official1ID) {
				const official_id = bm.Official1ID[0];
				const o = get_umpire(app, tkey, officials, official_id) || build_fallback_official(official_id, tkey);
				if (o) {
					setup.umpire = { ...o, checked_in: !!o.checked_in };
				}
			}
			if (bm.Official2ID) {
				const official_id = bm.Official2ID[0];
				const o = get_umpire(app, tkey, officials, official_id) || build_fallback_official(official_id, tkey);
				if (o) {
					setup.service_judge = { ...o, checked_in: !!o.checked_in };
				}
			}

			const btp_match_ids = [{
				id: bm.ID[0],
				nr: bm.MatchNr[0],
				draw: bm.DrawID[0],
				planning: bm.PlanningID[0],
			}];

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
			resolve(match);
		});
	});
}

function findDefaultScoringFormat(scoringFormatMap) {

    for (const entry of scoringFormatMap.entries()) {
      const id = entry[0];
      const sf = entry[1];

      if (sf && sf.isDefault) return sf;
    }
    return null;
}

function mergeLocalMatchIntoBtpMatch(current_match, match) {
	if (current_match.team1_won === null) {
		current_match.team1_won = undefined;
	}

	if (current_match.btp_winner) {
		match.setup.state = 'finished';
	}
	if (typeof current_match.team1_won === 'boolean' || current_match.btp_winner || current_match.btp_needsync) {
		match.setup.now_on_court = false;
		match.setup.state = 'finished';
	} else if (current_match.setup.now_on_court === true) {
		// Keep the local on-court state until the result is explicitly confirmed.
		match.setup.now_on_court = true;
		if (current_match.setup.state === 'blocked') {
			match.setup.state = 'blocked';
		} else if (current_match.setup.called_timestamp) {
			match.setup.state = 'oncourt';
		}
	}

	if (!match.setup.court_id && current_match.setup && current_match.setup.court_id) {
		match.setup.court_id = current_match.setup.court_id;
	}

	if (!match.network_score && current_match.network_score) {
		match.network_score = current_match.network_score;
	}

	if (current_match.setup.called_timestamp) {
		match.setup.called_timestamp = current_match.setup.called_timestamp;
	}

	const local_preparation_active =
		current_match.setup &&
		current_match.setup.state === 'preparation' &&
		Number(current_match.setup.highlight) > 0 &&
		current_match.setup.preparation_call_timestamp;

	if (local_preparation_active) {
		match.setup.preparation_call_timestamp = current_match.setup.preparation_call_timestamp;
		match.setup.state = 'preparation';
	}
	if (current_match.setup.needs_preparation_successor != null) {
		match.setup.needs_preparation_successor = current_match.setup.needs_preparation_successor;
	}
	if (current_match.setup.needs_preparation_successor_ts != null) {
		match.setup.needs_preparation_successor_ts = current_match.setup.needs_preparation_successor_ts;
	}

	const suppression_active = current_match.btp_needsync === true;
	const suppressed_umpire_btp_id = suppression_active ? current_match.setup.suppressed_umpire_btp_id : null;
	const suppressed_service_judge_btp_id = suppression_active ? current_match.setup.suppressed_service_judge_btp_id : null;
	if (suppressed_umpire_btp_id != null) {
		if (match.setup.umpire && String(match.setup.umpire.btp_id) === String(suppressed_umpire_btp_id)) {
			delete match.setup.umpire;
			match.setup.suppressed_umpire_btp_id = suppressed_umpire_btp_id;
		}
	}
	if (suppressed_service_judge_btp_id != null) {
		if (match.setup.service_judge && String(match.setup.service_judge.btp_id) === String(suppressed_service_judge_btp_id)) {
			delete match.setup.service_judge;
			match.setup.suppressed_service_judge_btp_id = suppressed_service_judge_btp_id;
		}
	}

	if (current_match.btp_needsync === true && current_match.setup.umpire && !match.setup.umpire && suppressed_umpire_btp_id == null) {
		match.setup.umpire = current_match.setup.umpire;
	}

	if (current_match.setup.umpire && match.setup.umpire &&
		current_match.setup.umpire.btp_id == match.setup.umpire.btp_id &&
		current_match.btp_needsync === true &&
		('checked_in' in current_match.setup.umpire)) {
		match.setup.umpire.checked_in = current_match.setup.umpire.checked_in;
	}

	if (current_match.btp_needsync === true && current_match.setup.service_judge && !match.setup.service_judge && suppressed_service_judge_btp_id == null) {
		match.setup.service_judge = current_match.setup.service_judge;
	}

	if (current_match.setup.service_judge && match.setup.service_judge &&
		current_match.setup.service_judge.btp_id == match.setup.service_judge.btp_id &&
		current_match.btp_needsync === true &&
		('checked_in' in current_match.setup.service_judge)) {
		match.setup.service_judge.checked_in = current_match.setup.service_judge.checked_in;
	}

	if (current_match.setup.tabletoperators) {
		match.setup.tabletoperators = current_match.setup.tabletoperators;
	}

	for (let team_index = 0; team_index < Math.min(current_match.setup.teams.length, match.setup.teams.length); team_index++) {
		for (let player_index = 0; player_index < Math.min(current_match.setup.teams[team_index].players.length, match.setup.teams[team_index].players.length); player_index++) {
			if (current_match.setup.teams[team_index].players[player_index].now_playing_on_court != undefined) {
				match.setup.teams[team_index].players[player_index].now_playing_on_court = current_match.setup.teams[team_index].players[player_index].now_playing_on_court;
			}

			if (current_match.setup.teams[team_index].players[player_index].now_tablet_on_court != undefined) {
				match.setup.teams[team_index].players[player_index].now_tablet_on_court = current_match.setup.teams[team_index].players[player_index].now_tablet_on_court;
			}

			if (current_match.setup.teams[team_index].players[player_index].tablet_break_active != undefined) {
				match.setup.teams[team_index].players[player_index].tablet_break_active = current_match.setup.teams[team_index].players[player_index].tablet_break_active;
			}

			if (current_match.btp_needsync === true &&
				current_match.setup.teams[team_index].players[player_index].checked_in != undefined) {
				match.setup.teams[team_index].players[player_index].checked_in = current_match.setup.teams[team_index].players[player_index].checked_in;
			}
		}
	}

	return match;
}

function _craft_team(par) {
	if (!par) {
		return { players: [] };
	}

	const players = par.map(p => {
		const asian_name = !!(p.Asianname && p.Asianname[0]);
		const pres = { asian_name };
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


		if (p.ID && p.ID[0]) {
			pres.btp_id = p.ID[0];
		}

		if (p.Country && p.Country[0]) {
			pres.nationality = p.Country[0];
		}

		//if (p.entries) {
		//	pres.entries = p.entries;
		//}

		if (p.LastTimeOnCourt && p.LastTimeOnCourt[0]) {
			let date = new Date(p.LastTimeOnCourt[0].year,
				p.LastTimeOnCourt[0].month - 1,
				p.LastTimeOnCourt[0].day,
				p.LastTimeOnCourt[0].hour,
				p.LastTimeOnCourt[0].minute,
				p.LastTimeOnCourt[0].second,
				p.LastTimeOnCourt[0].ms);
			pres.last_time_on_court_ts = date.getTime();
		}

		if (p.CheckedIn && p.CheckedIn.length > 0) {
			pres.checked_in = p.CheckedIn[0];
		}

		try{
			const club = this.clubs.get(p.ClubID[0]);
			const district = this.districts.get(club.DistrictID[0]);
			const state_by_district = district.Name[0].split("-")[0];

			var state = (state_by_district ? state_by_district : (p.State && p.Satate.length > 0 ? p.State[0] : undefined));
			if (state) {
				switch (state) {
					case 'BAW' : {
						pres.state = "Baden-Württemberg";
						break;
					} case 'BAY' : {
						pres.state = "Bayern";
						break;
					} case 'BBB': {
						pres.state = "Berlin-Brandenburg";
						break;
					} case 'BRE': {
						pres.state = "Bremen";
						break;
					} case 'HAM': {
						pres.state = "Hamburg";
						break;
					}  case 'HES': {
						pres.state = "Hessen";
						break;
					} case 'MVP': {
						pres.state = "Mecklenburg-Vorpommern";
						break;
					} case 'NIS': {
						pres.state = "Niedersachsen";
						break;
					} case 'NRW': {
						pres.state = "Nordrhein-Westfalen";
						break;
					} case 'RHP': {
						pres.state = "Rheinhessen-Pfalz";
						break;
					} case 'RHL': {
						pres.state = "Rheinland";
						break;
					} case 'SAA': {
						pres.state = "Saarland";
						break;
					} case 'SAC': {
						pres.state = "Sachsen";
						break;
					} case 'SAH': {
						pres.state = "Sachsen-Anhalt";
						break;
					} case 'SLH': {
						pres.state = "Schleswig-Holstein";
						break;
					} case 'THÜ': {
						pres.state = "Thüringen";
						break;
					} 
					default:
						pres.state = state
				}
			}
		} catch (error)
		{
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

function _craft_teams(bm, clubs, districts) {
	assert(bm.bts_players);
	assert(clubs);
	assert(districts);

	let res = bm.bts_players.map(_craft_team, {clubs: clubs, districts: districts});

	return res;
}

function _parse_score(bm) {
	assert(bm.Sets);
	assert(bm.Sets[0]);
	assert(bm.Sets[0].Set);

	return bm.Sets[0].Set.map(s => [s.T1[0], s.T2[0]]);
}

async function cleanup_entities(app, tkey, btp_state, callback) {

	const { draws, events } = btp_state;
	var btpMaptches = {}
	btp_state.matches.forEach(function (match) {
		btpMaptches[calculate_btp_match_id(tkey, match, draws, events)] = true;
	})

	app.db.matches.find({ 'tournament_key': tkey }, (err, matches, cb) => {
		if (err) {
			return callback(err);
		}
		matches.forEach(function (match) {

			if (btpMaptches[match.btp_id] === true) {
				//TODO invert query
				return;
			} else {
				const match_q = { _id: match._id };
				app.db.matches.remove(match_q, {}, (err) => {
					const admin = require('./admin');
					admin.notify_change(app, match.tournament_key, 'match_remove', {
						match__id: match._id
					});
					return;
				});

			}
		})
	});
	var btpUmpires = {}
	btp_state.officials.forEach(function (umpire) {
		btpUmpires[umpire.ID[0]] = true;
	})

	const querry = { 'tournament_key': tkey };
	app.db.umpires.find(querry).exec((err, umpires) => {
		if (err) {
			return callback(err);
		}
		umpires.forEach(function (umpire) {
			if (btpUmpires[umpire.btp_id] === true) {
				return;
			}
			const allListsNull =
				!umpire.is_planed_as_umpire &&
				!umpire.is_planed_as_service_judge &&
				umpire.umpire_on_court == null &&
				umpire.service_judge_on_court == null &&
				umpire.umpire_wait == null &&
				umpire.service_judge_wait == null &&
				umpire.umpire_pause == null &&
				umpire.service_judge_pause == null;

			const next_inactive_list = allListsNull ? (umpire.inactive_list || Date.now()) : null;
			if (umpire.inactive_list === next_inactive_list) {
				return;
			}

			app.db.umpires.update(
				{ _id: umpire._id },
				{ $set: { inactive_list: next_inactive_list } },
				{ returnUpdatedDocs: true },
				(err, numAffected, changed_umpire) => {
					if (err) {
						console.error(err);
						return;
					}
					const admin = require('./admin');
					admin.notify_change(app, tkey, 'umpire_updated', changed_umpire);
				}
			);
		});
	});


	return callback(null);
}


function calculate_btp_match_id(tkey, bm, draws, events) {
	const draw = draws.get(bm.DrawID[0]);
	const event = events.get(draw.EventID[0]);
	const discipline_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + '_' + draw.Name[0];
	return tkey + '_' + discipline_name + '_' + bm.ID[0];
}

function build_match_update_fields(match) {
	return {
		btp_match_ids: match.btp_match_ids,
		btp_player_ids: match.btp_player_ids,
		setup: match.setup,
		team1_won: match.team1_won,
		btp_winner: match.btp_winner,
		btp_needsync: match.btp_needsync,
		network_score: match.network_score,
		network_team1_left: match.network_team1_left,
		network_team1_serving: match.network_team1_serving,
		network_teams_player1_even: match.network_teams_player1_even,
		presses: match.presses,
		duration_ms: match.duration_ms,
		end_ts: match.end_ts,
		shuttle_count: match.shuttle_count,
		match_order: match.match_order,
	};
}

function build_match_update_operations(current_match, next_match) {
	const current_fields = build_match_update_fields(current_match);
	const next_fields = build_match_update_fields(next_match);
	const setObj = {};
	const unsetObj = {};

	function append_update_ops(current_value, next_value, path) {
		if (utils.deep_equal(current_value, next_value)) {
			return;
		}

		if (next_value === undefined) {
			unsetObj[path] = true;
			return;
		}

		if (current_value === undefined) {
			setObj[path] = next_value;
			return;
		}

		const current_is_array = Array.isArray(current_value);
		const next_is_array = Array.isArray(next_value);
		if (current_is_array || next_is_array) {
			if (!current_is_array || !next_is_array || current_value.length !== next_value.length) {
				setObj[path] = next_value;
				return;
			}
			for (let i = 0; i < next_value.length; i++) {
				append_update_ops(current_value[i], next_value[i], `${path}.${i}`);
			}
			return;
		}

		const current_is_object = current_value && typeof current_value === 'object';
		const next_is_object = next_value && typeof next_value === 'object';
		if (current_is_object && next_is_object) {
			const keys = new Set([...Object.keys(current_value), ...Object.keys(next_value)]);
			keys.forEach((key) => append_update_ops(current_value[key], next_value[key], `${path}.${key}`));
			return;
		}

		setObj[path] = next_value;
	}

	Object.keys(next_fields).forEach((key) => append_update_ops(current_fields[key], next_fields[key], key));

	const update = {};
	if (Object.keys(setObj).length > 0) {
		update.$set = setObj;
	}
	if (Object.keys(unsetObj).length > 0) {
		update.$unset = unsetObj;
	}
	return update;
}


function get_umpires(app, tkey) {
	return new Promise((resolve, reject) => {
		const querry = { 'tournament_key': tkey };
		app.db.umpires.find(querry).exec((err, umpires) => {
			if (err) {
				return reject(err);
			}
			return resolve(umpires);
		});
	});
}

function get_umpire(app, tkey, umpires , btp_id) {
	var returnValue = null;
	umpires.forEach((umpire) => {
		if (umpire.btp_id != null && String(umpire.btp_id) === String(btp_id)) {
			returnValue = umpire;
		}
	});
	return returnValue;
}

function build_fallback_official(official_id, tkey) {
	return {
		_id: `${tkey}_btp_${official_id}`,
		tournament_key: tkey,
		btp_id: official_id,
		firstname: '',
		surname: '',
		name: `BTP Official ${official_id}`,
		country: '',
		status: 'ready'
	};
}

async function integrate_matches(app, tkey, btp_state, scoring_formats, location_map, court_map, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const match_utils = require('./match_utils');
	const { draws, events, stages } = btp_state;

	const match_ids_on_court = calculate_match_ids_on_court(btp_state);

	const officials = await get_umpires(app, tkey);

	const matches_to_add = [];
	const matches_player_changed = [];
	const matches_on_court = [];
	const matches_incomplete = [];
	const clubs = btp_state.clubs;
	const districts = btp_state.districts;
	let changes = false;

	async.each(btp_state.matches, function (bm, cb) {		
		const draw = draws.get(bm.DrawID[0]);
		assert(draw);

		const event = events.get(draw.EventID[0]);
		assert(event);

		const stage = stages.get(draw.StageID[0]);
		assert(stage);

		const btp_id = calculate_btp_match_id(tkey, bm, draws, events);

		if (!(bm.IsMatch && bm.IsMatch[0])) {
			cb(null);
			return;
		}

		if (bm.ReverseHomeAway) {
			cb(null);
			return;
		}
		const query = {
			btp_id,
			tournament_key: tkey,
		};
		// TODO get all matches upfront here
		app.db.matches.findOne(query, (err, cur_match) => {
			if (err) {
				console.log(err);
				cb(null);
				return;
			};
			if (cur_match && cur_match.btp_needsync) {
				cb(null);
				return;
			}

			craft_match(app, tkey, btp_id, location_map, court_map, event, stage, scoring_formats, draw, btp_state.links, btp_state.planning_nodes, officials, clubs, districts, bm, match_ids_on_court).then(match => {

				
				match.setup.state = 'unscheduled';
				if (match.setup.now_on_court === true) {
					match.setup.state = 'oncourt';
					matches_on_court.push(match);
				} 
				else if (match.setup.incomplete == true) {
					match.setup.state = 'incomplete';
					matches_incomplete.push(match);
				}
				else if (match.setup.scheduled_date && match.setup.scheduled_time_str) {
					match.setup.state = 'scheduled';
				}

				if (cur_match) {
					app.db.matches.findOne({ _id: cur_match._id, tournament_key: tkey }, (err, latest_match) => {
						if (err) {
							cb(err);
							return;
						}
						const current_match = latest_match || cur_match;

						match = mergeLocalMatchIntoBtpMatch(current_match, match);

						for (let team_index = 0; team_index < Math.min(current_match.setup.teams.length, match.setup.teams.length); team_index++) {
							for (let player_index = 0; player_index < Math.min(current_match.setup.teams[team_index].players.length, match.setup.teams[team_index].players.length); player_index++) {

								if (current_match.setup.teams[team_index].players[player_index].last_time_on_court_ts || match.setup.teams[team_index].players[player_index].last_time_on_court_ts) {
									const current_ts = current_match.setup.teams[team_index].players[player_index].last_time_on_court_ts || 0;
									const next_ts = match.setup.teams[team_index].players[player_index].last_time_on_court_ts || 0;
									const max_ts = Math.max(current_ts, next_ts);
									current_match.setup.teams[team_index].players[player_index].last_time_on_court_ts = max_ts;
									match.setup.teams[team_index].players[player_index].last_time_on_court_ts = max_ts;
								}
							}
						}

						match.btp_needsync = current_match.btp_needsync;
						match.network_team1_left = current_match.network_team1_left;
						match.network_team1_serving = current_match.network_team1_serving;
						match.network_teams_player1_even = current_match.network_teams_player1_even;
						match.presses = current_match.presses;
						match.duration_ms = current_match.duration_ms;
						match.end_ts = current_match.end_ts;

						if (match.setup.now_on_court === false) {
							if (current_match.setup.warmup) {
								match.setup.warmup = current_match.setup.warmup;
							}

							if (current_match.setup.warmup_ready) {
								match.setup.warmup_ready = current_match.setup.warmup_ready;
							}

							if (current_match.setup.warmup_start) {
								match.setup.warmup_start = current_match.setup.warmup_start;
							}
						}

						for (let team_index = 0; team_index < Math.min(current_match.setup.teams.length, match.setup.teams.length); team_index++) {
							for (let player_index = 0; player_index < Math.min(current_match.setup.teams[team_index].players.length, match.setup.teams[team_index].players.length); player_index++) {
								if ('tablet_break_active' in current_match.setup.teams[team_index].players[player_index]) {
									match.setup.teams[team_index].players[player_index].tablet_break_active = current_match.setup.teams[team_index].players[player_index].tablet_break_active;
								}
							}
						}

						if (utils.plucked_deep_equal(match, current_match, Object.keys(match), true)) {
							cb(null);
							return;
						}

						let only_change_check_in = false;
						let result_enterd_in_btp = false;
						let match_player_changed = false;
						const current_match_for_check_in_compare = JSON.parse(JSON.stringify(current_match));

						for (let team_index = 0; team_index < Math.min(current_match.setup.teams.length, match.setup.teams.length); team_index++) {
							if(current_match.setup.teams[team_index].players.length < match.setup.teams[team_index].players.length){
								for (let player_index = 0; player_index < match.setup.teams[team_index].players.length; player_index++) {
									match_player_changed = true;
								}
							}
							for (let player_index = 0; player_index < Math.min(current_match.setup.teams[team_index].players.length, match.setup.teams[team_index].players.length); player_index++) {
								current_match_for_check_in_compare.setup.teams[team_index].players[player_index].checked_in = match.setup.teams[team_index].players[player_index].checked_in;
								if(match.setup.teams[team_index].players[player_index].btp_id != current_match.setup.teams[team_index].players[player_index].btp_id) {
									match_player_changed = true;
								}
							}
						}

						if (!current_match.team1_won && current_match.team1_won != match.team1_won) {
							if (!match.end_ts) {
								result_enterd_in_btp = true;
								match.setup.warmup = 'none';
								match.end_ts = Date.now();

								app.db.tournaments.findOne({ key: tkey }, async (err, tournament) => {
									if (err) {
										return callback(err);
									}
									if ((tournament.tabletoperator_enabled && tournament.tabletoperator_enabled == true)) {
										const match_utils = require('./match_utils');
										match_utils.reset_player_tabletoperator(app, tkey, match._id, match.end_ts);
									}
								});
							}
						}

						if (utils.plucked_deep_equal(match, current_match_for_check_in_compare, Object.keys(match), true)) {
							only_change_check_in = true;
						}

						if(match_player_changed) {
							matches_player_changed.push(match);
						}

						const update_ops = build_match_update_operations(current_match, match);
						if (Object.keys(update_ops).length === 0) {
							cb(null);
							return;
						}

						app.db.matches.update({ _id: current_match._id }, update_ops, {}, (err) => {
							if (err) {
								cb(err);
								return;
							}

							if (match.setup.is_match) {
								if (!only_change_check_in || result_enterd_in_btp) {
									changes = true;
									admin.notify_change(app, match.tournament_key, 'match_edit', {
										match__id: match._id,
										match: match
									});
								} else {
									admin.notify_change(app, match.tournament_key, 'update_player_status', {
										match__id: match._id,
										btp_winner: match.btp_winner,
										setup: match.setup
									});
								}
							}
							cb(null);
						});
					});
					return;
				}
				changes = true;
				matches_to_add.push(match);
				cb(null)
				return;
			}, error => {
				cb(null);
				return;
			});
		});
	}, (error) => {
		if (error) {
			console.error(error);
		}

		matches_player_changed.forEach(async (match_player_changed) => {
			let match = match_player_changed;
			matches_on_court.forEach(async (match_on_court) => {
				const changed_match_on_court = await match_utils.calc_match_set_player_on_court(match, match_on_court.setup);
				if(changed_match_on_court != null) {
					match = changed_match_on_court;
				}
				const changed_match_tablet_operator = await match_utils.calc_match_set_player_on_tablet(match, match_on_court.setup);
				if(changed_match_tablet_operator != null) {
					match = changed_match_tablet_operator;
				}
			});
		});

		matches_to_add.forEach(async (match_to_add) => {
			let match = match_to_add;
			matches_on_court.forEach(async (match_on_court) => {
				const changed_match_on_court = await match_utils.calc_match_set_player_on_court(match, match_on_court.setup);
				if(changed_match_on_court != null) {
					match = changed_match_on_court;
				}
				const changed_match_tablet_operator = await match_utils.calc_match_set_player_on_tablet(match, match_on_court.setup);
				if(changed_match_tablet_operator != null) {
					match = changed_match_tablet_operator;
				}
			});

			if(match.setup.now_on_court && !match.setup.called_timestamp) {
				match.setup.called_timestamp = Date.now();
			}

			app.db.matches.insert(match, function(err) {
				if (err) {
					console.error(err);
				}
				admin.notify_change(app, tkey, 'match_add', { match });
			});
		});
		if(changes){
			setTimeout(function(){
				matches_incomplete.forEach(match => {
					admin.notify_change(app, match.tournament_key, 'match_edit', {
						match__id: match._id,
						match: match
					});
				});
			}, 500);
		};

		
		callback(null);
	});
}

async function reconcile_match_officials(app, tkey, callback) {
	const admin = require('./admin');
	const stournament = require('./stournament');

	app.db.tournaments.findOne({ key: tkey }, (tournamentErr, tournament) => {
		if (tournamentErr) {
			return callback(tournamentErr);
		}
	app.db.matches.find({ tournament_key: tkey }, (err, matches) => {
		if (err) {
			return callback(err);
		}

		app.db.umpires.find({ tournament_key: tkey }, (err2, umpires) => {
			if (err2) {
				return callback(err2);
			}

			const byId = new Map();
			const byBtpId = new Map();
			umpires.forEach((umpire) => {
				byId.set(umpire._id, umpire);
				if (umpire.btp_id != null) {
					byBtpId.set(String(umpire.btp_id), umpire);
				}
			});

			const refs = [];
			matches.forEach((match) => {
				const setup = match.setup || {};
				if (setup.umpire) {
					refs.push({ official: setup.umpire, role: 'umpire', match });
				}
				if (setup.service_judge) {
					refs.push({ official: setup.service_judge, role: 'service_judge', match });
				}
			});

			let changed = false;

			async.eachSeries(refs, ({ official, role, match }, cb) => {
				const existing =
					(official._id && byId.get(official._id)) ||
					(official.btp_id != null && byBtpId.get(String(official.btp_id))) ||
					null;

				const is_on_court = match.setup && match.setup.now_on_court === true;
				const is_finished = typeof match.team1_won === 'boolean' || match.btp_winner || match.btp_needsync;
				const planned_key = role === 'umpire' ? 'is_planed_as_umpire' : 'is_planed_as_service_judge';
				const on_court_key = role === 'umpire' ? 'umpire_on_court' : 'service_judge_on_court';
				const safe_name = official.name || [official.firstname, official.surname].filter(Boolean).join(' ').trim();

				if (!existing) {
					const new_official = {
						_id: official._id || (official.btp_id != null ? `${tkey}_btp_${official.btp_id}` : `${tkey}_${role}_${match._id}`),
						tournament_key: tkey,
						btp_id: official.btp_id,
						firstname: official.firstname || '',
						surname: official.surname || '',
						name: safe_name,
						country: official.country || '',
						status: 'ready',
						is_umpire: role === 'umpire',
						is_service_judge: role === 'service_judge',
						is_planed_as_umpire: role === 'umpire' && !is_on_court && !is_finished,
						is_planed_as_service_judge: role === 'service_judge' && !is_on_court && !is_finished,
						umpire_on_court: role === 'umpire' && is_on_court ? (match.setup.court_id || true) : null,
						service_judge_on_court: role === 'service_judge' && is_on_court ? (match.setup.court_id || true) : null,
						umpire_wait: null,
						service_judge_wait: null,
						umpire_pause: null,
						service_judge_pause: null,
						inactive_list: null,
						checked_in: match_utils.get_effective_technical_official_checked_in({
							umpire_pause: null,
							service_judge_pause: null,
							umpire_manual_pause: null,
							service_judge_manual_pause: null,
							inactive_list: null,
						}, tournament)
					};
					changed = true;
					app.db.umpires.insert(new_official, (insertErr, inserted) => {
						if (insertErr) {
							return cb(insertErr);
						}
						byId.set(inserted._id, inserted);
						if (inserted.btp_id != null) {
							byBtpId.set(String(inserted.btp_id), inserted);
						}
						admin.notify_change(app, tkey, 'umpire_add', { umpire: inserted });
						return cb();
					});
					return;
				}

				const setObj = {};
				if ((existing.name || '') !== safe_name) setObj.name = safe_name;
				if ((existing.firstname || '') !== (official.firstname || '')) setObj.firstname = official.firstname || '';
				if ((existing.surname || '') !== (official.surname || '')) setObj.surname = official.surname || '';
				if ((existing.country || '') !== (official.country || '')) setObj.country = official.country || '';
				if (official.btp_id != null && existing.btp_id !== official.btp_id) setObj.btp_id = official.btp_id;

				if (!is_finished) {
					if (!is_on_court && existing[planned_key] !== true) {
						setObj[planned_key] = true;
					}
					if (is_on_court && existing[on_court_key] == null) {
						setObj[on_court_key] = match.setup.court_id || true;
					}
					if (existing.umpire_wait != null) {
						setObj.umpire_wait = null;
					}
					if (existing.service_judge_wait != null) {
						setObj.service_judge_wait = null;
					}
					if (existing.umpire_pause != null) {
						setObj.umpire_pause = null;
					}
					if (existing.service_judge_pause != null) {
						setObj.service_judge_pause = null;
					}
					if (existing.inactive_list != null) {
						setObj.inactive_list = null;
					}
				}

				const next_checked_in = match_utils.get_effective_technical_official_checked_in({ ...existing, ...setObj }, tournament);
				if (!!existing.checked_in !== next_checked_in) {
					setObj.checked_in = next_checked_in;
				}

				if (Object.keys(setObj).length === 0) {
					return cb();
				}

				changed = true;
				app.db.umpires.update(
					{ _id: existing._id },
					{ $set: setObj },
					{ returnUpdatedDocs: true },
					(updateErr, numAffected, updated) => {
						if (updateErr) {
							return cb(updateErr);
						}
						byId.set(updated._id, updated);
						if (updated.btp_id != null) {
							byBtpId.set(String(updated.btp_id), updated);
						}
						admin.notify_change(app, tkey, 'umpire_updated', updated);
						return cb();
					}
				);
			}, (seriesErr) => {
				if (seriesErr || !changed) {
					return callback(seriesErr);
				}
				stournament.get_umpires(app.db, tkey, (allErr, all_umpires) => {
					if (!allErr) {
						admin.notify_change(app, tkey, 'umpires_changed', { all_umpires });
					}
					return callback(allErr);
				});
			});
		});
	});
	});
}

function generateHallAbbreviation(name) {
	const wordRegex = /([A-Za-zÄÖÜäöüß0-9]+)([\s\-]*)/g;
	let match;
	let abbreviation = '';
	let parts = [];
	let foundAcronym = false;

	// Zerlege in Wortteile + Trennzeichen
	while ((match = wordRegex.exec(name)) !== null) {
		parts.push({
			word: match[1],
			sep: match[2] || ''
		});
	}

	let i = 0;
	while (i < parts.length) {
		const { word, sep } = parts[i];

		// Zahlen mit optionalem Buchstaben (z.B. "12A")
		if (/^\d+[A-Z]?$/.test(word)) {
			abbreviation += sep + word;

			// Sonderregel: nächstes Wort beginnt mit Großbuchstabe → ersten Buchstaben übernehmen
			if (i + 1 < parts.length && /^[A-ZÄÖÜ]/.test(parts[i + 1].word)) {
				const next = parts[i + 1];
				abbreviation += next.sep + next.word[0].toUpperCase();
				i++; // zusätzliches Wort verarbeitet
			}

			i++;
			continue;
		}

		// Großbuchstaben-Akronym
		if (!foundAcronym && /^[A-ZÄÖÜ]{2,}$/.test(word)) {
			abbreviation += word;

			if (i + 1 < parts.length) {
				abbreviation += sep + parts[i + 1].word[0].toUpperCase();
			} else {
				abbreviation += sep;
			}
			foundAcronym = true;
			i += 2;
			continue;
		}

		// Standard: erster Buchstabe
		if (!foundAcronym) {
			abbreviation += word[0].toUpperCase() + sep;
		}

		i++;
	}

	// Kein Akronym → Leerzeichen & Endpunkt entfernen
	if (!foundAcronym) {
		abbreviation = abbreviation.replace(/\s+/g, '');
		abbreviation = abbreviation.replace(/\.+$/, '');
	}

	return abbreviation.trim();
}

function integrate_locations(app, tournament_key, btp_state, scoring_formats, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const locations = Array.from(btp_state.locations.values());
	const res = new Map();
	var changed = false;

	async.eachSeries(locations, (l, cb) => {
		const btp_id = l.ID[0];
		const name = l.Name[0];
		const address = (l.Address1 ? l.Address1[0] : "");
		const postal_code = (l.PostalCode ? l.PostalCode[0] : "");
		const city = (l.City ? l.City[0] : "");
		const state = (l.State ? l.State[0] : "");
		const country = (l.Country ? l.Country[0] : "");
		const preparation_addition = "";
		const meetingpoint_announcement = "";
		const short_name = generateHallAbbreviation(name);

		const query = {
			tournament_key,
			btp_id,
			name,
			address,
			postal_code,
			city,
			state,
			country,
			short_name
		};

		app.db.locations.findOne(query, (err, cur_location) => {
			if (err) return cb(err);
			if (cur_location) {
				res.set(btp_id, cur_location._id);
				return cb();
			}

			const alt_query = {
				tournament_key,
				btp_id,
			};

			app.db.locations.findOne(alt_query, async (err, cur_location) => {
				if (err) return cb(err);

				if (cur_location) {

					//ADD BTP ID
					app.db.locations.update(alt_query, { $set: { btp_id, name, address, postal_code, city, state, country, preparation_addition, meetingpoint_announcement, short_name} }, {}, (err) => cb(err));
					return;
				}

				const highlights = [0, 1, 2, 3, 4, 5, 6];
				let highlight = null;

				for (let i = highlights.length - 1; i >= 0; i--) {
					const test = await app.db.locations.findOne_async({ tournament_key, highlight: highlights[i] });

					if (!test) {
						highlight = highlights[i];
						break;
					}
				}

				const location = {
					_id: tournament_key + '_' + btp_id,
					tournament_key,
					btp_id,
					name,
					address,
					postal_code,
					city,
					state,
					country,
					preparation_addition,
					meetingpoint_announcement,
					short_name,
					highlight,
				};

				res.set(btp_id, location._id);

				changed = true;
				app.db.locations.insert(location, (err) => cb(err));
			});
		}); 

	}, (err) => {
		if (err) {
			return callback(err);
		}

		if (changed) {
			stournament.get_locations(app.db, tournament_key, function (err, all_locations) {
				admin.notify_change(app, tournament_key, 'location_changed', { all_locations });
				callback(err, scoring_formats, res);
			});
		} else {
			callback(err, scoring_formats, res);
		}
	});
}




// Returns a map btp_court_id => court._id
function integrate_courts(app, tournament_key, btp_state, scoring_formats, location_map, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const courts = Array.from(btp_state.courts.values());
	const res = new Map();
	var changed = false;
	async.each(courts, (c, cb) => {
		const btp_id = c.ID[0];
		const name = c.Name[0];
		const btp_location_id = c.LocationID[0];
		const location_id = location_map.get(btp_location_id);
		assert(location_id);
		let num = parseInt(name, 10) || btp_id;
		const m = /^Court\s*([0-9]+)$/.exec(name);
		if (m) {
			num = parseInt(m[1]);
		}
		const query = {
			btp_id,
			name,
			num,
			location_id,
			tournament_key,
		};

		app.db.courts.findOne(query, async (err, cur_court) => {
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
				location_id,
				is_active : true,
				has_umpire: true,
				has_service_judge: true,
			};

			res.set(btp_id, court._id);
			app.db.courts.findOne(alt_query, (err, cur_court) => {
				if (err) return cb(err);

				if (cur_court) {
					// Add BTP ID
					app.db.courts.update(alt_query, { $set: { btp_id, location_id } }, {}, (err) => cb(err));
					return;
				}

				changed = true;
				app.db.courts.insert(court, (err) => cb(err));
			});
		});
	}, (err) => {
		if (err) {
			return callback(err);
		}

		if (changed) {
			stournament.get_courts(app.db, tournament_key, function (err, all_courts) {
				admin.notify_change(app, tournament_key, 'courts_changed', { all_courts });
				callback(err, scoring_formats, location_map, res);
			});
		} else {
			callback(err, scoring_formats, location_map, res);
		}
	});
}

function integrate_btp_settings(app, tkey, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle

	app.db.tournaments.findOne({ key: tkey }, (err, tournament) => {
		if (err) return callback(err);
		var toChange = {};
		var changed = false;
		if (!tournament.btp_settings) {
			tournament.btp_settings = {};
			changed = true;
		}

		const tournament_name = btp_state.btp_settings.get(1001).Value[0];
		const tournament_urn = btp_state.btp_settings.get(1008).Value[0];
		const check_in_per_match = btp_state.btp_settings.get(1003).Value[0] ? false : true;
		const pause_duration_ms = btp_state.btp_settings.get(1303).Value[0] * 60 * 1000;

		if (tournament.btp_settings.tournament_name != tournament_name) {
			tournament.btp_settings.tournament_name = tournament_name;
			changed = true;
			toChange.btp_settings = tournament.btp_settings;
			toChange.name = tournament_name;
		}
		if (tournament.btp_settings.tournament_urn != tournament_urn) {
			tournament.btp_settings.tournament_urn = tournament_urn;
			changed = true;
			toChange.btp_settings = tournament.btp_settings;
		}
		if (tournament.btp_settings.check_in_per_match != check_in_per_match) {
			tournament.btp_settings.check_in_per_match = check_in_per_match;
			changed = true;
			toChange.btp_settings = tournament.btp_settings;
		}
		if (tournament.btp_settings.pause_duration_ms != pause_duration_ms) {
			tournament.btp_settings.pause_duration_ms = pause_duration_ms;
			changed = true;
			toChange.btp_settings = tournament.btp_settings;
		}

		if (changed) {
			app.db.tournaments.update({ key: tkey }, { $set: toChange }, {}, (err) => {
				if (err) {
					return callback(err);
				}
				admin.notify_change(app, tkey, 'update_btp_settings', {btp_settings: toChange.btp_settings});
				return callback(null);
			});
		} else {
			return callback(null);
		}
	});
}

function buildScoringFormatMap(formats) {
  const map = new Map();
  for (const f of formats) {
    map.set(Number(f.id), f);
  }
  return map;
}

function setTypeToEndMax(setType, score) {
	const t = Number(setType);
	switch (t) {
		case 0: return { end_points: 21, max_points: 30, end_points_editable: false, max_points_editable: false };
		case 301: return { end_points: 11, max_points: 11, end_points_editable: false, max_points_editable: false };
		case 304: return { end_points: 11, max_points: 15, end_points_editable: false, max_points_editable: false };
		case 305: return { end_points: 11, max_points: 13, end_points_editable: false, max_points_editable: false };
		case 306: return { end_points: 15, max_points: 21, end_points_editable: false, max_points_editable: false };
		case 1000:
			return {
				end_points: null,
				max_points: null,
				end_points_editable: true,
				max_points_editable: true,
			};
		case 999: {
			const s = Number(score);
			const fallback = Number.isFinite(s) && s > 0 ? s : null;
			return {
				end_points: fallback,
				max_points: fallback,
				end_points_editable: false,
				max_points_editable: true,
				defaults_from_score: true,
			};
		}
		default:
			return {
				end_points: null,
				max_points: null,
				end_points_editable: false,
				max_points_editable: false,
				raw: t,
			};
	}
}

function inferSetTiming(name, numSets, setType, isLastSet) {
	const normalizedName = String(name || '');
	const t = Number(setType);
	const singleSet = Number(numSets) === 1;

	function elevenSetTiming() {
		if (singleSet || isLastSet) {
			return {
				interval_at: 6,
				interval_duration_ms: normalizedName.includes('^90') ? 90000 : 60000,
			};
		}
		return {
			interval_at: null,
			interval_duration_ms: null,
		};
	}

	let timing;
	switch (t) {
		case 0:
			timing = {
				interval_at: 11,
				interval_duration_ms: 60000,
			};
			break;
		case 301:
		case 304:
		case 305:
			timing = elevenSetTiming();
			break;
		case 306:
			timing = {
				interval_at: 8,
				interval_duration_ms: 60000,
			};
			break;
		default:
			timing = {
				interval_at: null,
				interval_duration_ms: null,
			};
			break;
	}

	let breakBeforeSetDurationMs = null;
	if (!singleSet) {
		if (normalizedName.includes('2x21+11') && isLastSet) {
			breakBeforeSetDurationMs = 120000;
		} else if (normalizedName.includes('^90')) {
			breakBeforeSetDurationMs = 90000;
		} else if (
			normalizedName.includes('~NLA') ||
			t === 0 ||
			t === 306
		) {
			breakBeforeSetDurationMs = 120000;
		} else if (t === 301 || t === 304 || t === 305) {
			breakBeforeSetDurationMs = 60000;
		}
	}

	return {
		...timing,
		break_before_set_duration_ms: breakBeforeSetDurationMs,
	};
}

function applyDefaultSetTiming(setPoints) {
	const merged = {
		...setPoints,
	};
	const endPoints = Number(merged.end_points);
	if (merged.interval_at == null && Number.isFinite(endPoints) && endPoints > 0) {
		merged.interval_at = Math.ceil(endPoints / 2);
	}
	if (merged.interval_duration_ms == null) {
		merged.interval_duration_ms = 60000;
	}
	if (merged.break_before_set_duration_ms == null) {
		merged.break_before_set_duration_ms = 120000;
	}
	return merged;
}

function sanitizeSetPoints(setPoints) {
	const merged = applyDefaultSetTiming(setPoints);
	let endPoints = Number(merged.end_points);
	if (!Number.isFinite(endPoints) || endPoints < 1) {
		endPoints = 1;
	}
	let maxPoints = Number(merged.max_points);
	if (!Number.isFinite(maxPoints) || maxPoints < endPoints) {
		maxPoints = endPoints;
	}
	merged.end_points = endPoints;
	merged.max_points = maxPoints;
	if (merged.interval_at == null) {
		merged.interval_at = Math.ceil(endPoints / 2);
	}
	return merged;
}

function sanitizeScoringFormat(scoringFormat) {
	if (!scoringFormat) {
		return scoringFormat;
	}
	return {
		...scoringFormat,
		set_points: sanitizeSetPoints(scoringFormat.set_points || {}),
		last_set_points: sanitizeSetPoints(scoringFormat.last_set_points || {}),
	};
}

function normalizeScoringFormat(sf, unwrap = (v) => (Array.isArray(v) && v.length === 1 ? v[0] : v)) {
	const id = Number(unwrap(sf.ID));
	const name = String(unwrap(sf.Name));
	const numSets = Number(unwrap(sf.NumSets));
	const setType = Number(unwrap(sf.SetType));
	const lastSetType = Number(unwrap(sf.LastSetType));
	const score = Number(unwrap(sf.Score));
	const isDefault = Boolean(unwrap(sf.IsDefault));

	return sanitizeScoringFormat({
		id,
		name,
		numSets,
		score,
		isDefault,
		setType,
		lastSetType,
		set_points: applyDefaultSetTiming({
			...setTypeToEndMax(setType, score),
			...inferSetTiming(name, numSets, setType, false),
		}),
		last_set_points: applyDefaultSetTiming({
			...setTypeToEndMax(lastSetType, score),
			...inferSetTiming(name, numSets, lastSetType, true),
		}),
	});
}

function fallbackScoringFormat() {
	const scoringFormat = normalizeScoringFormat({
		ID: [0],
		Name: ['3x21'],
		NumSets: ['3'],
		SetType: ['0'],
		LastSetType: ['0'],
		Score: ['21'],
		IsDefault: [false],
	});
	scoringFormat.id = null;
	return scoringFormat;
}

function mergeLocalSetPoints(existingSetPoints, normalizedSetPoints) {
	const merged = {
		...normalizedSetPoints,
	};
	if (!existingSetPoints) {
		return merged;
	}

	if (normalizedSetPoints.end_points_editable) {
		merged.end_points = existingSetPoints.end_points ?? merged.end_points;
	}
	if (normalizedSetPoints.max_points_editable) {
		merged.max_points = existingSetPoints.max_points ?? merged.max_points;
	}

	merged.interval_at = existingSetPoints.interval_at ?? merged.interval_at;
	merged.interval_duration_ms = existingSetPoints.interval_duration_ms ?? merged.interval_duration_ms;
	merged.break_before_set_duration_ms = existingSetPoints.break_before_set_duration_ms ?? merged.break_before_set_duration_ms;
	if (existingSetPoints.interval_enabled !== undefined) {
		merged.interval_enabled = existingSetPoints.interval_enabled;
	}

	return merged;
}

function mergeLocalScoringFormat(existingFormat, normalizedFormat) {
	if (!existingFormat) {
		return sanitizeScoringFormat(normalizedFormat);
	}
	return sanitizeScoringFormat({
		...normalizedFormat,
		set_points: mergeLocalSetPoints(existingFormat.set_points, normalizedFormat.set_points),
		last_set_points: mergeLocalSetPoints(existingFormat.last_set_points, normalizedFormat.last_set_points),
	});
}

function integrate_btp_scoring_formats(app, tkey, btp_state, callback) {
  const admin = require("./admin"); // avoid dependency cycle

  const unwrap = (v) => (Array.isArray(v) && v.length === 1 ? v[0] : v);

  const deepEqualJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  app.db.tournaments.findOne({ key: tkey }, (err, tournament) => {
    if (err) return callback(err);
    if (!tournament) return callback(new Error(`Tournament not found for key: ${tkey}`));

    if (!tournament.scoring_formats) tournament.scoring_formats = {};

    if (!btp_state?.scoring_formats || !(btp_state.scoring_formats instanceof Map)) {
      return callback(new Error("btp_state.scoring_formats is missing or not a Map"));
    }

    const existingFormatsById = new Map(
      (((tournament.scoring_formats || {}).formats) || []).map(f => [Number(f.id), f])
    );

    const formats = Array.from(btp_state.scoring_formats.values())
      .map(sf => normalizeScoringFormat(sf, unwrap))
      .map(sf => mergeLocalScoringFormat(existingFormatsById.get(Number(sf.id)), sf))
      .sort((a, b) => a.id - b.id);

    const defaultFormat = formats.find(f => f.isDefault) || null;

    const scoringFormatsPayload = {
      formats,
      default_id: defaultFormat ? defaultFormat.id : null,
    };

    const scoringFormatMap = buildScoringFormatMap(formats);

    const existing = tournament.scoring_formats || null;

    // No change
    if (deepEqualJson(existing, scoringFormatsPayload)) {
      return callback(null, scoringFormatMap);
    }

    tournament.scoring_formats = scoringFormatsPayload;

    app.db.tournaments.update(
      { key: tkey },
      { $set: { scoring_formats: tournament.scoring_formats } },
      {},
      (err) => {
        if (err) return callback(err);

        admin.notify_change(app, tkey, "update_btp_scoring_formats", {
          scoring_formats: scoringFormatsPayload,
        });

        return callback(null, scoringFormatMap);
      }
    );
  });
}

function integrate_events(app, tkey, btp_state, callback) {
	const admin = require("./admin"); // avoid dependency cycle

	const unwrap = (v) => (Array.isArray(v) && v.length === 1 ? v[0] : v);
	const deepEqualJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

	if (!btp_state || !(btp_state.events instanceof Map) || !(btp_state.stages instanceof Map)) {
		return callback(new Error("btp_state.events/stages missing or not a Map"));
	}

	function normalizeEvent(ev) {
		return {
		id: Number(unwrap(ev.ID)),
		name: String(unwrap(ev.Name)),
		game_type_id: Number(unwrap(ev.GameTypeID)),
		gender_id: Number(unwrap(ev.GenderID)),
		min_age: Number(unwrap(ev.MinAge)),
		max_age: Number(unwrap(ev.MaxAge)),
		fee: Number(unwrap(ev.Fee)),
		separate_seeding: Boolean(unwrap(ev.SeparateSeeding)),
		allow_online_entry: Boolean(unwrap(ev.AllowOnlineEntry)),
		grading_id: Number(unwrap(ev.GradingID)),
		sub_grading_id: Number(unwrap(ev.SubGradingID)),
		sub_grading2_id: Number(unwrap(ev.SubGrading2ID)),
		};
	}

	function normalizeStage(st) {
		return {
			id: Number(unwrap(st.ID)),
			name: String(unwrap(st.Name)),
			event_id: Number(unwrap(st.EventID)),
			stage_type: Number(unwrap(st.StageType)),
			display_order: Number(unwrap(st.DisplayOrder)),
			scoring_format: st.ScoringFormat !== undefined ? Number(unwrap(st.ScoringFormat)) : null,
		};
	}

	// Build normalized payload:
	// events: [{... , stages:[...]}] for convenient GUI + lookups
	const eventsArr = Array.from(btp_state.events.values())
		.map(normalizeEvent)
		.sort((a, b) => a.id - b.id);

	const stagesArr = Array.from(btp_state.stages.values())
		.map(normalizeStage)
		.sort((a, b) => a.id - b.id);

	const stagesByEventId = new Map();
	for (const st of stagesArr) {
		if (!stagesByEventId.has(st.event_id)) stagesByEventId.set(st.event_id, []);
		stagesByEventId.get(st.event_id).push(st);
	}

	// Keep stages sorted by display_order then id for stability
	for (const [eventId, list] of stagesByEventId.entries()) {
		list.sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id));
	}

	const payload = {
		events: eventsArr.map((ev) => ({
		...ev,
		stages: stagesByEventId.get(ev.id) || [],
		})),
		// optional: keep a flat list too, if you prefer later
		// stages: stagesArr,
	};

	app.db.tournaments.findOne({ key: tkey }, (err, tournament) => {
		if (err) return callback(err);
		if (!tournament) return callback(new Error(`Tournament not found for key: ${tkey}`));

		if (!tournament.events) tournament.events = {};

		const existing = tournament.events || null;
		if (deepEqualJson(existing, payload)) {
			return callback(null);
		}

		tournament.events = payload;

		const toChange = { events: tournament.events };

		app.db.tournaments.update({ key: tkey }, { $set: toChange }, {}, (err) => {
			if (err) return callback(err);

			admin.notify_change(app, tkey, "update_btp_events", {
				events: payload,
			});

			return callback(null);
		});
	});
}


async function integrate_player_state(app, tkey, btp_state, callback) {
	const btp_manager = require('./btp_manager');
	app.db.tournaments.findOne({ key: tkey }, (err, tournament) => {
		if (err) return callback(err);

		if (!tournament.btp_settings.check_in_per_match) {
			let ids_to_change = [];
			let players_to_change = [];
			async.eachOfSeries(btp_state.matches, async (match, key) => {
				let cur_match = await get_match_form_db(app, tkey, btp_state, match);
				if (cur_match && cur_match != null) {
					for (let team_nr = 0; team_nr < cur_match.setup.teams.length; team_nr++) {
						for (let player_nr = 0; player_nr < cur_match.setup.teams[team_nr].players.length; player_nr++) {
							let id = pause_is_done(match, team_nr, player_nr, tournament.btp_settings);

							if (id != undefined && id != null) {

								if (!cur_match.setup.teams[team_nr].players[player_nr].now_tablet_on_court &&
									!cur_match.setup.teams[team_nr].players[player_nr].now_playing_on_court &&
									!cur_match.setup.called_timestamp &&
									!cur_match.network_score) {

									btp_state.matches[key].bts_players[team_nr][player_nr].CheckedIn[0] = true;


									const player = cur_match.setup.teams[team_nr].players[player_nr];
									if (ids_to_change.indexOf(id) == -1) {
										player.checked_in = true;
										player.check_in_per_match = false;
										player.tablet_break_active = false;
										ids_to_change.push(id);
										players_to_change.push(player);
									}
								}
							}
						}
					}
				}
			}, (err) => {
				if (err) return callback(err);
				btp_manager.update_players(app, tkey, players_to_change);
				return callback(null);
			});
		}
		else {
			return callback(null);
		}

	});
}

async function get_match_form_db(app, tkey, btp_state, match) {
	return new Promise((resolve, reject) => {
		const { draws, events } = btp_state;
		const btp_id = calculate_btp_match_id(tkey, match, draws, events);

		const query = {
			btp_id: btp_id,
			tournament_key: tkey,
		};

		app.db.matches.findOne(query, (err, cur_match) => {
			if (err) {
				console.log(err);
				return reject(err);
			};

			if (cur_match) {
				return resolve(cur_match);
			} else {
				return resolve(null);
			}
		});
	});
}

function pause_is_done(match, team_nr, player_nr, btp_settings) {
	if (match.bts_players && match.bts_players.length > team_nr) {
		if (match.bts_players[team_nr] && match.bts_players[team_nr].length > player_nr) {
			const player = match.bts_players[team_nr][player_nr];

			if (player.CheckedIn[0]) {
				return;
			}

			if (player.LastTimeOnCourt && player.LastTimeOnCourt[0]) {
				const date = new Date(player.LastTimeOnCourt[0].year,
					player.LastTimeOnCourt[0].month - 1,
					player.LastTimeOnCourt[0].day,
					player.LastTimeOnCourt[0].hour,
					player.LastTimeOnCourt[0].minute,
					player.LastTimeOnCourt[0].second,
					player.LastTimeOnCourt[0].ms);
				const last_time_on_court_ts = date.getTime();
				const now = new Date();

				if ((now - last_time_on_court_ts) > btp_settings.pause_duration_ms) {
					return player.ID[0];
				}
				return;
			} else {
				return player.ID[0];
			}
		}
	}
	return;
}

function buildOfficialReferenceState(matches) {
	const referenced_ids = new Set();
	const referenced_btp_ids = new Set();
	const planned_umpire_ids = new Set();
	const planned_umpire_btp_ids = new Set();
	const planned_service_judge_ids = new Set();
	const planned_service_judge_btp_ids = new Set();
	const on_court_umpire_ids = new Set();
	const on_court_umpire_btp_ids = new Set();
	const on_court_service_judge_ids = new Set();
	const on_court_service_judge_btp_ids = new Set();

	(matches || []).forEach((match) => {
		const setup = match.setup || {};
		const is_finished = typeof match.team1_won === 'boolean' || match.btp_winner || match.btp_needsync;
		const is_on_court = setup.now_on_court === true;
		const is_planned = !is_finished && !is_on_court && !!setup.state;

		const addRef = (official, idSet, btpSet) => {
			if (!official) return;
			if (official._id) idSet.add(String(official._id));
			if (official.btp_id != null) btpSet.add(String(official.btp_id));
		};

		if (!is_finished) {
			[setup.umpire, setup.service_judge].forEach((official) => {
				addRef(official, referenced_ids, referenced_btp_ids);
			});
		}

		if (is_on_court) {
			addRef(setup.umpire, on_court_umpire_ids, on_court_umpire_btp_ids);
			addRef(setup.service_judge, on_court_service_judge_ids, on_court_service_judge_btp_ids);
		} else if (is_planned) {
			addRef(setup.umpire, planned_umpire_ids, planned_umpire_btp_ids);
			addRef(setup.service_judge, planned_service_judge_ids, planned_service_judge_btp_ids);
		}
	});

	return {
		referenced_ids,
		referenced_btp_ids,
		planned_umpire_ids,
		planned_umpire_btp_ids,
		planned_service_judge_ids,
		planned_service_judge_btp_ids,
		on_court_umpire_ids,
		on_court_umpire_btp_ids,
		on_court_service_judge_ids,
		on_court_service_judge_btp_ids,
	};
}

function computeOfficialVisibilityPatch(official, refState, tournament = null) {
	const hasId = (set) => set.has(String(official._id));
	const hasBtpId = (set) => official.btp_id != null && set.has(String(official.btp_id));
	const inSet = (ids, btpIds) => hasId(ids) || hasBtpId(btpIds);

	const in_active_list =
		official.umpire_wait != null ||
		official.service_judge_wait != null ||
		official.umpire_pause != null ||
		official.service_judge_pause != null ||
		official.umpire_manual_pause != null ||
		official.service_judge_manual_pause != null;
	const referenced_somewhere = inSet(refState.referenced_ids, refState.referenced_btp_ids);
	const should_be_planned_as_umpire = inSet(refState.planned_umpire_ids, refState.planned_umpire_btp_ids);
	const should_be_planned_as_service_judge = inSet(refState.planned_service_judge_ids, refState.planned_service_judge_btp_ids);
	const should_be_umpire_on_court = inSet(refState.on_court_umpire_ids, refState.on_court_umpire_btp_ids);
	const should_be_service_judge_on_court = inSet(refState.on_court_service_judge_ids, refState.on_court_service_judge_btp_ids);

	const setObj = {};
	if (!!official.is_planed_as_umpire !== should_be_planned_as_umpire) {
		setObj.is_planed_as_umpire = should_be_planned_as_umpire;
	}
	if (!!official.is_planed_as_service_judge !== should_be_planned_as_service_judge) {
		setObj.is_planed_as_service_judge = should_be_planned_as_service_judge;
	}
	if ((official.umpire_on_court != null) !== should_be_umpire_on_court) {
		setObj.umpire_on_court = should_be_umpire_on_court ? (official.umpire_on_court || true) : null;
	}
	if ((official.service_judge_on_court != null) !== should_be_service_judge_on_court) {
		setObj.service_judge_on_court = should_be_service_judge_on_court ? (official.service_judge_on_court || true) : null;
	}

	const on_court = should_be_umpire_on_court || should_be_service_judge_on_court;
	const visible_somewhere = in_active_list || on_court || referenced_somewhere;
	if (!visible_somewhere) {
		const now = Date.now();
		const reactivated_wait_ts = Math.floor(now / 10);
		let preferred_role = null;
		if (official.umpire_wait != null || official.umpire_pause != null || official.umpire_manual_pause != null || official.is_planed_as_umpire || official.umpire_on_court != null) {
			preferred_role = 'umpire';
		} else if (official.service_judge_wait != null || official.service_judge_pause != null || official.service_judge_manual_pause != null || official.is_planed_as_service_judge || official.service_judge_on_court != null) {
			preferred_role = 'service_judge';
		} else if (official.is_umpire === true && official.is_service_judge !== true) {
			preferred_role = 'umpire';
		} else if (official.is_service_judge === true && official.is_umpire !== true) {
			preferred_role = 'service_judge';
		} else if (official.is_umpire === true && official.is_service_judge === true) {
			preferred_role = 'umpire';
		}

		if (preferred_role === 'umpire') {
			setObj.umpire_wait = official.umpire_wait != null ? official.umpire_wait : reactivated_wait_ts;
			setObj.service_judge_wait = null;
		} else if (preferred_role === 'service_judge') {
			setObj.service_judge_wait = official.service_judge_wait != null ? official.service_judge_wait : reactivated_wait_ts;
			setObj.umpire_wait = null;
		}
		if (official.is_umpire !== true && official.is_service_judge !== true && official.inactive_list == null) {
			setObj.inactive_list = now;
		} else {
			setObj.inactive_list = null;
		}
		if (setObj.is_planed_as_umpire === undefined) setObj.is_planed_as_umpire = false;
		if (setObj.is_planed_as_service_judge === undefined) setObj.is_planed_as_service_judge = false;
		if (setObj.umpire_on_court === undefined) setObj.umpire_on_court = null;
		if (setObj.service_judge_on_court === undefined) setObj.service_judge_on_court = null;
	}

	const next_checked_in = match_utils.get_effective_technical_official_checked_in({ ...official, ...setObj }, tournament);
	if (!!official.checked_in !== next_checked_in) {
		setObj.checked_in = next_checked_in;
	}

	return setObj;
}

function findExistingOfficialForBtpImport(officials, tournament_key, btp_id) {
	const canonical_id = `${tournament_key}_btp_${btp_id}`;
	return (officials || []).find((official) =>
		official &&
		official.tournament_key === tournament_key &&
		(
			(official.btp_id != null && String(official.btp_id) === String(btp_id)) ||
			String(official._id) === canonical_id
		)
	) || null;
}

function integrate_umpires(app, tournament_key, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const officials = Array.from(btp_state.officials.values());
	var changed = false;

	app.db.umpires.find({ tournament_key }, (err, existingOfficials) => {
		if (err) return callback(err);
	async.each(officials, (o, cb) => {
		const firstname = (o.FirstName ? o.FirstName[0] : '');
		const surname = (o.Name ? o.Name[0] : '');
		const name = (firstname + " " + surname).trim();
		const country = (o.Country ? o.Country[0] : '');
		const btp_id = o.ID[0];
		if (!btp_id) {
			return cb();
		}
		

		const cur = findExistingOfficialForBtpImport(existingOfficials, tournament_key, btp_id);



			if (cur) {

				const allListsNull =    !cur.is_planed_as_umpire &&
										!cur.is_planed_as_service_judge && 
			    						cur.umpire_on_court == null &&
										cur.service_judge_on_court == null &&
										cur.umpire_wait == null &&
										cur.service_judge_wait == null &&
										cur.umpire_pause == null &&
										cur.service_judge_pause == null &&
										cur.umpire_manual_pause == null &&
										cur.service_judge_manual_pause == null &&
										cur.inactive_list == null;


				if (cur.btp_id === btp_id &&
					cur.firstname == firstname &&
					cur.surname == surname &&
					cur.country === country &&
					!allListsNull) {
					return cb();
				} else {
					const inactive_list = allListsNull ? Date.now() : null;
					app.db.umpires.update({ _id: cur._id, tournament_key }, { $set: { btp_id, firstname, surname, name, country, inactive_list} }, { returnUpdatedDocs: true }, function (err, numAffected, changed_umpire) {
						if (err) {
							console.error(err);
							return cb(err);
						}
						const idx = existingOfficials.findIndex((official) => official && official._id === changed_umpire._id);
						if (idx >= 0) {
							existingOfficials[idx] = changed_umpire;
						} else {
							existingOfficials.push(changed_umpire);
						}
						const admin = require('./admin');
						admin.notify_change(app, tournament_key, 'umpire_updated', changed_umpire);
					});
					return cb();
				}
			}

			const u = {
				_id: tournament_key + '_btp_' + btp_id,
				btp_id,
				firstname,
				surname,
				name,
				status: 'ready',
				tournament_key,
				country,
				is_umpire: true,
				is_service_judge: true,
				is_planed_as_umpire: false,
				is_planed_as_service_judge: false,
				umpire_on_court: null,
				service_judge_on_court: null,
				umpire_wait: null,
				service_judge_wait: null,
				umpire_pause: null,
				service_judge_pause: null,
				umpire_manual_pause: null,
				service_judge_manual_pause: null,
				inactive_list: Date.now()
			};
			changed = true;
			app.db.umpires.insert(u, function (err, inserted_umpire) {
				if (err) {
					return cb(err);
				}
				existingOfficials.push(inserted_umpire);
				admin.notify_change(app, tournament_key, 'umpire_add', { umpire: inserted_umpire });
				return cb();
			});
	}, err => {
		if (changed) {
			stournament.get_umpires(app.db, tournament_key, function (err, all_umpires) {
				if (!err) {
					admin.notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
				}
				callback(err);
			});
		} else {
			callback(err);
		}
	});
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



function update_umpire(app, tkey, umpire, status, last_time_on_court_ts,court_id) {
	app.db.umpires.update({ tournament_key: tkey, name: umpire.name }, { $set: { last_time_on_court_ts: last_time_on_court_ts, status: status, court_id: court_id } }, { returnUpdatedDocs: true }, function (err, numAffected, changed_umpire) {
		if (err) {
			console.error(err);
			return;
		}
		const admin = require('./admin');
		admin.notify_change(app, tkey, 'umpire_updated', changed_umpire);
	});
}

function normalize_official_visibility(app, tournament_key, callback) {
	const admin = require('./admin');
	const stournament = require('./stournament');

	app.db.tournaments.findOne({ key: tournament_key }, (tournamentErr, tournament) => {
		if (tournamentErr) {
			return callback(tournamentErr);
		}
	app.db.matches.find({ tournament_key }, (matchErr, matches) => {
		if (matchErr) {
			return callback(matchErr);
		}

		const refState = buildOfficialReferenceState(matches);

		app.db.umpires.find({ tournament_key }, (err, officials) => {
			if (err) {
				return callback(err);
			}

			let changed = false;
			async.eachSeries(officials, (official, cb) => {
				const setObj = computeOfficialVisibilityPatch(official, refState, tournament);
				if (Object.keys(setObj).length === 0) {
					return cb();
				}

				app.db.umpires.update(
					{ _id: official._id, tournament_key },
					{ $set: setObj },
					{ returnUpdatedDocs: true },
					(updateErr, numAffected, changed_umpire) => {
						if (updateErr) {
							return cb(updateErr);
						}
						if (changed_umpire) {
							changed = true;
							admin.notify_change(app, tournament_key, 'umpire_updated', changed_umpire);
						}
						cb();
					}
				);
			}, (eachErr) => {
				if (eachErr) {
					return callback(eachErr);
				}
				if (!changed) {
					return callback(null);
				}
				stournament.get_umpires(app.db, tournament_key, function (getErr, all_umpires) {
					if (!getErr) {
						admin.notify_change(app, tournament_key, 'umpires_changed', { all_umpires });
					}
					callback(getErr);
				});
			});
		});
	});
	});
}

async function integrate_now_on_court(app, tkey, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const btp_manager = require('./btp_manager');
	const bupws = require('./bupws');
	const match_utils = require('./match_utils');

	function matchHasPlayerOnCourtFlags(match) {
		if (!match || !match.setup || !match.setup.teams) {
			return false;
		}
		return match.setup.teams.some(team =>
			team.players && team.players.some(player => player.now_playing_on_court || player.now_tablet_on_court)
		);
	}

	function collectActivePlayerIds(matches) {
		const activeIds = new Set();
		matches.forEach(match => {
			if (!match || !match.setup || !match.setup.teams) {
				return;
			}
			match.setup.teams.forEach(team => {
				if (!team.players) {
					return;
				}
				team.players.forEach(player => {
					if (player && player.btp_id) {
						activeIds.add(player.btp_id);
					}
				});
			});
			if (match.setup.tabletoperators) {
				match.setup.tabletoperators.forEach(player => {
					if (player && player.btp_id) {
						activeIds.add(player.btp_id);
					}
				});
			}
		});
		return activeIds;
	}

	function matchHasOnlyStalePlayerFlags(match, activePlayerIds) {
		if (!match || !match.setup || !match.setup.teams) {
			return false;
		}
		return match.setup.teams.some(team =>
			team.players && team.players.some(player =>
				(player.now_playing_on_court || player.now_tablet_on_court) &&
				(!player.btp_id || !activePlayerIds.has(player.btp_id))
			)
		);
	}

	function setPlayerStateForMatch(match) {
		return new Promise((resolve, reject) => {
			match_utils.set_player_on_court(app, tkey, match.setup, (err) => {
				if (err) return reject(err);
				match_utils.set_player_on_tablet(app, tkey, match.setup, (err) => {
					if (err) return reject(err);
					resolve(null);
				});
			});
		});
	}

	function clearPlayerStateForMatch(match) {
		const endTs = match.end_ts || Date.now();
		return new Promise((resolve, reject) => {
			match_utils.remove_player_on_court(app, tkey, match._id, endTs, (err) => {
				if (err) return reject(err);
				match_utils.remove_tablet_on_court(app, tkey, match._id, endTs, (err) => {
					if (err) return reject(err);
					resolve(null);
				});
			});
		});
	}

	// TODO after switching to async, this should happen during court&match construction
	app.db.tournaments.findOne({ key: tkey }, async (err, tournament) => {
		if (err) {
			return callback(err);
		}
		assert(tournament);
		
		app.db.matches.find({ tournament_key: tkey, 'setup.now_on_court': true }, async (err, now_on_court_matches) => {
			if (err) return callback(err);

			const activeMatches = now_on_court_matches.filter(match => typeof match.team1_won !== 'boolean');
			await Promise.all(activeMatches.map(async (match) => {

				const court_id = match.setup.court_id;
				const match_id = match._id;
				
				if (!court_id || !match_id) {
					return; // TODO in async we would assert both to be true
				}

				const setup = match.setup;
				if(!setup.called_timestamp) {
					match_utils.call_match(app, tournament, match, undefined, (err) => {
						if (err) console.log(err);
					});
				} else {
					const query = {
						tournament_key: tkey,
						_id: court_id,
					};
					app.db.courts.update(query, {$set: {match_id}});
				}
				await setPlayerStateForMatch(match);
			}));

				app.db.matches.find({ tournament_key: tkey }, async (err, matches) => {
					if (err) return callback(err);

					app.db.matches.find({ tournament_key: tkey, 'setup.now_on_court': true }, async (err, refreshed_on_court_matches) => {
						if (err) return callback(err);

						const refreshedActiveMatches = refreshed_on_court_matches.filter(match => typeof match.team1_won !== 'boolean');
						const activePlayerIds = collectActivePlayerIds(refreshedActiveMatches);
						const staleMatches = matches.filter(match =>
							match &&
							match.setup &&
							match.setup.now_on_court !== true &&
							matchHasPlayerOnCourtFlags(match) &&
							matchHasOnlyStalePlayerFlags(match, activePlayerIds)
						);

						await Promise.all(staleMatches.map(match => clearPlayerStateForMatch(match)));
						callback(null);
					});
				});
			});
		});
	// TODO clear courts (better in async)
}


async function sync_btp_data(app, tkey, response) {
	return new Promise((resolve, reject) => {
		let btp_state;
		try {
			btp_state = btp_parse.get_btp_state(response);
		} catch (e) {
			return reject(e);
		}

		async.waterfall([
			cb => integrate_btp_settings(app, tkey, btp_state, cb),
			cb => integrate_events(app, tkey, btp_state, cb),
			cb => integrate_player_state(app, tkey, btp_state, cb),
			cb => integrate_umpires(app, tkey, btp_state, cb),
			cb => integrate_btp_scoring_formats(app, tkey, btp_state, cb),
			(scoring_formats, cb) => integrate_locations(app, tkey, btp_state, scoring_formats, cb),
			(scoring_formats, location_map, cb) => integrate_courts(app, tkey, btp_state, scoring_formats, location_map, cb),
			(scoring_formats, location_map, court_map, cb) => integrate_matches(app, tkey, btp_state, scoring_formats, location_map, court_map, cb),
			cb => reconcile_match_officials(app, tkey, cb),
			cb => normalize_official_visibility(app, tkey, cb),
			cb => integrate_now_on_court(app, tkey, cb),
			cb => cleanup_entities(app, tkey, btp_state, cb),
		], (err) => {
			if (err) {
				return reject(err);
			} else {
				return resolve(true);
			}
		});
	});
}

module.exports = {
	calculate_match_ids_on_court,
	craft_match,
	date_str,
	sync_btp_data,
	time_str,
	// test only
	_integrate_umpires: integrate_umpires,
	_fallback_scoring_format: fallbackScoringFormat,
	_normalize_scoring_format: normalizeScoringFormat,
	_merge_local_scoring_format: mergeLocalScoringFormat,
	_build_official_reference_state: buildOfficialReferenceState,
	_compute_official_visibility_patch: computeOfficialVisibilityPatch,
	_find_existing_official_for_btp_import: findExistingOfficialForBtpImport,
	_reconcile_match_officials: reconcile_match_officials,
	_merge_local_match_into_btp_match: mergeLocalMatchIntoBtpMatch,
	_sanitize_scoring_format: sanitizeScoringFormat,
	_resolve_btp_dependency_link,
	_set_type_to_end_max: setTypeToEndMax,
};
