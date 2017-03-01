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

function pluck(obj, keys) {
	var res = {};
	keys.forEach(function(k) {
		if (obj.hasOwnProperty(k)) {
			res[k] = obj[k];
		}
	});
	return res;
}


module.exports = {
	size,
	pluck,
};
