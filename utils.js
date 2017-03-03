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

function cmp(a, b) {
	if (a < b) {
		return -1;
	} else if (a > b) {
		return 1;
	} else {
		return 0;
	}
}

function cmp_key(key) {
	return function(o1, o2) {
		const v1 = o1[key];
		const v2 = o2[key];
		return cmp(v1, v2);
	};
}

function natcmp(as, bs){
	var a, b, a1, b1, i= 0, n, L;
	var rx = /(\.\d+)|(\d+(\.\d+)?)|([^\d.]+)|(\.\D+)|(\.$)/g;
	if (as=== bs) {
		return 0;
	}
	a = as.toLowerCase().match(rx);
	b = bs.toLowerCase().match(rx);
	L = a.length;
	while (i<L){
		if (!b[i]) {
			return 1;
		}
		a1 = a[i];
		b1 = b[i++];
		if (a1 !== b1){
			n = a1-b1;
			if (!isNaN(n)) {
				return n;
			}
		return a1>b1? 1:-1;
		}
	}
	return b[i] ? -1:0;
}

module.exports = {
	cmp,
	cmp_key,
	natcmp,
	pluck,
	size,
};
