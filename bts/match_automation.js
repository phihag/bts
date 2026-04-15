'use strict';

const match_scoring = require('../static/js/match_scoring');
const DEFAULT_PREPARATION_SUCCESSOR_RALLY_COUNT = 11;
const DEFAULT_NOW_FN = () => Date.now();

function fallback_scoring_format() {
	return {
		numSets: 3,
		set_points: {
			end_points: 21,
			max_points: 30,
		},
		last_set_points: {
			end_points: 21,
			max_points: 30,
		},
	};
}

function normalize_scoring_format(scoring_format) {
	const format = scoring_format || fallback_scoring_format();
	const fallback = fallback_scoring_format();
	return {
		numSets: Number.isFinite(format.numSets) && format.numSets > 0 ? format.numSets : fallback.numSets,
		set_points: {
			end_points: Number.isFinite(format?.set_points?.end_points) ? format.set_points.end_points : fallback.set_points.end_points,
			max_points: Number.isFinite(format?.set_points?.max_points) ? format.set_points.max_points : fallback.set_points.max_points,
		},
		last_set_points: {
			end_points: Number.isFinite(format?.last_set_points?.end_points) ? format.last_set_points.end_points : fallback.last_set_points.end_points,
			max_points: Number.isFinite(format?.last_set_points?.max_points) ? format.last_set_points.max_points : fallback.last_set_points.max_points,
		},
	};
}

function sets_needed_to_win(scoring_format) {
	const format = normalize_scoring_format(scoring_format);
	return Math.floor(format.numSets / 2) + 1;
}

function get_set_points(scoring_format, set_index) {
	const format = normalize_scoring_format(scoring_format);
	const use_last_set_points = set_index === (format.numSets - 1);
	return use_last_set_points ? format.last_set_points : format.set_points;
}

function normalize_score_pair(score_pair) {
	if (!Array.isArray(score_pair) || score_pair.length < 2) {
		return null;
	}
	const score_a = Number(score_pair[0]);
	const score_b = Number(score_pair[1]);
	if (!Number.isFinite(score_a) || !Number.isFinite(score_b)) {
		return null;
	}
	return [score_a, score_b];
}

function get_current_match_state(match, scoring_format) {
	if (!match || !Array.isArray(match.network_score) || match.network_score.length === 0) {
		return null;
	}

	let wins_a = 0;
	let wins_b = 0;
	let current_set_score = null;
	let current_set_index = 0;

	for (let idx = 0; idx < match.network_score.length; idx++) {
		const score = normalize_score_pair(match.network_score[idx]);
		if (!score) {
			return null;
		}
		const set_points = get_set_points(scoring_format, idx);
		if (match_scoring.is_set_over(score[0], score[1], set_points)) {
			if (score[0] > score[1]) {
				wins_a += 1;
			} else if (score[1] > score[0]) {
				wins_b += 1;
			} else {
				return null;
			}
			current_set_index = idx + 1;
			current_set_score = [0, 0];
			continue;
		}

		current_set_index = idx;
		current_set_score = score;
		return {
			wins: [wins_a, wins_b],
			current_set_index,
			current_set_score,
		};
	}

	if (!current_set_score) {
		current_set_score = [0, 0];
	}

	return {
		wins: [wins_a, wins_b],
		current_set_index,
		current_set_score,
	};
}

function get_current_leader(score_pair) {
	if (!score_pair) {
		return null;
	}
	if (score_pair[0] > score_pair[1]) {
		return 0;
	}
	if (score_pair[1] > score_pair[0]) {
		return 1;
	}
	return null;
}

function rallies_needed_for_set_win(score_pair, leader, set_points) {
	for (let added = 0; added <= 100; added++) {
		const score = [...score_pair];
		score[leader] += added;
		if (match_scoring.is_set_over(score[0], score[1], set_points) && score[leader] > score[1 - leader]) {
			return added;
		}
	}
	return null;
}

function can_leader_finish_match_within_rallies(match, scoring_format, rally_count) {
	if (!match || !match.setup || !match.setup.now_on_court) {
		return false;
	}
	if (match.team1_won !== undefined && match.team1_won !== null) {
		return false;
	}
	if (!Number.isFinite(rally_count) || rally_count <= 0) {
		return false;
	}

	const state = get_current_match_state(match, scoring_format);
	if (!state) {
		return false;
	}

	const leader = get_current_leader(state.current_set_score);
	if (leader === null) {
		return false;
	}

	let remaining_rallies = rally_count;
	let wins = [...state.wins];
	let current_set_index = state.current_set_index;
	let current_set_score = [...state.current_set_score];
	const wins_needed = sets_needed_to_win(scoring_format);

	while (remaining_rallies > 0) {
		if (wins[0] >= wins_needed || wins[1] >= wins_needed) {
			return true;
		}

		const set_points = get_set_points(scoring_format, current_set_index);
		const rallies_needed = rallies_needed_for_set_win(current_set_score, leader, set_points);
		if (!Number.isFinite(rallies_needed)) {
			return false;
		}

		if (remaining_rallies < rallies_needed) {
			return false;
		}

		current_set_score[leader] += rallies_needed;
		remaining_rallies -= rallies_needed;

		if (!match_scoring.is_set_over(current_set_score[0], current_set_score[1], set_points)) {
			return false;
		}

		wins[leader] += 1;
		if (wins[leader] >= wins_needed) {
			return true;
		}

		current_set_index += 1;
		current_set_score = [0, 0];
	}

	return wins[0] >= wins_needed || wins[1] >= wins_needed;
}

