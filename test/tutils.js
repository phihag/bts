'use strict';

// Make linter happy
/*global describe:false, it:false*/

// Trivial runner
const _describe = ((typeof describe == 'undefined') ?
	function(s, f) {f();} :
	describe
);
const _it = ((typeof it == 'undefined') ?
	function(s, f) {f();} :
	it
);

const assert = require('assert').strict;
const path = require('path');
const {deep_equal} = require('../static/bup/dev/js/utils.js');


async function assert_snapshot(dirname, test_name, actual) {
	assert(actual !== undefined);

	const file_name = path.join(dirname, `${test_name}.snapshot.json`);
	let expected;
	try {
		const contents = await fs.promises.readFile(file_name, 'utf-8');
		expected = JSON.parse(contents);
	} catch (e) {
		expected = `(Error while reading ${file_name}: ${e})`;
	}

	if (! bup.utils.deep_equal(actual, expected)) {
		const actual_json = JSON.stringify(actual, undefined, 2);
		await fs.promises.writeFile(file_name, actual_json);
		assert.deepStrictEqual(actual, expected);
	}
}


module.exports = {
	assert_snapshot,
	_describe,
	_it,
};
