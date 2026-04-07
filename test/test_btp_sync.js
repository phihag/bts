'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const btp_sync = require('../bts/btp_sync');

_describe('btp_sync', () => {
	_it('normalizes standard scoring formats from BTP fields', () => {
		const normalized = btp_sync._normalize_scoring_format({
			ID: ['10'],
			Name: ['Best of 3 to 21'],
			NumSets: ['3'],
			SetType: ['0'],
			LastSetType: ['0'],
			Score: ['21'],
			IsDefault: [true],
		});

		assert.deepStrictEqual(normalized, {
			id: 10,
			name: 'Best of 3 to 21',
			numSets: 3,
			score: 21,
			isDefault: true,
			setType: 0,
			lastSetType: 0,
			set_points: {
				end_points: 21,
				max_points: 30,
				end_points_editable: false,
				max_points_editable: false,
				interval_at: 11,
				interval_duration_ms: 60000,
				break_before_set_duration_ms: 120000,
			},
			last_set_points: {
				end_points: 21,
				max_points: 30,
				end_points_editable: false,
				max_points_editable: false,
				interval_at: 11,
				interval_duration_ms: 60000,
				break_before_set_duration_ms: 120000,
			},
		});
	});

	_it('normalizes editable scoring formats using the score fallback', () => {
		const normalized = btp_sync._normalize_scoring_format({
			ID: ['11'],
			Name: ['Custom 1x17'],
			NumSets: ['1'],
			SetType: ['999'],
			LastSetType: ['999'],
			Score: ['17'],
			IsDefault: [false],
		});

		assert.deepStrictEqual(normalized.set_points, {
			end_points: 17,
			max_points: 17,
			end_points_editable: false,
			max_points_editable: true,
			defaults_from_score: true,
			interval_at: 9,
			interval_duration_ms: 60000,
			break_before_set_duration_ms: 120000,
		});
		assert.deepStrictEqual(normalized.last_set_points, {
			end_points: 17,
			max_points: 17,
			end_points_editable: false,
			max_points_editable: true,
			defaults_from_score: true,
			interval_at: 9,
			interval_duration_ms: 60000,
			break_before_set_duration_ms: 120000,
		});
	});

	_it('normalizes fully editable set rules for set type 1000', () => {
		const normalized = btp_sync._normalize_scoring_format({
			ID: ['13'],
			Name: ['Custom free'],
			NumSets: ['3'],
			SetType: ['1000'],
			LastSetType: ['1000'],
			Score: ['0'],
			IsDefault: [false],
		});

		assert.deepStrictEqual(normalized.set_points, {
			end_points: 1,
			max_points: 1,
			end_points_editable: true,
			max_points_editable: true,
			interval_at: 1,
			interval_duration_ms: 60000,
			break_before_set_duration_ms: 120000,
		});
		assert.deepStrictEqual(normalized.last_set_points, {
			end_points: 1,
			max_points: 1,
			end_points_editable: true,
			max_points_editable: true,
			interval_at: 1,
			interval_duration_ms: 60000,
			break_before_set_duration_ms: 120000,
		});
	});

	_it('defaults interval point to rounded-up half of end points', () => {
		const normalized = btp_sync._normalize_scoring_format({
			ID: ['14'],
			Name: ['Custom 1x15'],
			NumSets: ['1'],
			SetType: ['999'],
			LastSetType: ['999'],
			Score: ['15'],
			IsDefault: [false],
		});

		assert.strictEqual(normalized.set_points.interval_at, 8);
		assert.strictEqual(normalized.last_set_points.interval_at, 8);
	});

	_it('sanitizes end_points to be at least 1 and max_points to be at least end_points', () => {
		const sanitized = btp_sync._sanitize_scoring_format({
			id: 99,
			name: 'Broken',
			numSets: 1,
			score: 0,
			isDefault: false,
			setType: 1000,
			lastSetType: 1000,
			set_points: {
				end_points: 0,
				max_points: 0,
			},
			last_set_points: {
				end_points: -5,
				max_points: 2,
			},
		});

		assert.strictEqual(sanitized.set_points.end_points, 1);
		assert.strictEqual(sanitized.set_points.max_points, 1);
		assert.strictEqual(sanitized.last_set_points.end_points, 1);
		assert.strictEqual(sanitized.last_set_points.max_points, 2);
	});

	_it('normalizes different rules for the last set', () => {
		const normalized = btp_sync._normalize_scoring_format({
			ID: ['12'],
			Name: ['2x21+11'],
			NumSets: ['3'],
			SetType: ['0'],
			LastSetType: ['304'],
			Score: ['21'],
			IsDefault: [false],
		});

		assert.deepStrictEqual(normalized.set_points, {
			end_points: 21,
			max_points: 30,
			end_points_editable: false,
			max_points_editable: false,
			interval_at: 11,
			interval_duration_ms: 60000,
			break_before_set_duration_ms: 120000,
		});
			assert.deepStrictEqual(normalized.last_set_points, {
				end_points: 11,
				max_points: 15,
				end_points_editable: false,
				max_points_editable: false,
				interval_at: 6,
				interval_duration_ms: 60000,
				break_before_set_duration_ms: 120000,
			});
		});

	_it('provides a complete 3x21 fallback scoring format', () => {
		const normalized = btp_sync._fallback_scoring_format();

		assert.deepStrictEqual(normalized, {
			id: null,
			name: '3x21',
			numSets: 3,
			score: 21,
			isDefault: false,
			setType: 0,
			lastSetType: 0,
			set_points: {
				end_points: 21,
				max_points: 30,
				end_points_editable: false,
				max_points_editable: false,
				interval_at: 11,
				interval_duration_ms: 60000,
				break_before_set_duration_ms: 120000,
			},
			last_set_points: {
				end_points: 21,
				max_points: 30,
				end_points_editable: false,
				max_points_editable: false,
				interval_at: 11,
				interval_duration_ms: 60000,
				break_before_set_duration_ms: 120000,
			},
		});
	});

	_it('keeps the local court on finished matches when BTP no longer sends a court', () => {
		const currentMatch = {
			team1_won: true,
			btp_winner: 1,
			btp_needsync: false,
			setup: {
				court_id: 'court_7',
				now_on_court: false,
				state: 'finished',
				teams: [{ players: [] }, { players: [] }],
			},
		};
		const btpMatch = {
			setup: {
				now_on_court: false,
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
			},
		};

		const merged = btp_sync._merge_local_match_into_btp_match(currentMatch, structuredClone(btpMatch));

		assert.strictEqual(merged.setup.state, 'finished');
		assert.strictEqual(merged.setup.court_id, 'court_7');
	});

	_it('keeps locally edited timing values when BTP scoring formats are normalized again', () => {
		const existing = {
			id: 11,
			name: 'Custom 1x17',
			numSets: 1,
			score: 17,
			isDefault: false,
			setType: 999,
			lastSetType: 999,
			set_points: {
				end_points: 17,
				max_points: 19,
				end_points_editable: false,
				max_points_editable: true,
				defaults_from_score: true,
				interval_at: 9,
				interval_duration_ms: 45000,
				break_before_set_duration_ms: 30000,
				interval_enabled: false,
			},
			last_set_points: {
				end_points: 17,
				max_points: 21,
				end_points_editable: false,
				max_points_editable: true,
				defaults_from_score: true,
				interval_at: 8,
				interval_duration_ms: 40000,
				break_before_set_duration_ms: 35000,
				interval_enabled: true,
			},
		};

		const normalized = btp_sync._normalize_scoring_format({
			ID: ['11'],
			Name: ['Custom 1x17'],
			NumSets: ['1'],
			SetType: ['999'],
			LastSetType: ['999'],
			Score: ['17'],
			IsDefault: [false],
		});

		const merged = btp_sync._merge_local_scoring_format(existing, normalized);

		assert.strictEqual(merged.set_points.end_points, 17);
		assert.strictEqual(merged.set_points.max_points, 19);
		assert.strictEqual(merged.set_points.interval_at, 9);
		assert.strictEqual(merged.set_points.interval_duration_ms, 45000);
		assert.strictEqual(merged.set_points.break_before_set_duration_ms, 30000);
		assert.strictEqual(merged.set_points.interval_enabled, false);
		assert.strictEqual(merged.last_set_points.max_points, 21);
		assert.strictEqual(merged.last_set_points.interval_at, 8);
		assert.strictEqual(merged.last_set_points.interval_duration_ms, 40000);
		assert.strictEqual(merged.last_set_points.break_before_set_duration_ms, 35000);
		assert.strictEqual(merged.last_set_points.interval_enabled, true);
	});

	_it('ignores stale suppressed officials once the local match is no longer pending BTP sync', () => {
		const currentMatch = {
			btp_needsync: false,
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				suppressed_umpire_btp_id: 6,
			},
		};
		const btpMatch = {
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				umpire: {
					_id: 'default_btp_6',
					btp_id: 6,
					name: 'Michael G-Punkt',
				},
			},
		};

		const merged = btp_sync._merge_local_match_into_btp_match(currentMatch, structuredClone(btpMatch));

		assert.ok(merged.setup.umpire);
		assert.strictEqual(merged.setup.umpire.btp_id, 6);
		assert.strictEqual(merged.setup.suppressed_umpire_btp_id, undefined);
	});

	_it('keeps suppressed officials hidden while a local match update is still pending sync', () => {
		const currentMatch = {
			btp_needsync: true,
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				suppressed_umpire_btp_id: 6,
			},
		};
		const btpMatch = {
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				umpire: {
					_id: 'default_btp_6',
					btp_id: 6,
					name: 'Michael G-Punkt',
				},
			},
		};

		const merged = btp_sync._merge_local_match_into_btp_match(currentMatch, structuredClone(btpMatch));

		assert.strictEqual(merged.setup.umpire, undefined);
		assert.strictEqual(merged.setup.suppressed_umpire_btp_id, 6);
	});

	_it('ignores stale suppressed service judges once the local match is no longer pending BTP sync', () => {
		const currentMatch = {
			btp_needsync: false,
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				suppressed_service_judge_btp_id: 7,
			},
		};
		const btpMatch = {
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				service_judge: {
					_id: 'default_btp_7',
					btp_id: 7,
					name: 'Service Judge',
				},
			},
		};

		const merged = btp_sync._merge_local_match_into_btp_match(currentMatch, structuredClone(btpMatch));

		assert.ok(merged.setup.service_judge);
		assert.strictEqual(merged.setup.service_judge.btp_id, 7);
		assert.strictEqual(merged.setup.suppressed_service_judge_btp_id, undefined);
	});

	_it('does not restore role capability flags from match references during reconcile', (done) => {
		const official = {
			_id: 'o1',
			tournament_key: 't1',
			btp_id: 11,
			firstname: 'Stefan',
			surname: 'Schiedsrichter',
			name: 'Stefan Schiedsrichter',
			is_umpire: false,
			is_service_judge: true,
			is_planed_as_umpire: false,
			is_planed_as_service_judge: false,
			umpire_on_court: null,
			service_judge_on_court: null,
			umpire_wait: null,
			service_judge_wait: 123,
			umpire_pause: null,
			service_judge_pause: null,
			inactive_list: null,
		};
		const match = {
			_id: 'm1',
			tournament_key: 't1',
			setup: {
				now_on_court: false,
				umpire: {
					_id: 'o1',
					btp_id: 11,
					firstname: 'Stefan',
					surname: 'Schiedsrichter',
					name: 'Stefan Schiedsrichter',
				}
			}
		};
		const state = {
			matches: [structuredClone(match)],
			umpires: [structuredClone(official)]
		};
		const app = {
			db: {
				matches: {
					find(query, cb) {
						cb(null, state.matches);
					}
				},
				umpires: {
					find(query, cb) {
						cb(null, state.umpires);
					},
					insert(doc, cb) {
						state.umpires.push(doc);
						cb(null, doc);
					},
					update(query, update, options, cb) {
						const idx = state.umpires.findIndex((u) => u._id === query._id);
						state.umpires[idx] = { ...state.umpires[idx], ...update.$set };
						cb(null, 1, state.umpires[idx]);
					}
				}
			}
		};

		btp_sync._reconcile_match_officials(app, 't1', (err) => {
			assert.ifError(err);
			assert.strictEqual(state.umpires[0].is_umpire, false);
			assert.strictEqual(state.umpires[0].is_service_judge, true);
			done();
		});
	});

	_it('keeps a local umpire assignment only while the match update is still pending sync', () => {
		const pendingCurrentMatch = {
			btp_needsync: true,
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				umpire: {
					_id: 'default_btp_6',
					btp_id: 6,
					name: 'Michael G-Punkt',
				},
			},
		};
		const staleCurrentMatch = {
			btp_needsync: false,
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
				umpire: {
					_id: 'default_btp_6',
					btp_id: 6,
					name: 'Michael G-Punkt',
				},
			},
		};
		const btpMatchWithoutOfficial = {
			setup: {
				state: 'scheduled',
				teams: [{ players: [] }, { players: [] }],
			},
		};

		const pendingMerged = btp_sync._merge_local_match_into_btp_match(pendingCurrentMatch, structuredClone(btpMatchWithoutOfficial));
		const staleMerged = btp_sync._merge_local_match_into_btp_match(staleCurrentMatch, structuredClone(btpMatchWithoutOfficial));

		assert.ok(pendingMerged.setup.umpire);
		assert.strictEqual(staleMerged.setup.umpire, undefined);
	});

	_it('clears stale planned and on-court flags when an official is no longer referenced by matches', () => {
		const refState = btp_sync._build_official_reference_state([]);
		const patch = btp_sync._compute_official_visibility_patch({
			_id: 'default_btp_6',
			btp_id: 6,
			is_umpire: true,
			is_service_judge: true,
			is_planed_as_umpire: true,
			is_planed_as_service_judge: false,
			umpire_on_court: 'default_1',
			service_judge_on_court: null,
			umpire_wait: null,
			service_judge_wait: null,
			umpire_pause: null,
			service_judge_pause: null,
			inactive_list: null,
		}, refState);

		assert.strictEqual(patch.is_planed_as_umpire, false);
		assert.strictEqual(patch.umpire_on_court, null);
		assert.strictEqual(patch.umpire_wait != null, true);
		assert.strictEqual(patch.service_judge_wait, null);
		assert.strictEqual(patch.inactive_list, null);
	});

	_it('moves inactive officials back to wait when they are active-capable and no longer referenced', () => {
		const refState = btp_sync._build_official_reference_state([]);
		const patch = btp_sync._compute_official_visibility_patch({
			_id: 'default_btp_6',
			btp_id: 6,
			is_umpire: true,
			is_service_judge: false,
			is_planed_as_umpire: false,
			is_planed_as_service_judge: false,
			umpire_on_court: null,
			service_judge_on_court: null,
			umpire_wait: null,
			service_judge_wait: null,
			umpire_pause: null,
			service_judge_pause: null,
			inactive_list: 12345,
		}, refState);

		assert.strictEqual(patch.umpire_wait != null, true);
		assert.strictEqual(patch.service_judge_wait, null);
		assert.strictEqual(patch.inactive_list, null);
	});

	_it('preserves planned flags when an official is still referenced by a scheduled match', () => {
		const refState = btp_sync._build_official_reference_state([{
			setup: {
				state: 'scheduled',
				now_on_court: false,
				umpire: { _id: 'default_btp_6', btp_id: 6 },
			},
		}]);
		const patch = btp_sync._compute_official_visibility_patch({
			_id: 'default_btp_6',
			btp_id: 6,
			is_planed_as_umpire: true,
			is_planed_as_service_judge: false,
			umpire_on_court: null,
			service_judge_on_court: null,
			umpire_wait: null,
			service_judge_wait: null,
			umpire_pause: null,
			service_judge_pause: null,
			inactive_list: null,
		}, refState);

		assert.deepStrictEqual(patch, {});
	});

	_it('does not treat finished-match officials as still referenced for visibility', () => {
		const refState = btp_sync._build_official_reference_state([{
			team1_won: true,
			setup: {
				state: 'finished',
				now_on_court: false,
				umpire: { _id: 'default_btp_5', btp_id: 5 },
			},
		}]);
		const patch = btp_sync._compute_official_visibility_patch({
			_id: 'default_btp_5',
			btp_id: 5,
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
			inactive_list: 12345,
		}, refState);

		assert.strictEqual(patch.umpire_wait != null, true);
		assert.strictEqual(patch.service_judge_wait, null);
		assert.strictEqual(patch.inactive_list, null);
	});

	_it('reuses an existing official by canonical _id when btp_id is missing locally', () => {
		const existing = {
			_id: 'default_btp_6',
			tournament_key: 'default',
			btp_id: null,
			name: 'Michael G-Punkt',
		};

		const found = btp_sync._find_existing_official_for_btp_import([existing], 'default', 6);

		assert.strictEqual(found, existing);
	});
	});
