'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const match_scoring = require('../static/js/match_scoring');

_describe('cmatch', () => {
	_it('detects match end for default 3x21 fallback', () => {
		assert.strictEqual(match_scoring.is_match_over([[21, 10], [21, 18]], null), true);
		assert.strictEqual(match_scoring.is_match_over([[21, 10], [18, 21]], null), false);
	});

	_it('detects match end for 1x21 scoring format', () => {
		const scoringFormat = {
			numSets: 1,
			set_points: { end_points: 21, max_points: 30 },
			last_set_points: { end_points: 21, max_points: 30 },
		};

		assert.strictEqual(match_scoring.is_match_over([[21, 19]], scoringFormat), true);
		assert.strictEqual(match_scoring.is_match_over([[20, 19]], scoringFormat), false);
	});

	_it('uses last-set limits for deciding the final set', () => {
		const scoringFormat = {
			numSets: 3,
			set_points: { end_points: 21, max_points: 30 },
			last_set_points: { end_points: 11, max_points: 15 },
		};

		assert.strictEqual(match_scoring.is_match_over([[21, 18], [19, 21], [11, 9]], scoringFormat), true);
		assert.strictEqual(match_scoring.is_match_over([[21, 18], [19, 21], [10, 9]], scoringFormat), false);
	});
});
