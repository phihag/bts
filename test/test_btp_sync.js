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
	});
