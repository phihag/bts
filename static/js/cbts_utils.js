'use strict';

var cbts_utils = (function() {

function cmp(a, b) {
	if (a < b) {
		return -1;
	} else if (a > b) {
		return 1;
	} else {
		return 0;
	}
}

return {
	cmp,
};

})();


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    module.exports = cbts_utils;
}
/*/@DEV*/
