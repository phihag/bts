'use strict';

const assert = require('assert');

function log(entry) {
	assert(entry.event, 'Every log entry must contain an event');

}

module.exports = {
	log,
};