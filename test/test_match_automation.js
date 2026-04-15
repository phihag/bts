'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const match_automation = require('../bts/match_automation.js');

function make_scoring_format(overrides = {}) {
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
		...overrides,
	};
}

function make_match({ network_score, now_on_court = true, team1_won = null } = {}) {
	return {
		network_score,
		team1_won,
		setup: {
			now_on_court,
		},
	};
}

function make_preparation_match(overrides = {}) {
	const setup_overrides = overrides.setup || {};
	const match = {
		_id: overrides._id || 'm1',
		match_order: overrides.match_order,
		team1_won: overrides.team1_won ?? null,
		setup: {
			state: 'scheduled',
			is_match: true,
			incomplete: false,
			match_num: 1,
			scheduled_date: '2026-04-07',
			scheduled_time_str: '10:00',
			location_id: null,
			court_id: null,
			teams: [
				{ players: [{ _id: 'p1' }] },
				{ players: [{ _id: 'p2' }] },
			],
			...setup_overrides,
		},
	};
	if (overrides.btp_match_ids) {
		match.btp_match_ids = overrides.btp_match_ids;
	}
	if (overrides.btp_player_ids) {
		match.btp_player_ids = overrides.btp_player_ids;
	}
	return match;
}

function make_court(overrides = {}) {
	return {
		_id: overrides._id || 'c1',
		location_id: overrides.location_id || 'l1',
		is_active: overrides.is_active !== false,
		match_id: overrides.match_id ?? null,
		...overrides,
	};
}

function make_location(overrides = {}) {
	return {
		_id: overrides._id || 'l1',
		name: overrides.name || 'Location 1',
		...overrides,
	};
}

function make_tournament(overrides = {}) {
	return {
		key: overrides.key || 't1',
		courts: overrides.courts || [],
		matches: overrides.matches || [],
		locations: overrides.locations || [],
		umpires: overrides.umpires || [],
		btp_settings: overrides.btp_settings || {},
		...overrides,
	};
}

function make_official(overrides = {}) {
	return {
		_id: overrides._id || 'o1',
		umpire_wait: overrides.umpire_wait ?? null,
		service_judge_wait: overrides.service_judge_wait ?? null,
		...overrides,
	};
}

function make_realistic_location_fixture() {
	const location = make_location({ _id: 'l-hall', name: 'BTS Halle' });
	const courts = [
		make_court({ _id: 'c-free', location_id: location._id, is_active: true, match_id: null }),
		make_court({ _id: 'c-on', location_id: location._id, is_active: true, match_id: 'm-live' }),
		make_court({ _id: 'c-off', location_id: location._id, is_active: false, match_id: 'm-disabled-live' }),
	];
	const matches = [
		make_preparation_match({
			_id: 'm-live',
			setup: {
				state: 'oncourt',
				now_on_court: true,
				court_id: 'c-on',
				match_num: 10,
				scheduled_time_str: '10:00',
				needs_preparation_successor: true,
			},
		}),
		make_preparation_match({
			_id: 'm-disabled-live',
			setup: {
				state: 'oncourt',
				now_on_court: true,
				court_id: 'c-off',
				match_num: 11,
				scheduled_time_str: '10:00',
				needs_preparation_successor: true,
			},
		}),
		make_preparation_match({
			_id: 'm-prepared',
			setup: {
				state: 'preparation',
				location_id: location._id,
				match_num: 12,
				scheduled_time_str: '10:15',
			},
		}),
		make_preparation_match({
			_id: 'm-eligible-1',
			match_order: 1,
			setup: {
				match_num: 13,
				location_id: location._id,
				scheduled_time_str: '10:30',
			},
		}),
		make_preparation_match({
			_id: 'm-eligible-2',
			match_order: 2,
			setup: {
				match_num: 14,
				location_id: location._id,
				scheduled_time_str: '10:45',
			},
		}),
	];

	return make_tournament({
		call_preparation_matches_automatically_enabled: true,
		locations: [location],
		courts,
		matches,
	});
}

