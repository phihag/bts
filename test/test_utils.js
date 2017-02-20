'use strict';

var assert = require('assert');

var utils = require('../utils');

describe('utils', function() {
	it('size', function() {
		assert.deepStrictEqual(utils.size({}), 0);
		assert.deepStrictEqual(utils.size({
			a: 0,
			b: 1,
		}), 2);
	});
});
