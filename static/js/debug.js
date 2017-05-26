'use strict';

var debug = (function() {
const DEBUG_ENABLED = true;

function log(...args) {
	if (DEBUG_ENABLED) {
		console.log(...args); // eslint-disable-line no-console
	}
}

return {
	log,
};

})();


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	module.exports = debug;
}
/*/@DEV*/
