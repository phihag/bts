'use strict';

const assert = require('assert');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const utils = require('../utils');


_describe('utils', function() {
	_it('size', function() {
		assert.deepStrictEqual(utils.size({}), 0);
		assert.deepStrictEqual(utils.size({
			a: 0,
			b: 1,
		}), 2);
	});
});