function calculate_location_preparation_need(tournament, location_id) {
	const courts = Array.isArray(tournament?.courts) ? tournament.courts : [];
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const location_courts = courts.filter((court) => court && court.location_id === location_id);
	const active_location_courts = location_courts.filter((court) => court && court.is_active === true);
	const active_location_court_ids = new Set(active_location_courts.map((court) => court._id));
	const occupied_court_ids = new Set(
		matches
			.filter((match) => match && match.setup && match.setup.now_on_court === true && match.setup.court_id)
			.map((match) => match.setup.court_id)
	);

	const successor_need_count = matches.filter((match) => {
		const setup = match && match.setup;
		if (!setup || !setup.now_on_court || !setup.needs_preparation_successor) {
			return false;
		}
		return active_location_court_ids.has(setup.court_id);
	}).length;

	const free_court_count = active_location_courts.filter((court) => {
		return !occupied_court_ids.has(court._id);
	}).length;
	const active_court_count = active_location_courts.length;
	const required_preparation_count = Math.min(active_court_count, successor_need_count + free_court_count);

	return {
		location_id,
		active_court_count,
		successor_need_count,
		free_court_count,
		required_preparation_count,
	};
}

function calculate_location_preparation_status(tournament, location_id) {
	const need = calculate_location_preparation_need(tournament, location_id);
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const current_preparation_count = matches.filter((match) => {
		const setup = match && match.setup;
		return !!setup && setup.state === 'preparation' && setup.location_id === location_id;
	}).length;

	return {
		...need,
		current_preparation_count,
		missing_preparation_count: Math.max(0, need.required_preparation_count - current_preparation_count),
	};
}

