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

module.exports = {
	_describe,
	_it,
};
