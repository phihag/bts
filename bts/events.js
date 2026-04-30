'use strict';

const assert = require('assert').strict;

function on_match_change(change_type) {
	assert(['score', 'edit'].includes(change_type));
}

module.exports = {
	on_match_change,
};