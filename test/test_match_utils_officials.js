'use strict';

const assert = require('assert');

const { _describe, _it } = require('./tutils.js');
const match_utils = require('../bts/match_utils.js');
const admin = require('../bts/admin.js');
const btp_manager = require('../bts/btp_manager.js');
const match_automation = require('../bts/match_automation.js');

function make_official(overrides = {}) {
	const pick = (field, fallback) => Object.prototype.hasOwnProperty.call(overrides, field) ? overrides[field] : fallback;
	return {
		_id: overrides._id || 'u1',
		name: overrides.name || 'Test Official',
		is_umpire: overrides.is_umpire === true,
		is_service_judge: overrides.is_service_judge === true,
		is_planed_as_umpire: overrides.is_planed_as_umpire === true,
		is_planed_as_service_judge: overrides.is_planed_as_service_judge === true,
		umpire_on_court: pick('umpire_on_court', 'c1'),
		service_judge_on_court: pick('service_judge_on_court', null),
		umpire_wait: pick('umpire_wait', 111),
		service_judge_wait: pick('service_judge_wait', 222),
		umpire_pause: pick('umpire_pause', 333),
		service_judge_pause: pick('service_judge_pause', 444),
		inactive_list: pick('inactive_list', 555),
		last_time_on_court_ts: pick('last_time_on_court_ts', 666),
		status: overrides.status || 'oncourt',
		court_id: pick('court_id', 'c1'),
		checked_in: overrides.checked_in === true,
	};
}