function cmp_values(a, b) {
	if (a == null && b == null) return 0;
	if (a == null) return -1;
	if (b == null) return 1;
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function cmp_scheduled_match_order(m1, m2) {
	const setup1 = m1?.setup || {};
	const setup2 = m2?.setup || {};
	const time_str1 = setup1.scheduled_time_str;
	const time_str2 = setup2.scheduled_time_str;

	if (time_str1 && !time_str2) return -1;
	if (time_str2 && !time_str1) return 1;

	const date_cmp = cmp_values(setup1.scheduled_date, setup2.scheduled_date);
	if (date_cmp !== 0) return date_cmp;

	if (time_str1 === '00:00' && time_str2 === '00:00') {
		return cmp_values(setup1.match_num, setup2.match_num);
	}
	if (time_str1 === '00:00' && time_str2 !== '00:00') return 1;
	if (time_str2 === '00:00' && time_str1 !== '00:00') return -1;

	const time_cmp = cmp_values(time_str1, time_str2);
	if (time_cmp !== 0) return time_cmp;

	if (m1?.match_order !== undefined && m2?.match_order !== undefined) {
		const match_order_cmp = cmp_values(m1.match_order, m2.match_order);
		if (match_order_cmp !== 0) return match_order_cmp;
	}

	return cmp_values(setup1.match_num, setup2.match_num);
}

function get_courts_by_id(tournament) {
	const map = new Map();
	const courts = Array.isArray(tournament?.courts) ? tournament.courts : [];
	courts.forEach((court) => {
		if (court && court._id) {
			map.set(court._id, court);
		}
	});
	return map;
}

function match_matches_location(match, location_id, courts_by_id) {
	const setup = match?.setup || {};
	if (setup.location_id != null) {
		return setup.location_id === location_id;
	}
	if (setup.court_id != null) {
		const court = courts_by_id.get(setup.court_id);
		if (!court) {
			return true;
		}
		return court.location_id === location_id;
	}
	return true;
}

function is_match_completely_initialized(match) {
	const teams = match?.setup?.teams;
	if (!Array.isArray(teams) || teams.length < 2) {
		return false;
	}
	return teams.every((team) => Array.isArray(team?.players) && team.players.length > 0);
}

function get_match_players(match) {
	const teams = match?.setup?.teams;
	if (!Array.isArray(teams)) {
		return [];
	}
	return teams.flatMap((team) => Array.isArray(team?.players) ? team.players : []);
}

function get_match_player_btp_ids(match) {
	return get_match_players(match)
		.map((player) => player?.btp_id)
		.filter((btp_id) => btp_id != null);
}

function is_finished_match(match) {
	const state = match?.setup?.state;
	if (state === 'finished') {
		return true;
	}
	return match?.team1_won !== undefined && match?.team1_won !== null;
}

function get_match_planning_ids(match) {
	if (!Array.isArray(match?.btp_match_ids)) {
		return [];
	}
	return match.btp_match_ids
		.map((entry) => entry?.planning)
		.filter((planning) => planning != null);
}

function build_matches_by_planning_id(tournament) {
	const map = new Map();
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	matches.forEach((match) => {
		get_match_planning_ids(match).forEach((planning_id) => {
			if (!map.has(planning_id)) {
				map.set(planning_id, []);
			}
			map.get(planning_id).push(match);
		});
	});
	return map;
}

function get_direct_predecessor_matches(match, tournament, options = {}) {
	const links = match?.setup?.links || {};
	const planning_ids = [links.from1, links.from2].filter((planning_id) => planning_id != null);
	if (planning_ids.length === 0) {
		return [];
	}

	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const predecessors = [];
	planning_ids.forEach((planning_id) => {
		const planning_matches = matches_by_planning_id.get(planning_id) || [];
		planning_matches.forEach((candidate) => {
			if (candidate && candidate._id !== match._id && !predecessors.includes(candidate)) {
				predecessors.push(candidate);
			}
		});
	});
	return predecessors;
}

function has_open_participant_dependency(match, tournament, options = {}) {
	const participants_are_complete = is_match_completely_initialized(match);
	const direct_predecessors = get_direct_predecessor_matches(match, tournament, options);
	if (!participants_are_complete && direct_predecessors.some((predecessor) => !is_finished_match(predecessor))) {
		return true;
	}
	if (!participants_are_complete && direct_predecessors.length === 0) {
		const links = match?.setup?.links || {};
		if (links.from1 != null || links.from2 != null || links.from1_link != null || links.from2_link != null) {
			return true;
		}
	}

	const current_player_ids = new Set(get_match_player_btp_ids(match));
	if (current_player_ids.size === 0) {
		return false;
	}

	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	return matches.some((other_match) => {
		if (!other_match || other_match._id === match._id) {
			return false;
		}
		if (is_finished_match(other_match)) {
			return false;
		}
		if (cmp_scheduled_match_order(other_match, match) >= 0) {
			return false;
		}
		return get_match_player_btp_ids(other_match).some((btp_id) => current_player_ids.has(btp_id));
	});
}

function get_time_limit_before_scheduled_minutes(tournament) {
	if (tournament?.preparation_call_time_limit_before_scheduled_enabled !== true) {
		return null;
	}
	const minutes = Number(tournament?.preparation_call_time_limit_before_scheduled_minutes);
	return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function get_time_limit_before_scheduled_minutes_for_prefix(tournament, prefix) {
	if (prefix === 'preparation_call') {
		return get_time_limit_before_scheduled_minutes(tournament);
	}
	if (tournament?.[`${prefix}_time_limit_before_scheduled_enabled`] !== true) {
		return null;
	}
	const minutes = Number(tournament?.[`${prefix}_time_limit_before_scheduled_minutes`]);
	return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function get_scheduled_timestamp(match) {
	const setup = match?.setup || {};
	if (!setup.scheduled_date || !setup.scheduled_time_str) {
		return null;
	}
	const timestamp = Date.parse(`${setup.scheduled_date}T${setup.scheduled_time_str}:00`);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function passes_time_limit_before_scheduled(match, tournament, now_ts = DEFAULT_NOW_FN()) {
	const limit_minutes = get_time_limit_before_scheduled_minutes(tournament);
	if (limit_minutes == null) {
		return true;
	}
	const scheduled_ts = get_scheduled_timestamp(match);
	if (!Number.isFinite(scheduled_ts)) {
		return false;
	}
	return now_ts >= (scheduled_ts - (limit_minutes * 60 * 1000));
}

function passes_time_limit_before_scheduled_for_prefix(match, tournament, prefix, now_ts = DEFAULT_NOW_FN()) {
	const limit_minutes = get_time_limit_before_scheduled_minutes_for_prefix(tournament, prefix);
	if (limit_minutes == null) {
		return true;
	}
	const scheduled_ts = get_scheduled_timestamp(match);
	if (!Number.isFinite(scheduled_ts)) {
		return false;
	}
	return now_ts >= (scheduled_ts - (limit_minutes * 60 * 1000));
}

function get_participant_readiness_mode(tournament, prefix = 'preparation_call') {
	const field = `${prefix}_participant_readiness_mode`;
	const value = tournament?.[field];
	if (value === 'checked_in' || value === 'pause_expired' || value === 'disabled') {
		return value;
	}
	if (prefix === 'preparation_call' && tournament?.preparation_call_player_pause_expired_enabled === true) {
		return 'pause_expired';
	}
	if (prefix === 'call_on_court' && tournament?.call_on_court_player_pause_expired_enabled === true) {
		return 'pause_expired';
	}
	return 'disabled';
}

function passes_player_pause_expired_rule(match, tournament, now_ts = DEFAULT_NOW_FN()) {
	return passes_player_pause_expired_rule_for_prefix(match, tournament, 'preparation_call', now_ts);
}

function passes_player_pause_expired_rule_for_prefix(match, tournament, prefix, now_ts = DEFAULT_NOW_FN()) {
	if (get_participant_readiness_mode(tournament, prefix) !== 'pause_expired') {
		return true;
	}

	const pause_duration_ms = Number(tournament?.btp_settings?.pause_duration_ms);
	if (!Number.isFinite(pause_duration_ms) || pause_duration_ms <= 0) {
		return true;
	}

	return get_match_players(match).every((player) => {
		if (!player) {
			return true;
		}
		if (player.now_playing_on_court || player.now_tablet_on_court) {
			return false;
		}
		if (!player.last_time_on_court_ts) {
			return true;
		}
		return (now_ts - Number(player.last_time_on_court_ts)) >= pause_duration_ms;
	});
}

function passes_players_checked_in_rule(match, tournament) {
	return passes_players_checked_in_rule_for_prefix(match, tournament, 'preparation_call');
}

function passes_players_checked_in_rule_for_prefix(match, tournament, prefix) {
	if (get_participant_readiness_mode(tournament, prefix) !== 'checked_in') {
		return true;
	}
	return get_match_players(match).every((player) => !player || player.checked_in === true);
}

function get_waiting_technical_official_ids(tournament) {
	const officials = Array.isArray(tournament?.umpires) ? tournament.umpires : [];
	const umpire_ids = new Set();
	const service_judge_ids = new Set();

	officials.forEach((official) => {
		if (!official || !official._id) {
			return;
		}
		if (official.umpire_wait != null) {
			umpire_ids.add(official._id);
		}
		if (official.service_judge_wait != null) {
			service_judge_ids.add(official._id);
		}
	});

	return { umpire_ids, service_judge_ids };
}

function passes_technical_officials_available_rule(match, tournament) {
	if (tournament?.preparation_call_technical_officials_available_enabled !== true) {
		return true;
	}
	return passes_technical_officials_available_rule_for_prefix(match, tournament, 'preparation_call');
}

function passes_technical_officials_available_rule_for_prefix(match, tournament, prefix) {
	if (prefix !== 'preparation_call' && prefix !== 'call_on_court') {
		return true;
	}
	if (prefix === 'call_on_court' && tournament?.call_on_court_technical_officials_mode !== 'available') {
		return true;
	}

	const official_rotation_mode = tournament?.official_rotation_mode || 'umpire_and_service_judge';
	if (official_rotation_mode === 'disabled') {
		return true;
	}
	const technical_official_auto_assignment_mode = tournament?.technical_official_auto_assignment_mode || 'manual_only';
	if (technical_official_auto_assignment_mode !== 'when_available' && technical_official_auto_assignment_mode !== 'on_preparation_call') {
		return true;
	}

	const setup = match?.setup || {};
	const has_assigned_umpire = !!setup.umpire;
	const has_assigned_service_judge = !!setup.service_judge;
	const assigned_official_ids = new Set(
		[setup.umpire?._id, setup.service_judge?._id].filter((value) => !!value)
	);

	const { umpire_ids, service_judge_ids } = get_waiting_technical_official_ids(tournament);
	const available_umpire_ids = new Set([...umpire_ids].filter((official_id) => !assigned_official_ids.has(official_id)));
	const available_service_judge_ids = new Set([...service_judge_ids].filter((official_id) => !assigned_official_ids.has(official_id)));
	if (official_rotation_mode === 'umpire_only') {
		return has_assigned_umpire || available_umpire_ids.size > 0;
	}
	if (has_assigned_umpire && has_assigned_service_judge) {
		return true;
	}

	const needs_umpire = !has_assigned_umpire;
	const needs_service_judge = !has_assigned_service_judge;

	if (needs_umpire && !needs_service_judge) {
		return available_umpire_ids.size > 0;
	}
	if (!needs_umpire && needs_service_judge) {
		return available_service_judge_ids.size > 0;
	}
	if (!needs_umpire && !needs_service_judge) {
		return true;
	}

	if (available_umpire_ids.size === 0 || available_service_judge_ids.size === 0) {
		return false;
	}

	for (const umpire_id of available_umpire_ids) {
		for (const service_judge_id of available_service_judge_ids) {
			if (umpire_id !== service_judge_id) {
				return true;
			}
		}
	}

	return false;
}

function get_call_on_court_required_technical_official_roles(tournament, court) {
	const official_rotation_mode = tournament?.official_rotation_mode || 'umpire_and_service_judge';
	const court_supports_umpire = !!court && court.has_umpire !== false;
	const court_supports_service_judge = court_supports_umpire && !!court && court.has_service_judge !== false;

	if (official_rotation_mode === 'disabled') {
		return {
			needs_umpire: false,
			needs_service_judge: false,
		};
	}

	if (official_rotation_mode === 'umpire_only') {
		return {
			needs_umpire: true,
			needs_service_judge: false,
		};
	}

	return {
		needs_umpire: true,
		needs_service_judge: court_supports_service_judge,
	};
}

function passes_call_on_court_technical_officials_available_rule(match, court, tournament) {
	if (tournament?.call_on_court_technical_officials_mode !== 'available') {
		return true;
	}
	if (!court) {
		return false;
	}

	const technical_official_auto_assignment_mode = tournament?.technical_official_auto_assignment_mode || 'manual_only';
	if (
		technical_official_auto_assignment_mode !== 'when_available' &&
		technical_official_auto_assignment_mode !== 'on_preparation_call' &&
		technical_official_auto_assignment_mode !== 'on_match_call_if_possible'
	) {
		return true;
	}

	const { needs_umpire, needs_service_judge } = get_call_on_court_required_technical_official_roles(tournament, court);
	const setup = match?.setup || {};
	const assigned_official_ids = new Set(
		[setup.umpire?._id, setup.service_judge?._id].filter((value) => !!value)
	);
	const { umpire_ids, service_judge_ids } = get_waiting_technical_official_ids(tournament);
	const available_umpire_ids = new Set([...umpire_ids].filter((official_id) => !assigned_official_ids.has(official_id)));
	const available_service_judge_ids = new Set([...service_judge_ids].filter((official_id) => !assigned_official_ids.has(official_id)));

	if (!needs_umpire && !needs_service_judge) {
		return true;
	}

	const has_assigned_umpire = !needs_umpire || !!setup.umpire;
	const has_assigned_service_judge = !needs_service_judge || !!setup.service_judge;

	if (has_assigned_umpire && has_assigned_service_judge) {
		return true;
	}
	if (!has_assigned_umpire && has_assigned_service_judge) {
		return available_umpire_ids.size > 0;
	}
	if (has_assigned_umpire && !has_assigned_service_judge) {
		return available_service_judge_ids.size > 0;
	}

	if (available_umpire_ids.size === 0) {
		return false;
	}
	if (!needs_service_judge) {
		return true;
	}
	if (available_service_judge_ids.size === 0) {
		return false;
	}

	for (const umpire_id of available_umpire_ids) {
		for (const service_judge_id of available_service_judge_ids) {
			if (umpire_id !== service_judge_id) {
				return true;
			}
		}
	}

	return false;
}

function passes_call_on_court_technical_official_assignment_possible_rule(match, court, tournament) {
	if (tournament?.call_on_court_technical_officials_mode !== 'available') {
		return true;
	}
	if (!court) {
		return false;
	}
	const official_rotation_mode = tournament?.official_rotation_mode || 'umpire_and_service_judge';
	if (official_rotation_mode === 'disabled') {
		return true;
	}
	const setup = match?.setup || {};
	const { needs_umpire: role_needs_umpire, needs_service_judge: role_needs_service_judge } =
		get_call_on_court_required_technical_official_roles(tournament, court);
	const needs_umpire = role_needs_umpire && !setup.umpire;
	const needs_service_judge = role_needs_service_judge && !setup.service_judge;
	const requires_umpire_space = !!setup.umpire || needs_umpire;
	const requires_service_judge_space = !!setup.service_judge || needs_service_judge;

	if (requires_umpire_space && court.has_umpire === false) {
		return false;
	}
	if (requires_service_judge_space && court.has_service_judge === false) {
		return false;
	}
	return true;
}

function passes_base_preparation_rules(match, location_id, tournament, options = {}) {
	const setup = match?.setup || {};
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const ignore_location = options.ignore_location === true;
	const ignore_technical_officials_available_rule = options.ignore_technical_officials_available_rule === true;

	if (setup.state !== 'scheduled') return false;
	if (setup.is_match !== true) return false;
	if (setup.incomplete === true) return false;
	if (!is_match_completely_initialized(match)) return false;
	if (match?.team1_won !== undefined && match?.team1_won !== null) return false;
	if (setup.state === 'preparation' || setup.state === 'oncourt' || setup.state === 'blocked' || setup.state === 'finished') return false;
	if (!ignore_location && !match_matches_location(match, location_id, courts_by_id)) return false;
	if (has_open_participant_dependency(match, tournament, { matches_by_planning_id })) return false;
	if (!passes_time_limit_before_scheduled(match, tournament, now_ts)) return false;
	if (!passes_player_pause_expired_rule(match, tournament, now_ts)) return false;
	if (!ignore_technical_officials_available_rule && !passes_technical_officials_available_rule(match, tournament)) return false;

	return true;
}

function get_frontier_block_limit(tournament) {
	if (tournament?.preparation_call_block_ahead_limit_enabled !== true) {
		return null;
	}
	const limit = Number(tournament?.preparation_call_block_ahead_limit);
	return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

function get_frontier_block_limit_for_prefix(tournament, prefix) {
	if (prefix === 'preparation_call') {
		return get_frontier_block_limit(tournament);
	}
	if (tournament?.[`${prefix}_block_ahead_limit_enabled`] !== true) {
		return null;
	}
	const limit = Number(tournament?.[`${prefix}_block_ahead_limit`]);
	return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

function get_frontier_time_limit_minutes(tournament) {
	if (tournament?.preparation_call_time_ahead_of_frontier_enabled !== true) {
		return null;
	}
	const minutes = Number(tournament?.preparation_call_time_ahead_of_frontier_minutes);
	return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function get_frontier_time_limit_minutes_for_prefix(tournament, prefix) {
	if (prefix === 'preparation_call') {
		return get_frontier_time_limit_minutes(tournament);
	}
	if (tournament?.[`${prefix}_time_ahead_of_frontier_enabled`] !== true) {
		return null;
	}
	const minutes = Number(tournament?.[`${prefix}_time_ahead_of_frontier_minutes`]);
	return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function get_frontier_match_limit(tournament) {
	if (tournament?.preparation_call_matches_ahead_of_frontier_enabled !== true) {
		return null;
	}
	const limit = Number(tournament?.preparation_call_matches_ahead_of_frontier_limit);
	return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

function get_frontier_match_limit_for_prefix(tournament, prefix) {
	if (prefix === 'preparation_call') {
		return get_frontier_match_limit(tournament);
	}
	if (tournament?.[`${prefix}_matches_ahead_of_frontier_enabled`] !== true) {
		return null;
	}
	const limit = Number(tournament?.[`${prefix}_matches_ahead_of_frontier_limit`]);
	return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

function get_location_relevant_matches(tournament, location_id, options = {}) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	return matches
		.filter((match) => match?.setup?.state === 'scheduled')
		.filter((match) => match_matches_location(match, location_id, courts_by_id))
		.sort(cmp_scheduled_match_order);
}

function find_preparation_frontier_match(tournament, location_id, options = {}) {
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_location_relevant_matches(tournament, location_id, { courts_by_id });

	return relevant_matches.find((match) => !passes_base_preparation_rules(match, location_id, tournament, {
		courts_by_id,
		matches_by_planning_id,
		now_ts,
		ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
	})) || null;
}

function build_frontier_block_sequence(matches) {
	const block_sequence = [];
	let last_block_key = null;
	matches.forEach((match) => {
		const setup = match?.setup || {};
		const block_key = `${setup.event_name || ''}|${setup.phase_block_key || 'UNKNOWN'}`;
		if (block_key !== last_block_key) {
			block_sequence.push(block_key);
			last_block_key = block_key;
		}
	});
	return block_sequence;
}

function get_frontier_block_distance(match, frontier, relevant_matches) {
	const sequence = build_frontier_block_sequence(relevant_matches);
	const match_key = `${match?.setup?.event_name || ''}|${match?.setup?.phase_block_key || 'UNKNOWN'}`;
	const frontier_key = `${frontier?.setup?.event_name || ''}|${frontier?.setup?.phase_block_key || 'UNKNOWN'}`;
	const match_index = sequence.indexOf(match_key);
	const frontier_index = sequence.indexOf(frontier_key);
	if (match_index < 0 || frontier_index < 0) {
		return Number.POSITIVE_INFINITY;
	}
	return match_index - frontier_index;
}

function passes_frontier_block_limit(match, frontier, tournament, relevant_matches) {
	const limit = get_frontier_block_limit(tournament);
	if (limit == null || !frontier) {
		return true;
	}
	return get_frontier_block_distance(match, frontier, relevant_matches) <= limit;
}

function passes_frontier_block_limit_for_prefix(match, frontier, tournament, relevant_matches, prefix) {
	const limit = get_frontier_block_limit_for_prefix(tournament, prefix);
	if (limit == null || !frontier) {
		return true;
	}
	return get_frontier_block_distance(match, frontier, relevant_matches) <= limit;
}

function passes_frontier_time_limit(match, frontier, tournament) {
	const limit_minutes = get_frontier_time_limit_minutes(tournament);
	if (limit_minutes == null || !frontier) {
		return true;
	}
	const match_ts = get_scheduled_timestamp(match);
	const frontier_ts = get_scheduled_timestamp(frontier);
	if (!Number.isFinite(match_ts) || !Number.isFinite(frontier_ts)) {
		return false;
	}
	return (match_ts - frontier_ts) <= (limit_minutes * 60 * 1000);
}

function passes_frontier_time_limit_for_prefix(match, frontier, tournament, prefix) {
	const limit_minutes = get_frontier_time_limit_minutes_for_prefix(tournament, prefix);
	if (limit_minutes == null || !frontier) {
		return true;
	}
	const match_ts = get_scheduled_timestamp(match);
	const frontier_ts = get_scheduled_timestamp(frontier);
	if (!Number.isFinite(match_ts) || !Number.isFinite(frontier_ts)) {
		return false;
	}
	return (match_ts - frontier_ts) <= (limit_minutes * 60 * 1000);
}

function passes_frontier_match_limit(match, frontier, tournament, relevant_matches) {
	const limit = get_frontier_match_limit(tournament);
	if (limit == null || !frontier) {
		return true;
	}
	const match_index = relevant_matches.findIndex((candidate) => candidate?._id === match?._id);
	const frontier_index = relevant_matches.findIndex((candidate) => candidate?._id === frontier?._id);
	if (match_index < 0 || frontier_index < 0) {
		return false;
	}
	return (match_index - frontier_index) <= limit;
}

function passes_frontier_match_limit_for_prefix(match, frontier, tournament, relevant_matches, prefix) {
	const limit = get_frontier_match_limit_for_prefix(tournament, prefix);
	if (limit == null || !frontier) {
		return true;
	}
	const match_index = relevant_matches.findIndex((candidate) => candidate?._id === match?._id);
	const frontier_index = relevant_matches.findIndex((candidate) => candidate?._id === frontier?._id);
	if (match_index < 0 || frontier_index < 0) {
		return false;
	}
	return (match_index - frontier_index) <= limit;
}

function get_call_on_court_relevant_matches(tournament, location_id, options = {}) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const only_preparation = tournament?.call_on_court_only_preparation_enabled === true;
	return matches
		.filter((match) => {
			const state = match?.setup?.state;
			if (only_preparation) {
				return state === 'preparation';
			}
			return state === 'scheduled' || state === 'preparation';
		})
		.filter((match) => match_matches_location(match, location_id, courts_by_id))
		.sort(cmp_scheduled_match_order);
}

function get_call_on_court_preparation_age_minutes(tournament) {
	if (tournament?.call_on_court_only_preparation_enabled !== true) {
		return null;
	}
	const minutes = Number(tournament?.call_on_court_only_preparation_minutes);
	return Number.isFinite(minutes) && minutes >= 0 ? minutes : 0;
}

function passes_call_on_court_preparation_rule(match, tournament, now_ts = DEFAULT_NOW_FN()) {
	const minimum_minutes = get_call_on_court_preparation_age_minutes(tournament);
	if (minimum_minutes == null) {
		return true;
	}
	if (match?.setup?.state !== 'preparation') {
		return false;
	}
	const preparation_ts = Number(match?.setup?.preparation_call_timestamp);
	if (!Number.isFinite(preparation_ts)) {
		return false;
	}
	return (now_ts - preparation_ts) >= (minimum_minutes * 60 * 1000);
}

function get_required_technical_official_roles(tournament) {
	const official_rotation_mode = tournament?.official_rotation_mode || 'umpire_and_service_judge';
	return {
		needs_umpire: official_rotation_mode !== 'disabled',
		needs_service_judge: official_rotation_mode === 'umpire_and_service_judge',
	};
}

function passes_call_on_court_technical_officials_checked_in_rule(match, court, tournament) {
	const mode = tournament?.call_on_court_technical_officials_mode || 'disabled';
	if (mode !== 'checked_in') {
		return true;
	}
	const { needs_umpire, needs_service_judge } = get_call_on_court_required_technical_official_roles(tournament, court);
	const setup = match?.setup || {};
	if (needs_umpire && setup.umpire?.checked_in !== true) {
		return false;
	}
	if (needs_service_judge && setup.service_judge?.checked_in !== true) {
		return false;
	}
	return true;
}

function passes_call_on_court_assigned_official_space_rule(match, court, tournament) {
	if (tournament?.call_on_court_require_official_space_enabled !== true) {
		return true;
	}
	if (!court) {
		return false;
	}
	const setup = match?.setup || {};
	if (setup.umpire && court.has_umpire === false) {
		return false;
	}
	if (setup.service_judge && court.has_service_judge === false) {
		return false;
	}
	return true;
}

function passes_base_call_on_court_rules(match, court_id, tournament, options = {}) {
	const setup = match?.setup || {};
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const court = courts_by_id.get(court_id) || null;
	const location_id = court?.location_id || null;

	if (!court || court.is_active !== true) return false;
	if (setup.state !== 'scheduled' && setup.state !== 'preparation') return false;
	if (setup.is_match !== true) return false;
	if (setup.incomplete === true) return false;
	if (!is_match_completely_initialized(match)) return false;
	if (setup.now_on_court === true) return false;
	if (match?.team1_won !== undefined && match?.team1_won !== null) return false;
	if (!match_matches_location(match, location_id, courts_by_id)) return false;
	if (has_open_participant_dependency(match, tournament, { matches_by_planning_id })) return false;
	if (!passes_call_on_court_preparation_rule(match, tournament, now_ts)) return false;
	if (!passes_time_limit_before_scheduled_for_prefix(match, tournament, 'call_on_court', now_ts)) return false;
	if (!passes_players_checked_in_rule_for_prefix(match, tournament, 'call_on_court')) return false;
	if (!passes_player_pause_expired_rule_for_prefix(match, tournament, 'call_on_court', now_ts)) return false;
	if (!passes_call_on_court_technical_officials_checked_in_rule(match, court, tournament)) return false;
	if (!passes_call_on_court_technical_officials_available_rule(match, court, tournament)) return false;
	if (!passes_call_on_court_technical_official_assignment_possible_rule(match, court, tournament)) return false;
	if (!passes_call_on_court_assigned_official_space_rule(match, court, tournament)) return false;

	return true;
}

function find_call_on_court_frontier_match(tournament, court_id, options = {}) {
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const court = courts_by_id.get(court_id) || null;
	const location_id = court?.location_id || null;
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_call_on_court_relevant_matches(tournament, location_id, { courts_by_id });

	return relevant_matches.find((match) => !passes_base_call_on_court_rules(match, court_id, tournament, {
		courts_by_id,
		matches_by_planning_id,
		now_ts,
	})) || null;
}

function is_match_eligible_for_on_court_call(match, court_id, tournament, options = {}) {
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const court = courts_by_id.get(court_id) || null;
	const location_id = court?.location_id || null;
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_call_on_court_relevant_matches(tournament, location_id, { courts_by_id });
	const frontier = options.frontier !== undefined
		? options.frontier
		: find_call_on_court_frontier_match(tournament, court_id, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
		});

	if (!passes_base_call_on_court_rules(match, court_id, tournament, {
		courts_by_id,
		matches_by_planning_id,
		now_ts,
	})) {
		return false;
	}
	if (frontier && cmp_scheduled_match_order(match, frontier) < 0) {
		return true;
	}
	if (!passes_frontier_block_limit_for_prefix(match, frontier, tournament, relevant_matches, 'call_on_court')) return false;
	if (!passes_frontier_time_limit_for_prefix(match, frontier, tournament, 'call_on_court')) return false;
	if (!passes_frontier_match_limit_for_prefix(match, frontier, tournament, relevant_matches, 'call_on_court')) return false;

	return true;
}

function cmp_call_on_court_candidate_order(m1, m2) {
	const state1 = m1?.setup?.state;
	const state2 = m2?.setup?.state;
	if (state1 === 'preparation' && state2 !== 'preparation') return -1;
	if (state2 === 'preparation' && state1 !== 'preparation') return 1;
	const preparation_age_cmp = cmp_values(
		Number(m1?.setup?.preparation_call_timestamp) || 0,
		Number(m2?.setup?.preparation_call_timestamp) || 0
	);
	if (state1 === 'preparation' && state2 === 'preparation' && preparation_age_cmp !== 0) {
		return preparation_age_cmp;
	}
	return cmp_scheduled_match_order(m1, m2);
}

function find_call_on_court_candidates(tournament, court_id, options = {}) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const court = courts_by_id.get(court_id) || null;
	const location_id = court?.location_id || null;
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_call_on_court_relevant_matches(tournament, location_id, { courts_by_id });
	const frontier = options.frontier !== undefined
		? options.frontier
		: find_call_on_court_frontier_match(tournament, court_id, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
		});

	return matches
		.filter((match) => is_match_eligible_for_on_court_call(match, court_id, tournament, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
			frontier,
		}))
		.sort(cmp_call_on_court_candidate_order);
}

function is_match_eligible_for_preparation(match, location_id, tournament, options = {}) {
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_location_relevant_matches(tournament, location_id, { courts_by_id });
	const frontier = options.frontier !== undefined
		? options.frontier
		: find_preparation_frontier_match(tournament, location_id, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
			ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
		});

	if (!passes_base_preparation_rules(match, location_id, tournament, {
		courts_by_id,
		matches_by_planning_id,
		now_ts,
		ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
	})) {
		return false;
	}
	if (frontier && cmp_scheduled_match_order(match, frontier) < 0) {
		return true;
	}
	if (!passes_frontier_block_limit(match, frontier, tournament, relevant_matches)) return false;
	if (!passes_frontier_time_limit(match, frontier, tournament)) return false;
	if (!passes_frontier_match_limit(match, frontier, tournament, relevant_matches)) return false;

	return true;
}

function find_location_preparation_candidates(tournament, location_id, options = {}) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_location_relevant_matches(tournament, location_id, { courts_by_id });
	const frontier = options.frontier !== undefined
		? options.frontier
		: find_preparation_frontier_match(tournament, location_id, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
			ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
		});

	return matches
		.filter((match) => is_match_eligible_for_preparation(match, location_id, tournament, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
			frontier,
			ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
		}))
		.sort(cmp_scheduled_match_order);
}

