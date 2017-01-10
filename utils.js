'use strict';

function size(obj) {
	var res = 0;
	for (var key in obj) {
		if (obj.hasOwnProperty(key)) {
			res++;
		}
	}
	return res;
}

module.exports = {
	size,
};