_describe('match utils official state helpers', () => {
	_it('moves an official to standby and clears all active list markers', () => {
		const official = make_official({
			is_planed_as_umpire: true,
			is_planed_as_service_judge: true,
			is_umpire: true,
			is_service_judge: true,
		});

		const result = match_utils.apply_official_standby_state(official);

		assert.strictEqual(result.status, 'standby');
		assert.strictEqual(result.umpire_on_court, null);
		assert.strictEqual(result.service_judge_on_court, null);
		assert.strictEqual(result.is_planed_as_umpire, false);
		assert.strictEqual(result.is_planed_as_service_judge, false);
		assert.strictEqual(result.umpire_wait, null);
		assert.strictEqual(result.service_judge_wait, null);
		assert.strictEqual(result.umpire_pause, null);
		assert.strictEqual(result.service_judge_pause, null);
		assert.strictEqual(result.inactive_list, null);
		assert.strictEqual(result.last_time_on_court_ts, null);
		assert.strictEqual(result.court_id, null);
	});

	_it('releases a service judge from court into the correct wait list', () => {
		const end_ts = 123456;
		const official = make_official({
			is_umpire: false,
			is_service_judge: true,
			is_planed_as_service_judge: true,
			service_judge_on_court: 'c9',
		});

		const result = match_utils.apply_official_on_court_release(official, 'service_judge', end_ts);

		assert.strictEqual(result.status, 'ready');
		assert.strictEqual(result.umpire_on_court, null);
		assert.strictEqual(result.service_judge_on_court, null);
		assert.strictEqual(result.is_planed_as_umpire, false);
		assert.strictEqual(result.is_planed_as_service_judge, false);
		assert.strictEqual(result.umpire_wait, null);
		assert.strictEqual(result.service_judge_wait, end_ts + 100);
		assert.strictEqual(result.umpire_pause, null);
		assert.strictEqual(result.service_judge_pause, null);
		assert.strictEqual(result.inactive_list, null);
		assert.strictEqual(result.last_time_on_court_ts, end_ts);
		assert.strictEqual(result.court_id, null);
	});

	_it('returns a dual-role umpire back to the service judge wait list in full rotation mode', () => {
		const end_ts = 555000;
		const official = make_official({
			is_umpire: true,
			is_service_judge: true,
			is_planed_as_umpire: true,
			umpire_on_court: 'c7',
		});

		const result = match_utils.apply_official_on_court_release(official, 'umpire', end_ts);

		assert.strictEqual(result.umpire_wait, null);
		assert.strictEqual(result.service_judge_wait, end_ts);
		assert.strictEqual(result.inactive_list, null);
	});

	_it('returns any official to the umpire wait list in umpire_only mode', () => {
		const end_ts = 777000;
		const official = make_official({
			is_umpire: false,
			is_service_judge: true,
			is_planed_as_service_judge: true,
			service_judge_on_court: 'c8',
		});

		const result = match_utils.apply_official_on_court_release(official, 'service_judge', end_ts, {
			official_rotation_mode: 'umpire_only'
		});

		assert.strictEqual(result.umpire_wait, end_ts);
		assert.strictEqual(result.service_judge_wait, null);
		assert.strictEqual(result.inactive_list, null);
	});

	_it('puts a returning official into pause instead of wait when a technical official break is configured', () => {
		const end_ts = 888000;
		const official = make_official({
			is_umpire: true,
			is_service_judge: false,
			is_planed_as_umpire: true,
			umpire_on_court: 'c3',
		});

		const result = match_utils.apply_official_on_court_release(official, 'umpire', end_ts, {
			official_rotation_mode: 'umpire_only',
			technical_official_break_after_assignment_ms: 30 * 1000,
		});

		assert.strictEqual(result.status, 'pause');
		assert.strictEqual(result.umpire_pause, end_ts + (30 * 1000));
		assert.strictEqual(result.umpire_wait, null);
	});

	_it('moves an expired technical official break back to the matching wait list', () => {
		const official = make_official({
			status: 'pause',
			umpire_wait: null,
			service_judge_wait: null,
			umpire_pause: 123456,
			service_judge_pause: null,
		});

		const result = match_utils.apply_official_pause_expiry(official);

		assert.strictEqual(result.status, 'ready');
		assert.strictEqual(result.umpire_pause, null);
		assert.strictEqual(result.umpire_wait, 123456);
		assert.strictEqual(result.service_judge_wait, null);
	});

	_it('treats ready technical officials as checked in when check-in is configured per player', () => {
		const official = make_official({
			checked_in: false,
			umpire_on_court: null,
			service_judge_on_court: null,
			umpire_wait: 123,
			service_judge_wait: null,
			umpire_pause: null,
			service_judge_pause: null,
			inactive_list: null,
		});

		assert.strictEqual(
			match_utils.get_effective_technical_official_checked_in(official, {
				btp_settings: { check_in_per_match: false }
			}),
			true
		);
	});

	_it('treats paused or inactive technical officials as not checked in when check-in is configured per player', () => {
		const paused_official = make_official({
			checked_in: true,
			umpire_wait: null,
			umpire_pause: 123456,
			inactive_list: null,
		});
		const inactive_official = make_official({
			checked_in: true,
			umpire_wait: null,
			umpire_pause: null,
			inactive_list: 987654,
		});

		assert.strictEqual(
			match_utils.get_effective_technical_official_checked_in(paused_official, {
				btp_settings: { check_in_per_match: false }
			}),
			false
		);
		assert.strictEqual(
			match_utils.get_effective_technical_official_checked_in(inactive_official, {
				btp_settings: { check_in_per_match: false }
			}),
			false
		);
	});

	_it('drops stale preparation state when highlight is cleared', () => {
		const setup = {
			state: 'preparation',
			highlight: 0,
			preparation_call_timestamp: 123456,
			location_id: 'l1',
		};

		const result = match_utils.normalize_preparation_state(setup);

		assert.strictEqual(result.state, 'scheduled');
		assert.strictEqual(result.preparation_call_timestamp, undefined);
		assert.strictEqual(result.location_id, 'l1');
	});

	_it('auto-assigns only an umpire in on_preparation_call + umpire_only mode', (done) => {
		const calls = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		const original_assign_next_service_judge_to_match = admin._assign_next_service_judge_to_match;
		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.resolve();
		};
		admin._assign_next_service_judge_to_match = (_app, tournament_key, match_id) => {
			calls.push(['service_judge', tournament_key, match_id]);
			return Promise.resolve();
		};

		match_utils.auto_assign_technical_officials_for_match(
			{},
			{ key: 't1', technical_official_auto_assignment_mode: 'on_preparation_call', official_rotation_mode: 'umpire_only' },
			'm1',
			(err) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				admin._assign_next_service_judge_to_match = original_assign_next_service_judge_to_match;
				assert.ifError(err);
				assert.deepStrictEqual(calls, [['umpire', 't1', 'm1']]);
				done();
			}
		);
	});

	_it('auto-assigns umpire and service judge in on_preparation_call + full mode', (done) => {
		const calls = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		const original_assign_next_service_judge_to_match = admin._assign_next_service_judge_to_match;
		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.resolve();
		};
		admin._assign_next_service_judge_to_match = (_app, tournament_key, match_id) => {
			calls.push(['service_judge', tournament_key, match_id]);
			return Promise.resolve();
		};

		match_utils.auto_assign_technical_officials_for_match(
			{},
			{ key: 't1', technical_official_auto_assignment_mode: 'on_preparation_call', official_rotation_mode: 'umpire_and_service_judge' },
			'm1',
			(err) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				admin._assign_next_service_judge_to_match = original_assign_next_service_judge_to_match;
				assert.ifError(err);
				assert.deepStrictEqual(calls, [['umpire', 't1', 'm1'], ['service_judge', 't1', 'm1']]);
				done();
			}
		);
	});

	_it('still assigns a missing service judge when the umpire is already assigned', (done) => {
		const calls = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		const original_assign_next_service_judge_to_match = admin._assign_next_service_judge_to_match;
		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.reject(new Error('Match already has assigned umpire'));
		};
		admin._assign_next_service_judge_to_match = (_app, tournament_key, match_id) => {
			calls.push(['service_judge', tournament_key, match_id]);
			return Promise.resolve();
		};

		match_utils.auto_assign_technical_officials_for_match(
			{},
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_and_service_judge' },
			'm1',
			(err, changed) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				admin._assign_next_service_judge_to_match = original_assign_next_service_judge_to_match;
				assert.ifError(err);
				assert.strictEqual(changed, true);
				assert.deepStrictEqual(calls, [['umpire', 't1', 'm1'], ['service_judge', 't1', 'm1']]);
				done();
			}
		);
	});

	_it('does nothing outside on_preparation_call mode', (done) => {
		const calls = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.resolve();
		};

		match_utils.auto_assign_technical_officials_for_match(
			{},
			{ key: 't1', technical_official_auto_assignment_mode: 'manual_only', official_rotation_mode: 'umpire_and_service_judge' },
			'm1',
			(err) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				assert.ifError(err);
				assert.deepStrictEqual(calls, []);
				done();
			}
		);
	});

	_it('also auto-assigns in when_available mode', (done) => {
		const calls = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		const original_assign_next_service_judge_to_match = admin._assign_next_service_judge_to_match;
		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.resolve();
		};
		admin._assign_next_service_judge_to_match = (_app, tournament_key, match_id) => {
			calls.push(['service_judge', tournament_key, match_id]);
			return Promise.resolve();
		};

		match_utils.auto_assign_technical_officials_for_match(
			{},
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_and_service_judge' },
			'm1',
			(err) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				admin._assign_next_service_judge_to_match = original_assign_next_service_judge_to_match;
				assert.ifError(err);
				assert.deepStrictEqual(calls, [['umpire', 't1', 'm1'], ['service_judge', 't1', 'm1']]);
				done();
			}
		);
	});

	_it('fills prepared matches when officials become available in when_available mode', (done) => {
		const calls = [];
		const pushes = [];
		const original_assign_next_umpire_to_match = admin._assign_next_umpire_to_match;
		const original_assign_next_service_judge_to_match = admin._assign_next_service_judge_to_match;
		const original_update_highlight = btp_manager.update_highlight;
		const original_fetch_all_location_preparation_selections = match_automation.fetch_all_location_preparation_selections;

		admin._assign_next_umpire_to_match = (_app, tournament_key, match_id) => {
			calls.push(['umpire', tournament_key, match_id]);
			return Promise.resolve();
		};
		admin._assign_next_service_judge_to_match = (_app, tournament_key, match_id) => {
			calls.push(['service_judge', tournament_key, match_id]);
			return Promise.resolve();
		};
		btp_manager.update_highlight = (_app, match) => {
			pushes.push(match._id);
		};
		match_automation.fetch_all_location_preparation_selections = async () => ([]);

		const matches = [
			{ _id: 'm1', tournament_key: 't1', setup: { state: 'preparation', preparation_call_timestamp: 10 } },
			{ _id: 'm2', tournament_key: 't1', setup: { state: 'preparation', preparation_call_timestamp: 20 } },
		];
		const app = {
			db: {
				matches: {
					find(query) {
						assert.deepStrictEqual(query, { tournament_key: 't1', 'setup.state': 'preparation' });
						return {
							sort(sortQuery) {
								assert.deepStrictEqual(sortQuery, { 'setup.preparation_call_timestamp': 1 });
								return {
									exec(cb) {
										cb(null, matches);
									}
								};
							}
						};
					},
					findOne(query, cb) {
						cb(null, matches.find((m) => m._id === query._id) || null);
					}
				},
				umpires: {
					find(_query, cb) {
						cb(null, []);
					}
				}
			}
		};

		match_utils.auto_assign_technical_officials_for_preparation_matches(
			app,
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_only' },
			(err) => {
				admin._assign_next_umpire_to_match = original_assign_next_umpire_to_match;
				admin._assign_next_service_judge_to_match = original_assign_next_service_judge_to_match;
				btp_manager.update_highlight = original_update_highlight;
				match_automation.fetch_all_location_preparation_selections = original_fetch_all_location_preparation_selections;
				assert.ifError(err);
				assert.deepStrictEqual(calls, [['umpire', 't1', 'm1'], ['umpire', 't1', 'm2']]);
				assert.deepStrictEqual(pushes, ['m1', 'm2']);
				done();
			}
		);
	});

	_it('adds likely next preparation matches after current preparation matches in when_available mode', (done) => {
		const original_fetch_all_location_preparation_selections = match_automation.fetch_all_location_preparation_selections;
		match_automation.fetch_all_location_preparation_selections = async () => ([
			{
				selected_matches: [
					{ _id: 'm2', tournament_key: 't1', setup: { state: 'scheduled' } },
					{ _id: 'm3', tournament_key: 't1', setup: { state: 'scheduled' } },
				],
			},
		]);

		const app = {
			db: {
				matches: {
					find(query) {
						assert.deepStrictEqual(query, { tournament_key: 't1', 'setup.state': 'preparation' });
						return {
							sort(sortQuery) {
								assert.deepStrictEqual(sortQuery, { 'setup.preparation_call_timestamp': 1 });
								return {
									exec(cb) {
										cb(null, [
											{ _id: 'm1', tournament_key: 't1', setup: { state: 'preparation', preparation_call_timestamp: 10 } },
										]);
									}
								};
							}
						};
					}
				},
				umpires: {
					find(_query, cb) {
						cb(null, []);
					}
				}
			}
		};

		match_utils.fetch_technical_official_assignment_targets(
			app,
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_only' },
			(err, targets) => {
				match_automation.fetch_all_location_preparation_selections = original_fetch_all_location_preparation_selections;
				assert.ifError(err);
				assert.deepStrictEqual(targets.map((match) => match._id), ['m1', 'm2', 'm3']);
				done();
			}
		);
	});

	_it('deduplicates preparation matches against likely next preparation matches', (done) => {
		const original_fetch_all_location_preparation_selections = match_automation.fetch_all_location_preparation_selections;
		match_automation.fetch_all_location_preparation_selections = async () => ([
			{
				selected_matches: [
					{ _id: 'm1', tournament_key: 't1', setup: { state: 'preparation' } },
					{ _id: 'm2', tournament_key: 't1', setup: { state: 'scheduled' } },
				],
			},
		]);

		const app = {
			db: {
				matches: {
					find() {
						return {
							sort() {
								return {
									exec(cb) {
										cb(null, [
											{ _id: 'm1', tournament_key: 't1', setup: { state: 'preparation', preparation_call_timestamp: 10 } },
										]);
									}
								};
							}
						};
					}
				},
				umpires: {
					find(_query, cb) {
						cb(null, []);
					}
				}
			}
		};

		match_utils.fetch_technical_official_assignment_targets(
			app,
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_only' },
			(err, targets) => {
				match_automation.fetch_all_location_preparation_selections = original_fetch_all_location_preparation_selections;
				assert.ifError(err);
				assert.deepStrictEqual(targets.map((match) => match._id), ['m1', 'm2']);
				done();
			}
		);
	});

	_it('fills remaining when_available target slots with global likely matches based on waiting umpires', (done) => {
		const original_fetch_all_location_preparation_selections = match_automation.fetch_all_location_preparation_selections;
		const original_fetch_global_preparation_candidates = match_automation.fetch_global_preparation_candidates;
		match_automation.fetch_all_location_preparation_selections = async (_app, _tkey, options) => {
			assert.strictEqual(options?.ignore_technical_officials_available_rule, true);
			return ([
			{ selected_matches: [] },
		]);
		};
		match_automation.fetch_global_preparation_candidates = async (_app, _tkey, options) => {
			assert.strictEqual(options?.ignore_technical_officials_available_rule, true);
			return ([
			{ _id: 'm10', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm11', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm12', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm13', tournament_key: 't1', setup: { state: 'scheduled' } },
		]);
		};

		const app = {
			db: {
				matches: {
					find() {
						return {
							sort() {
								return {
									exec(cb) {
										cb(null, []);
									}
								};
							}
						};
					}
				},
				umpires: {
					find(query, cb) {
						assert.deepStrictEqual(query, { tournament_key: 't1', umpire_wait: { $ne: null } });
						cb(null, [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }]);
					}
				}
			}
		};

		match_utils.fetch_technical_official_assignment_targets(
			app,
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_only' },
			(err, targets) => {
				match_automation.fetch_all_location_preparation_selections = original_fetch_all_location_preparation_selections;
				match_automation.fetch_global_preparation_candidates = original_fetch_global_preparation_candidates;
				assert.ifError(err);
				assert.deepStrictEqual(targets.map((match) => match._id), ['m10', 'm11', 'm12']);
				done();
			}
		);
	});

	_it('ignores already staffed preparation matches when filling global fallback targets', (done) => {
		const original_fetch_all_location_preparation_selections = match_automation.fetch_all_location_preparation_selections;
		const original_fetch_global_preparation_candidates = match_automation.fetch_global_preparation_candidates;
		match_automation.fetch_all_location_preparation_selections = async () => ([
			{ selected_matches: [] },
		]);
		match_automation.fetch_global_preparation_candidates = async () => ([
			{ _id: 'm10', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm11', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm12', tournament_key: 't1', setup: { state: 'scheduled' } },
			{ _id: 'm13', tournament_key: 't1', setup: { state: 'scheduled' } },
		]);

		const app = {
			db: {
				matches: {
					find() {
						return {
							sort() {
								return {
									exec(cb) {
										cb(null, [
											{
												_id: 'prep-full',
												tournament_key: 't1',
												setup: {
													state: 'preparation',
													preparation_call_timestamp: 10,
													umpire: { _id: 'u-prep' },
												},
											},
										]);
									}
								};
							}
						};
					}
				},
				umpires: {
					find(_query, cb) {
						cb(null, [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }]);
					}
				}
			}
		};

		match_utils.fetch_technical_official_assignment_targets(
			app,
			{ key: 't1', technical_official_auto_assignment_mode: 'when_available', official_rotation_mode: 'umpire_only' },
			(err, targets) => {
				match_automation.fetch_all_location_preparation_selections = original_fetch_all_location_preparation_selections;
				match_automation.fetch_global_preparation_candidates = original_fetch_global_preparation_candidates;
				assert.ifError(err);
				assert.deepStrictEqual(targets.map((match) => match._id), ['m10', 'm11', 'm12']);
				done();
			}
		);
	});

	_it('prefers free courts that match the current tabletoperator queue order', () => {
		const sorted = match_utils.sort_free_courts_for_auto_call(
			[
				{ _id: 'c1', num: 1 },
				{ _id: 'c2', num: 2 },
				{ _id: 'c3', num: 3 },
			],
			[
				{ _id: 'to1', court: null, played_on_court: 'c2', start_ts: 10 },
				{ _id: 'to2', court: null, played_on_court: 'c1', start_ts: 20 },
			],
			{ tabletoperator_enabled: true }
		);

		assert.deepStrictEqual(sorted.map((court) => court._id), ['c2', 'c1', 'c3']);
	});
});