function get_global_relevant_matches(tournament) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	return matches
		.filter((match) => match?.setup?.state === 'scheduled')
		.sort(cmp_scheduled_match_order);
}

function find_global_preparation_frontier_match(tournament, options = {}) {
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_global_relevant_matches(tournament);

	return relevant_matches.find((match) => !passes_base_preparation_rules(match, null, tournament, {
		courts_by_id,
		matches_by_planning_id,
		now_ts,
		ignore_location: true,
		ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
	})) || null;
}

function find_global_preparation_candidates(tournament, options = {}) {
	const matches = Array.isArray(tournament?.matches) ? tournament.matches : [];
	const courts_by_id = options.courts_by_id || get_courts_by_id(tournament);
	const matches_by_planning_id = options.matches_by_planning_id || build_matches_by_planning_id(tournament);
	const now_ts = options.now_ts != null ? options.now_ts : DEFAULT_NOW_FN();
	const relevant_matches = options.relevant_matches || get_global_relevant_matches(tournament);
	const frontier = options.frontier !== undefined
		? options.frontier
		: find_global_preparation_frontier_match(tournament, {
			courts_by_id,
			matches_by_planning_id,
			now_ts,
			relevant_matches,
			ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
		});

	return matches
		.filter((match) => {
			if (!passes_base_preparation_rules(match, null, tournament, {
				courts_by_id,
				matches_by_planning_id,
				now_ts,
				ignore_location: true,
				ignore_technical_officials_available_rule: options.ignore_technical_officials_available_rule === true,
			})) {
				return false;
			}
			if (frontier && cmp_scheduled_match_order(match, frontier) < 0) {
				return true;
			}
			if (!passes_frontier_block_limit(match, frontier, tournament, relevant_matches)) return false;
			if (!passes_frontier_time_limit(match, frontier, tournament)) return false;
			if (!passes_frontier_match_limit(match, frontier, tournament, relevant_matches)) return false;
			return true;
		})
		.sort(cmp_scheduled_match_order);
}

