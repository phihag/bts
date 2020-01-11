const assert = require('assert');
const serror = require('./serror');

let COUNTRIES_TABLE;

function lookup(code) {
	if (!code) return '';

	if (!COUNTRIES_TABLE) {
		let bup_module;
		try {
			bup_module = require('../static/bup/dev/js/countrycodes.js');
		} catch (e) {
			serror.silent_once(`Failed to load country database: ${e.stack}`);
			return code;
		}
		try {
			COUNTRIES_TABLE = bup_module.TABLE;
			assert(COUNTRIES_TABLE);
		} catch(e) {
			serror.silent_once(`Failed to get country name table: ${e.stack}`);
			return code;
		}
	}

	const res = COUNTRIES_TABLE[code];

	if (!res) {
		serror.silent('Unknown country ' + JSON.stringify(code));
	}

	return res || code;
}

module.exports = {
	lookup,
};
