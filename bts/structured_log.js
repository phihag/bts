'use strict';

const assert = require('assert');
const zlib = require('zlib');

const xmldom = require('xmldom');

const serror = require('./serror');

function log(entry) {
	assert(entry.event, 'Every log entry must contain an event');

}

module.exports = {
	log,
};