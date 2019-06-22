var countries = (function() { // eslint-disable-line no-unused-vars

function lookup(code) {
	const res = countrycodes.TABLE[code];
	if (!res && (code !== 'unknown')) {
		cerror.silent('Unknown country ' + JSON.stringify(code));
	}
	return res || code;
}

return {
	lookup,
};
})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var countrycodes = require('../bup/js/countrycodes');

	module.exports = countries;
}
/*/@DEV*/