function calculate_location_preparation_selection(tournament, location_id, options = {}) {
	const status = calculate_location_preparation_status(tournament, location_id);
	const candidates = find_location_preparation_candidates(tournament, location_id, options);
	const effective_required_preparation_count =
		(tournament?.call_preparation_matches_automatically_enabled ? status.successor_need_count : 0);
	const effective_missing_preparation_count = Math.max(0, effective_required_preparation_count - status.current_preparation_count);
	const selected_matches = candidates.slice(0, status.missing_preparation_count);
	const auto_selected_matches = candidates.slice(0, effective_missing_preparation_count);

	return {
		location_id,
		...status,
		effective_required_preparation_count,
		effective_missing_preparation_count,
		candidates,
		selected_matches,
		auto_selected_matches,
	};
}

function get_preparation_successor_rally_count(tournament) {
	const rally_count = Number(tournament && tournament.preparation_successor_rally_count);
	if (Number.isFinite(rally_count) && rally_count > 0) {
		return Math.floor(rally_count);
	}
	return DEFAULT_PREPARATION_SUCCESSOR_RALLY_COUNT;
}

function calculate_preparation_successor_state(match, tournament) {
	const rally_count = get_preparation_successor_rally_count(tournament);
	const needs_preparation_successor = can_leader_finish_match_within_rallies(
		match,
		match && match.setup ? match.setup.scoring_format : null,
		rally_count
	);
	return {
		needs_preparation_successor,
		needs_preparation_successor_ts: needs_preparation_successor
			? (match?.setup?.needs_preparation_successor_ts || Date.now())
			: null,
		rally_count,
	};
}

