'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const utils = require('../bts/utils');


_describe('utils', function() {
	_it('size', function() {
		assert.deepStrictEqual(utils.size({}), 0);
		assert.deepStrictEqual(utils.size({
			a: 0,
			b: 1,
		}), 2);
	});

	_it('root_dir', function(done) {
		const this_fn = path.join(utils.root_dir(), 'test', 'test_utils.js');
		fs.stat(this_fn, done);
	});

	_it('encode_html', function() {
		assert.strictEqual(utils.encode_html('<"a>b<"a>b'), '&lt;&quot;a&gt;b&lt;&quot;a&gt;b');
	});
});
