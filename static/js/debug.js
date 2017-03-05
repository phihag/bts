'use strict';

var debug = (function() {
function log(...args) {
	console.log(...args); // eslint-disable-line no-console
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
