const serror = require('./serror');

const {COUNTRIES_TABLE} = require('../static/js/countries.js');

function lookup(code) {
	var res = COUNTRIES_TABLE[code];

	if (!res) {
		serror.silent('Unknown country ' + JSON.stringify(code));
	}

	return res || code;
}

module.exports = {
	lookup,
};