async function fetch_location_preparation_status(app, tournament_key, location_id) {
	const [courts, matches] = await Promise.all([
		app.db.courts.find_async({ tournament_key }),
		app.db.matches.find_async({ tournament_key }),
	]);

	return calculate_location_preparation_status({
		courts,
		matches,
	}, location_id);
}

async function fetch_location_preparation_selection(app, tournament_key, location_id, options = {}) {
	const [tournament, locations, courts, matches, umpires] = await Promise.all([
		app.db.tournaments.findOne_async({ key: tournament_key }),
		app.db.locations.find_async({ tournament_key }),
		app.db.courts.find_async({ tournament_key }),
		app.db.matches.find_async({ tournament_key }),
		app.db.umpires.find_async({ tournament_key }),
	]);

	const location = (locations || []).find((entry) => entry && entry._id === location_id) || null;
	const selection = calculate_location_preparation_selection({
		...(tournament || {}),
		locations,
		courts,
		matches,
		umpires,
	}, location_id, options);

	return {
		...selection,
		location,
	};
}

async function fetch_all_location_preparation_selections(app, tournament_key, options = {}) {
	const [tournament, locations, courts, matches, umpires] = await Promise.all([
		app.db.tournaments.findOne_async({ key: tournament_key }),
		app.db.locations.find_async({ tournament_key }),
		app.db.courts.find_async({ tournament_key }),
		app.db.matches.find_async({ tournament_key }),
		app.db.umpires.find_async({ tournament_key }),
	]);

	return (locations || []).map((location) => {
		const selection = calculate_location_preparation_selection({
			...(tournament || {}),
			locations,
			courts,
			matches,
			umpires,
		}, location._id, options);

		return {
			...selection,
			location,
		};
	});
}