_describe('match automation', () => {
	_it('returns false when no side leads in the current set', () => {
		const match = make_match({
			network_score: [[10, 10]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 5),
			false
		);
	});

	_it('returns false when the leader cannot finish the match within n rallies', () => {
		const match = make_match({
			network_score: [[21, 18], [9, 7]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 11),
			false
		);
	});

	_it('returns true when the leader can finish the match within n rallies', () => {
		const match = make_match({
			network_score: [[21, 18], [10, 7]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 11),
			true
		);
	});

	_it('allows rallies to carry over into the next set', () => {
		const match = make_match({
			network_score: [[18, 15]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 25),
			true
		);
	});

	_it('returns false when carried-over rallies still do not finish the match', () => {
		const match = make_match({
			network_score: [[18, 15]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 20),
			false
		);
	});

	_it('returns false in deuce when no side leads', () => {
		const match = make_match({
			network_score: [[21, 18], [20, 20]],
		});

		assert.strictEqual(
			match_automation.can_leader_finish_match_within_rallies(match, make_scoring_format(), 1),
			false
		);
	});

	_it('returns zero preparation need when no successors and no free courts exist', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
					},
				},
			],
		}, 'l1');

		assert.deepStrictEqual(result, {
			location_id: 'l1',
			active_court_count: 1,
			successor_need_count: 0,
			free_court_count: 0,
			required_preparation_count: 0,
		});
	});

	_it('tracks a free active court separately from preparation successor need', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: null },
			],
			matches: [],
		}, 'l1');

		assert.strictEqual(result.successor_need_count, 0);
		assert.strictEqual(result.free_court_count, 1);
		assert.strictEqual(result.required_preparation_count, 1);
	});

	_it('counts a triggered on-court match towards preparation need', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.successor_need_count, 1);
		assert.strictEqual(result.free_court_count, 0);
		assert.strictEqual(result.required_preparation_count, 1);
	});

	_it('does not count successor need on inactive courts', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: false, match_id: 'm1' },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.active_court_count, 0);
		assert.strictEqual(result.successor_need_count, 0);
		assert.strictEqual(result.free_court_count, 0);
		assert.strictEqual(result.required_preparation_count, 0);
	});

	_it('uses only successor need as required preparation count', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
				{ _id: 'c2', location_id: 'l1', is_active: true, match_id: 'm2' },
				{ _id: 'c3', location_id: 'l1', is_active: true, match_id: null },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
				{
					_id: 'm2',
					setup: {
						now_on_court: true,
						court_id: 'c2',
						needs_preparation_successor: true,
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.successor_need_count, 2);
		assert.strictEqual(result.free_court_count, 1);
		assert.strictEqual(result.required_preparation_count, 3);
	});

	_it('ignores inactive or occupied courts', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: false, match_id: null },
				{ _id: 'c2', location_id: 'l1', is_active: true, match_id: 'm2' },
				{ _id: 'c3', location_id: 'l1', is_active: true, match_id: null },
			],
			matches: [
				{
					_id: 'm2',
					setup: {
						now_on_court: true,
						court_id: 'c2',
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.free_court_count, 1);
		assert.strictEqual(result.required_preparation_count, 1);
	});

	_it('treats stale court match references as free when no match is actually on court', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'old-match' },
			],
			matches: [
				{
					_id: 'old-match',
					setup: {
						now_on_court: false,
						court_id: 'c1',
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.free_court_count, 1);
		assert.strictEqual(result.required_preparation_count, 1);
	});

	_it('only counts matches and courts of the requested location', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
				{ _id: 'c2', location_id: 'l1', is_active: true, match_id: null },
				{ _id: 'c3', location_id: 'l2', is_active: true, match_id: null },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
				{
					_id: 'm2',
					setup: {
						now_on_court: true,
						court_id: 'c3',
						needs_preparation_successor: true,
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.successor_need_count, 1);
		assert.strictEqual(result.free_court_count, 1);
		assert.strictEqual(result.required_preparation_count, 2);
	});

	_it('caps required preparation count at the number of active courts', () => {
		const result = match_automation.calculate_location_preparation_need({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
				{
					_id: 'm2',
					setup: {
						state: 'preparation',
						location_id: 'l1',
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.active_court_count, 1);
		assert.strictEqual(result.successor_need_count, 1);
		assert.strictEqual(result.free_court_count, 0);
		assert.strictEqual(result.required_preparation_count, 1);
	});

	_it('uses the default rally threshold for preparation successor state', () => {
		const match = make_match({
			network_score: [[21, 18], [10, 7]],
		});
		match.setup.scoring_format = make_scoring_format();

		const result = match_automation.calculate_preparation_successor_state(match, {});

		assert.strictEqual(result.rally_count, 11);
		assert.strictEqual(result.needs_preparation_successor, true);
		assert.ok(Number.isFinite(result.needs_preparation_successor_ts));
	});

	_it('preserves an existing preparation successor timestamp while the flag stays active', () => {
		const match = make_match({
			network_score: [[21, 18], [10, 7]],
		});
		match.setup.scoring_format = make_scoring_format();
		match.setup.needs_preparation_successor_ts = 12345;

		const result = match_automation.calculate_preparation_successor_state(match, {
			preparation_successor_rally_count: 11,
		});

		assert.strictEqual(result.needs_preparation_successor, true);
		assert.strictEqual(result.needs_preparation_successor_ts, 12345);
	});

	_it('subtracts already prepared matches for the same location', () => {
		const result = match_automation.calculate_location_preparation_status({
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: 'm1' },
				{ _id: 'c2', location_id: 'l1', is_active: true, match_id: null },
			],
			matches: [
				{
					_id: 'm1',
					setup: {
						now_on_court: true,
						court_id: 'c1',
						needs_preparation_successor: true,
					},
				},
				{
					_id: 'm2',
					setup: {
						state: 'preparation',
						location_id: 'l1',
					},
				},
			],
		}, 'l1');

		assert.strictEqual(result.required_preparation_count, 2);
		assert.strictEqual(result.current_preparation_count, 1);
		assert.strictEqual(result.missing_preparation_count, 1);
	});

	_it('accepts a scheduled match explicitly assigned to the location', () => {
		const tournament = { courts: [], matches: [] };
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('accepts a scheduled match via a court assigned to the location', () => {
		const tournament = {
			courts: [
				{ _id: 'c1', location_id: 'l1' },
			],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				court_id: 'c1',
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('accepts an unassigned match for any location', () => {
		const tournament = { courts: [], matches: [] };
		const match = make_preparation_match();

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('rejects a match assigned to another location', () => {
		const tournament = { courts: [], matches: [] };
		const match = make_preparation_match({
			setup: {
				location_id: 'l2',
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);
	});

	_it('rejects a match whose court belongs to another location', () => {
		const tournament = {
			courts: [
				{ _id: 'c2', location_id: 'l2' },
			],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				court_id: 'c2',
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);
	});

	_it('rejects matches that are not clean scheduled candidates', () => {
		const tournament = { courts: [], matches: [] };
		const cases = [
			make_preparation_match({ setup: { state: 'preparation' } }),
			make_preparation_match({ setup: { state: 'oncourt' } }),
			make_preparation_match({ setup: { state: 'blocked' } }),
			make_preparation_match({ setup: { state: 'finished' } }),
			make_preparation_match({ setup: { state: 'draft' } }),
			make_preparation_match({ setup: { is_match: false } }),
			make_preparation_match({ setup: { incomplete: true } }),
			make_preparation_match({ team1_won: true }),
			make_preparation_match({
				setup: {
					teams: [
						{ players: [{ _id: 'p1' }] },
						{ players: [] },
					],
				},
			}),
		];

		cases.forEach((match) => {
			assert.strictEqual(
				match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
				false
			);
		});
	});

	_it('respects the optional time limit before scheduled time', () => {
		const tournament = {
			preparation_call_time_limit_before_scheduled_enabled: true,
			preparation_call_time_limit_before_scheduled_minutes: 15,
			courts: [],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				scheduled_date: '2026-04-07',
				scheduled_time_str: '10:00',
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament, {
				now_ts: Date.parse('2026-04-07T09:44:00'),
			}),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament, {
				now_ts: Date.parse('2026-04-07T09:45:00'),
			}),
			true
		);
	});

	_it('rejects matches without usable scheduling when the time limit is enabled', () => {
		const tournament = {
			preparation_call_time_limit_before_scheduled_enabled: true,
			preparation_call_time_limit_before_scheduled_minutes: 15,
			courts: [],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				scheduled_time_str: null,
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);
	});

	_it('respects the optional player pause rule', () => {
		const tournament = {
			preparation_call_player_pause_expired_enabled: true,
			btp_settings: {
				pause_duration_ms: 10 * 60 * 1000,
			},
			courts: [],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				teams: [
					{ players: [{ _id: 'p1', last_time_on_court_ts: Date.parse('2026-04-07T09:55:01') }] },
					{ players: [{ _id: 'p2', last_time_on_court_ts: Date.parse('2026-04-07T09:40:00') }] },
				],
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament, {
				now_ts: Date.parse('2026-04-07T10:00:00'),
			}),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament, {
				now_ts: Date.parse('2026-04-07T10:06:00'),
			}),
			true
		);
	});

	_it('treats players currently on court or on tablet as not pause-cleared when the rule is enabled', () => {
		const tournament = {
			preparation_call_player_pause_expired_enabled: true,
			btp_settings: {
				pause_duration_ms: 10 * 60 * 1000,
			},
			courts: [],
			matches: [],
		};
		const now = Date.parse('2026-04-07T10:30:00');

		const playing_match = make_preparation_match({
			setup: {
				teams: [
					{ players: [{ _id: 'p1', now_playing_on_court: 'c1' }] },
					{ players: [{ _id: 'p2' }] },
				],
			},
		});
		const tablet_match = make_preparation_match({
			setup: {
				teams: [
					{ players: [{ _id: 'p1', now_tablet_on_court: 'c1' }] },
					{ players: [{ _id: 'p2' }] },
				],
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(playing_match, 'l1', tournament, { now_ts: now }),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(tablet_match, 'l1', tournament, { now_ts: now }),
			false
		);
	});

	_it('does not enforce player pause timing when the rule is disabled', () => {
		const tournament = {
			preparation_call_player_pause_expired_enabled: false,
			btp_settings: {
				pause_duration_ms: 10 * 60 * 1000,
			},
			courts: [],
			matches: [],
		};
		const match = make_preparation_match({
			setup: {
				teams: [
					{ players: [{ _id: 'p1', last_time_on_court_ts: Date.parse('2026-04-07T09:59:30') }] },
					{ players: [{ _id: 'p2' }] },
				],
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament, {
				now_ts: Date.parse('2026-04-07T10:00:00'),
			}),
			true
		);
	});

	_it('requires matches to already be in preparation for the configured minimum time on court-call automation', () => {
		const court = make_court({ _id: 'c1', location_id: 'l1', is_active: true });
		const tournament = make_tournament({
			courts: [court],
			matches: [],
			call_on_court_only_preparation_enabled: true,
			call_on_court_only_preparation_minutes: 5,
		});
		const scheduled_match = make_preparation_match({
			_id: 'scheduled',
			setup: {
				state: 'scheduled',
				location_id: 'l1',
			},
		});
		const recent_preparation_match = make_preparation_match({
			_id: 'prep-recent',
			setup: {
				state: 'preparation',
				location_id: 'l1',
				preparation_call_timestamp: Date.parse('2026-04-07T09:57:00'),
			},
		});
		const old_preparation_match = make_preparation_match({
			_id: 'prep-old',
			setup: {
				state: 'preparation',
				location_id: 'l1',
				preparation_call_timestamp: Date.parse('2026-04-07T09:54:00'),
			},
		});
		tournament.matches = [scheduled_match, recent_preparation_match, old_preparation_match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(scheduled_match, 'c1', tournament, {
				now_ts: Date.parse('2026-04-07T10:00:00'),
			}),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(recent_preparation_match, 'c1', tournament, {
				now_ts: Date.parse('2026-04-07T10:00:00'),
			}),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(old_preparation_match, 'c1', tournament, {
				now_ts: Date.parse('2026-04-07T10:00:00'),
			}),
			true
		);
	});

	_it('ignores earlier scheduled matches as frontier blockers when only preparation matches may be called', () => {
		const court = make_court({ _id: 'c1', location_id: 'l1', is_active: true });
		const scheduled_match = make_preparation_match({
			_id: 'scheduled-earlier',
			match_order: 1,
			setup: {
				state: 'scheduled',
				location_id: 'l1',
				match_num: 10,
				scheduled_time_str: '10:00',
			},
		});
		const preparation_match = make_preparation_match({
			_id: 'prepared-later',
			match_order: 2,
			setup: {
				state: 'preparation',
				location_id: 'l1',
				match_num: 11,
				scheduled_time_str: '10:15',
				preparation_call_timestamp: Date.parse('2026-04-07T09:59:00'),
			},
		});
		const tournament = make_tournament({
			courts: [court],
			matches: [scheduled_match, preparation_match],
			call_on_court_only_preparation_enabled: true,
			call_on_court_only_preparation_minutes: 0,
		});

		const candidates = match_automation.find_call_on_court_candidates(tournament, 'c1', {
			now_ts: Date.parse('2026-04-07T10:00:00'),
		});

		assert.deepStrictEqual(candidates.map((match) => match._id), ['prepared-later']);
	});

	_it('prefers the oldest preparation call when multiple prepared matches are eligible for on-court calls', () => {
		const court = make_court({ _id: 'c1', location_id: 'l1', is_active: true });
		const newer_preparation_match = make_preparation_match({
			_id: 'prepared-newer',
			match_order: 2,
			setup: {
				state: 'preparation',
				location_id: 'l1',
				match_num: 11,
				scheduled_time_str: '10:15',
				preparation_call_timestamp: Date.parse('2026-04-07T09:58:00'),
			},
		});
		const older_preparation_match = make_preparation_match({
			_id: 'prepared-older',
			match_order: 3,
			setup: {
				state: 'preparation',
				location_id: 'l1',
				match_num: 12,
				scheduled_time_str: '10:30',
				preparation_call_timestamp: Date.parse('2026-04-07T09:52:00'),
			},
		});
		const tournament = make_tournament({
			courts: [court],
			matches: [newer_preparation_match, older_preparation_match],
			call_on_court_only_preparation_enabled: true,
			call_on_court_only_preparation_minutes: 0,
		});

		const candidates = match_automation.find_call_on_court_candidates(tournament, 'c1', {
			now_ts: Date.parse('2026-04-07T10:00:00'),
		});

		assert.deepStrictEqual(candidates.map((match) => match._id), ['prepared-older', 'prepared-newer']);
	});

	_it('requires all players to be checked in when the on-court participant rule is set to checked_in', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true })],
			call_on_court_participant_readiness_mode: 'checked_in',
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
				teams: [
					{ players: [{ _id: 'p1', checked_in: true }] },
					{ players: [{ _id: 'p2', checked_in: false }] },
				],
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			false
		);

		match.setup.teams[1].players[0].checked_in = true;
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			true
		);
	});

	_it('requires assigned technical officials to be checked in when the on-court official rule is set to checked_in', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true })],
			official_rotation_mode: 'umpire_and_service_judge',
			call_on_court_technical_officials_mode: 'checked_in',
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
				umpire: { _id: 'u1', checked_in: true },
				service_judge: { _id: 'u2', checked_in: false },
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			false
		);

		match.setup.service_judge.checked_in = true;
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			true
		);
	});

	_it('requires technical officials to be available when the on-court official rule is set to available', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true })],
			official_rotation_mode: 'umpire_only',
			technical_official_auto_assignment_mode: 'when_available',
			call_on_court_technical_officials_mode: 'available',
			umpires: [],
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			false
		);

		tournament.umpires = [make_official({ _id: 'u1', umpire_wait: 111, checked_in: true })];
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			true
		);
	});

	_it('requires enough official space on the target court when availability is checked for on-match-call assignment', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true, has_umpire: false })],
			official_rotation_mode: 'umpire_only',
			technical_official_auto_assignment_mode: 'on_match_call_if_possible',
			call_on_court_technical_officials_mode: 'available',
			umpires: [make_official({ _id: 'u1', umpire_wait: 111, checked_in: true })],
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			false
		);
	});

	_it('allows on-court call with only an umpire when the target court has no service judge space', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true, has_umpire: true, has_service_judge: false })],
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_match_call_if_possible',
			call_on_court_technical_officials_mode: 'available',
			umpires: [make_official({ _id: 'u1', umpire_wait: 111, checked_in: true })],
		});
		const match = make_preparation_match({
			setup: {
				state: 'preparation',
				location_id: 'l1',
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			true
		);
	});

	_it('does not require a service judge to be checked in on a court without service judge space', () => {
		const tournament = make_tournament({
			courts: [make_court({ _id: 'c1', location_id: 'l1', is_active: true, has_umpire: true, has_service_judge: false })],
			official_rotation_mode: 'umpire_and_service_judge',
			call_on_court_technical_officials_mode: 'checked_in',
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
				umpire: { _id: 'u1', checked_in: true },
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			true
		);
	});

	_it('can require enough court space for already assigned technical officials', () => {
		const tournament = make_tournament({
			courts: [
				make_court({ _id: 'c1', location_id: 'l1', is_active: true, has_umpire: true, has_service_judge: false }),
				make_court({ _id: 'c2', location_id: 'l1', is_active: true, has_umpire: true, has_service_judge: true }),
			],
			call_on_court_require_official_space_enabled: true,
		});
		const match = make_preparation_match({
			setup: {
				location_id: 'l1',
				umpire: { _id: 'u1', checked_in: true },
				service_judge: { _id: 'u2', checked_in: true },
			},
		});
		tournament.matches = [match];

		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c1', tournament),
			false
		);
		assert.strictEqual(
			match_automation.is_match_eligible_for_on_court_call(match, 'c2', tournament),
			true
		);
	});

	_it('requires a waiting umpire when the technical officials rule is enabled in umpire_only mode', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_only',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [],
		});
		const match = make_preparation_match();

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);

		tournament.umpires = [
			make_official({ _id: 'u1', umpire_wait: 111 }),
		];

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('requires distinct waiting umpire and service judge capacity in full rotation mode', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [
				make_official({ _id: 'dual-only', umpire_wait: 111, service_judge_wait: 222 }),
			],
		});
		const match = make_preparation_match();

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);

		tournament.umpires = [
			make_official({ _id: 'u1', umpire_wait: 111 }),
			make_official({ _id: 's1', service_judge_wait: 222 }),
		];

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('accepts matches that already have the required technical officials assigned', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [],
		});
		const match = make_preparation_match({
			setup: {
				umpire: { _id: 'u1' },
				service_judge: { _id: 's1' },
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('accepts matches with one assigned technical official when the missing role is still available', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [
				make_official({ _id: 's1', service_judge_wait: 222 }),
			],
		});
		const match = make_preparation_match({
			setup: {
				umpire: { _id: 'u1' },
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('does not count an already assigned official as available for the missing second role', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [
				make_official({ _id: 'dual1', service_judge_wait: 222 }),
			],
		});
		const match = make_preparation_match({
			setup: {
				umpire: { _id: 'dual1' },
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);
	});

	_it('can ignore the technical officials availability rule when searching likely future candidates', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: true,
			official_rotation_mode: 'umpire_and_service_judge',
			technical_official_auto_assignment_mode: 'on_preparation_call',
			umpires: [
				make_official({ _id: 'u1', umpire_wait: 111 }),
			],
			matches: [
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '10:00',
					},
				}),
			],
		});

		assert.deepStrictEqual(
			match_automation.find_global_preparation_candidates(tournament).map((match) => match._id),
			[]
		);

		assert.deepStrictEqual(
			match_automation.find_global_preparation_candidates(tournament, {
				ignore_technical_officials_available_rule: true,
			}).map((match) => match._id),
			['m1']
		);
	});

	_it('ignores the technical officials rule when it is disabled', () => {
		const tournament = make_tournament({
			preparation_call_technical_officials_available_enabled: false,
			official_rotation_mode: 'umpire_and_service_judge',
			umpires: [],
		});
		const match = make_preparation_match();

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('rejects matches with an unfinished direct predecessor', () => {
		const predecessor = make_preparation_match({
			_id: 'm-pre',
			btp_match_ids: [{ planning: 100 }],
			setup: {
				match_num: 1,
				scheduled_time_str: '09:30',
			},
		});
		const match = make_preparation_match({
			_id: 'm-target',
			setup: {
				match_num: 2,
				scheduled_time_str: '10:00',
				teams: [
					{ players: [{ _id: 'p1' }] },
					{ players: [] },
				],
				links: {
					from1: 100,
				},
			},
		});
		const tournament = {
			courts: [],
			matches: [predecessor, match],
		};

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);

		predecessor.team1_won = true;
		match.setup.teams[1].players = [{ _id: 'p2' }];

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('rejects matches with unresolved predecessor references when participants are not yet complete', () => {
		const tournament = { courts: [], matches: [] };
		const match = make_preparation_match({
			setup: {
				teams: [
					{ players: [{ _id: 'p1' }] },
					{ players: [] },
				],
				links: {
					from1: 999,
				},
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			false
		);
	});

	_it('does not reject complete matches only because raw predecessor links exist', () => {
		const tournament = { courts: [], matches: [] };
		const match = make_preparation_match({
			setup: {
				links: {
					from1: 999,
				},
			},
		});

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(match, 'l1', tournament),
			true
		);
	});

	_it('rejects matches whose players are still in an earlier unfinished match', () => {
		const earlier_match = make_preparation_match({
			_id: 'm-earlier',
			setup: {
				match_num: 1,
				scheduled_time_str: '09:30',
				teams: [
					{ players: [{ _id: 'p1', btp_id: 10 }] },
					{ players: [{ _id: 'p2', btp_id: 20 }] },
				],
			},
		});
		const later_match = make_preparation_match({
			_id: 'm-later',
			setup: {
				match_num: 2,
				scheduled_time_str: '10:00',
				teams: [
					{ players: [{ _id: 'p1', btp_id: 10 }] },
					{ players: [{ _id: 'p3', btp_id: 30 }] },
				],
			},
		});
		const tournament = {
			courts: [],
			matches: [earlier_match, later_match],
		};

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(later_match, 'l1', tournament),
			false
		);

		earlier_match.team1_won = true;

		assert.strictEqual(
			match_automation.is_match_eligible_for_preparation(later_match, 'l1', tournament),
			true
		);
	});

	_it('limits candidates by block distance from the first unusable match', () => {
		const tournament = {
			preparation_call_block_ahead_limit_enabled: true,
			preparation_call_block_ahead_limit: 1,
			courts: [],
			matches: [
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:00',
						event_name: 'HE',
						phase_block_key: 'G1',
					},
				}),
				make_preparation_match({
					_id: 'm2',
					setup: {
						match_num: 2,
						scheduled_time_str: '09:05',
						event_name: 'HE',
						phase_block_key: 'G1',
						teams: [
							{ players: [{ _id: 'p1' }] },
							{ players: [] },
						],
						links: { from1: 999 },
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_time_str: '09:10',
						event_name: 'HE',
						phase_block_key: 'G1',
					},
				}),
				make_preparation_match({
					_id: 'm4',
					setup: {
						match_num: 4,
						scheduled_time_str: '09:15',
						event_name: 'HE',
						phase_block_key: 'G2',
					},
				}),
				make_preparation_match({
					_id: 'm5',
					setup: {
						match_num: 5,
						scheduled_time_str: '09:20',
						event_name: 'HE',
						phase_block_key: 'VF',
					},
				}),
			],
		};

		const candidates = match_automation.find_location_preparation_candidates(tournament, 'l1');

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm3', 'm4']);
	});

	_it('limits candidates by scheduled time distance from the first unusable match', () => {
		const tournament = {
			preparation_call_time_ahead_of_frontier_enabled: true,
			preparation_call_time_ahead_of_frontier_minutes: 30,
			courts: [],
			matches: [
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:00',
					},
				}),
				make_preparation_match({
					_id: 'm2',
					setup: {
						match_num: 2,
						scheduled_time_str: '10:00',
						teams: [
							{ players: [{ _id: 'p1' }] },
							{ players: [] },
						],
						links: { from1: 999 },
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_time_str: '10:20',
					},
				}),
				make_preparation_match({
					_id: 'm4',
					setup: {
						match_num: 4,
						scheduled_time_str: '10:40',
					},
				}),
			],
		};

		const candidates = match_automation.find_location_preparation_candidates(tournament, 'l1');

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm3']);
	});

	_it('limits candidates by match count distance from the first unusable match', () => {
		const tournament = {
			preparation_call_matches_ahead_of_frontier_enabled: true,
			preparation_call_matches_ahead_of_frontier_limit: 1,
			courts: [],
			matches: [
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:00',
					},
				}),
				make_preparation_match({
					_id: 'm2',
					setup: {
						match_num: 2,
						scheduled_time_str: '09:05',
						teams: [
							{ players: [{ _id: 'p1' }] },
							{ players: [] },
						],
						links: { from1: 999 },
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_time_str: '09:10',
					},
				}),
				make_preparation_match({
					_id: 'm4',
					setup: {
						match_num: 4,
						scheduled_time_str: '09:15',
					},
				}),
			],
		};

		const candidates = match_automation.find_location_preparation_candidates(tournament, 'l1');

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm3']);
	});

	_it('ignores incomplete matches when determining the frontier sequence', () => {
		const tournament = {
			preparation_call_matches_ahead_of_frontier_enabled: true,
			preparation_call_matches_ahead_of_frontier_limit: 1,
			courts: [],
			matches: [
				make_preparation_match({
					_id: 'ko_future',
					setup: {
						match_num: 100,
						state: 'incomplete',
						phase_block_key: 'VF',
						teams: [
							{ players: [] },
							{ players: [] },
						],
					},
				}),
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:00',
					},
				}),
				make_preparation_match({
					_id: 'frontier',
					setup: {
						match_num: 2,
						scheduled_time_str: '09:05',
						teams: [
							{ players: [{ _id: 'p1' }] },
							{ players: [] },
						],
						links: { from1: 999 },
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_time_str: '09:10',
					},
				}),
			],
		};

		const candidates = match_automation.find_location_preparation_candidates(tournament, 'l1');

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm3']);
	});

	_it('selects only as many preparation candidates as are currently missing', () => {
		const tournament = {
			call_preparation_matches_automatically_enabled: true,
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: null },
				{ _id: 'c2', location_id: 'l1', is_active: true, match_id: 'm-oncourt' },
			],
			matches: [
				{
					_id: 'm-oncourt',
					setup: {
						now_on_court: true,
						court_id: 'c2',
						needs_preparation_successor: true,
					},
				},
				{
					_id: 'm-prepared',
					setup: {
						state: 'preparation',
						location_id: 'l1',
					},
				},
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:30',
						location_id: 'l1',
					},
				}),
				make_preparation_match({
					_id: 'm2',
					setup: {
						match_num: 2,
						scheduled_time_str: '10:00',
						location_id: 'l1',
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_time_str: '10:30',
						location_id: 'l1',
					},
				}),
			],
		};

		const selection = match_automation.calculate_location_preparation_selection(tournament, 'l1');

		assert.strictEqual(selection.required_preparation_count, 2);
		assert.strictEqual(selection.current_preparation_count, 1);
		assert.strictEqual(selection.missing_preparation_count, 1);
		assert.deepStrictEqual(selection.candidates.map((match) => match._id), ['m1', 'm2', 'm3']);
		assert.deepStrictEqual(selection.selected_matches.map((match) => match._id), ['m1']);
		assert.deepStrictEqual(selection.auto_selected_matches.map((match) => match._id), []);
	});

	_it('returns no selected matches when the location already has enough preparation matches', () => {
		const tournament = {
			courts: [
				{ _id: 'c1', location_id: 'l1', is_active: true, match_id: null },
			],
			matches: [
				{
					_id: 'm-prepared',
					setup: {
						state: 'preparation',
						location_id: 'l1',
					},
				},
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:30',
						location_id: 'l1',
					},
				}),
			],
		};

		const selection = match_automation.calculate_location_preparation_selection(tournament, 'l1');

		assert.strictEqual(selection.required_preparation_count, 1);
		assert.strictEqual(selection.current_preparation_count, 1);
		assert.strictEqual(selection.missing_preparation_count, 0);
		assert.deepStrictEqual(selection.selected_matches, []);
		assert.deepStrictEqual(selection.auto_selected_matches, []);
	});

	_it('fetches the preparation selection for one location from db-backed data', async () => {
		const app = {
			db: {
				tournaments: {
					findOne_async: async () => ({
						key: 't1',
					}),
				},
				locations: {
					find_async: async () => ([
						{ _id: 'l1', name: 'Loc 1' },
					]),
				},
				courts: {
					find_async: async () => ([
						{ _id: 'c1', location_id: 'l1', is_active: true, match_id: null },
					]),
				},
				matches: {
					find_async: async () => ([
						make_preparation_match({
							_id: 'm1',
							setup: {
								match_num: 1,
								scheduled_time_str: '09:30',
								location_id: 'l1',
							},
						}),
					]),
				},
				umpires: {
					find_async: async () => ([]),
				},
			},
		};

		const selection = await match_automation.fetch_location_preparation_selection(app, 't1', 'l1');

		assert.strictEqual(selection.location_id, 'l1');
		assert.strictEqual(selection.location.name, 'Loc 1');
		assert.strictEqual(selection.required_preparation_count, 1);
		assert.strictEqual(selection.missing_preparation_count, 1);
		assert.deepStrictEqual(selection.selected_matches.map((match) => match._id), ['m1']);
		assert.deepStrictEqual(selection.auto_selected_matches.map((match) => match._id), []);
	});

	_it('sorts preparation candidates like the main page', () => {
		const tournament = {
			courts: [],
			matches: [
				make_preparation_match({
					_id: 'm4',
					match_order: 2,
					setup: {
						match_num: 4,
						scheduled_date: '2026-04-07',
						scheduled_time_str: '10:00',
					},
				}),
				make_preparation_match({
					_id: 'm2',
					match_order: 1,
					setup: {
						match_num: 2,
						scheduled_date: '2026-04-07',
						scheduled_time_str: '10:00',
					},
				}),
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_date: '2026-04-07',
						scheduled_time_str: '09:30',
					},
				}),
				make_preparation_match({
					_id: 'm3',
					setup: {
						match_num: 3,
						scheduled_date: '2026-04-07',
						scheduled_time_str: '00:00',
					},
				}),
			],
		};

		const candidates = match_automation.find_location_preparation_candidates(tournament, 'l1');

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm2', 'm4', 'm3']);
	});

	_it('finds global preparation candidates without filtering by location', () => {
		const tournament = {
			courts: [
				make_court({ _id: 'c1', location_id: 'l1' }),
				make_court({ _id: 'c2', location_id: 'l2' }),
			],
			matches: [
				make_preparation_match({
					_id: 'm2',
					setup: {
						match_num: 2,
						scheduled_time_str: '10:00',
						location_id: 'l2',
					},
				}),
				make_preparation_match({
					_id: 'm1',
					setup: {
						match_num: 1,
						scheduled_time_str: '09:30',
						location_id: 'l1',
					},
				}),
			],
		};

		const candidates = match_automation.find_global_preparation_candidates(tournament);

		assert.deepStrictEqual(candidates.map((match) => match._id), ['m1', 'm2']);
	});

	_it('keeps a realistic location fixture stable across active, inactive and prepared matches', () => {
		const tournament = make_realistic_location_fixture();

		const need = match_automation.calculate_location_preparation_need(tournament, 'l-hall');
		const status = match_automation.calculate_location_preparation_status(tournament, 'l-hall');
		const selection = match_automation.calculate_location_preparation_selection(tournament, 'l-hall');

		assert.strictEqual(need.active_court_count, 2);
		assert.strictEqual(need.successor_need_count, 1);
		assert.strictEqual(need.free_court_count, 1);
		assert.strictEqual(need.required_preparation_count, 2);

		assert.strictEqual(status.current_preparation_count, 1);
		assert.strictEqual(status.missing_preparation_count, 1);

		assert.deepStrictEqual(selection.candidates.map((match) => match._id), ['m-eligible-1', 'm-eligible-2']);
		assert.deepStrictEqual(selection.selected_matches.map((match) => match._id), ['m-eligible-1']);
		assert.deepStrictEqual(selection.auto_selected_matches.map((match) => match._id), []);
	});
});