async function fetch_global_preparation_candidates(app, tournament_key, options = {}) {
	const [tournament, locations, courts, matches, umpires] = await Promise.all([
		app.db.tournaments.findOne_async({ key: tournament_key }),
		app.db.locations.find_async({ tournament_key }),
		app.db.courts.find_async({ tournament_key }),
		app.db.matches.find_async({ tournament_key }),
		app.db.umpires.find_async({ tournament_key }),
	]);

	return find_global_preparation_candidates({
		...(tournament || {}),
		locations,
		courts,
		matches,
		umpires,
	}, options);
}

module.exports = {
	can_leader_finish_match_within_rallies,
	calculate_location_preparation_need,
	calculate_location_preparation_selection,
	calculate_location_preparation_status,
	calculate_preparation_successor_state,
	fetch_all_location_preparation_selections,
	fetch_global_preparation_candidates,
	fetch_location_preparation_selection,
	fetch_location_preparation_status,
	find_call_on_court_candidates,
	find_global_preparation_candidates,
	find_location_preparation_candidates,
	find_call_on_court_frontier_match,
	get_preparation_successor_rally_count,
	get_current_match_state,
	get_current_leader,
	has_open_participant_dependency,
	find_preparation_frontier_match,
	get_participant_readiness_mode,
	is_match_eligible_for_on_court_call,
	is_match_eligible_for_preparation,
	passes_call_on_court_assigned_official_space_rule,
	passes_call_on_court_technical_official_assignment_possible_rule,
	passes_call_on_court_preparation_rule,
	passes_call_on_court_technical_officials_checked_in_rule,
	passes_players_checked_in_rule,
	passes_player_pause_expired_rule,
	passes_technical_officials_available_rule,
	rallies_needed_for_set_win,
};
