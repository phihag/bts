'use strict';

var cbts_utils = (function() {

var esc_stack = [];
function esc_stack_push(cancel) {
	esc_stack.push(cancel);
	Mousetrap.bind('escape', function() {
		cancel();
	});
}

function esc_stack_pop() {
	esc_stack.pop();
	Mousetrap.unbind('escape');
	var cancel = esc_stack[esc_stack.length - 1];
	if (esc_stack.length > 0) {
		Mousetrap.bind('escape', function() {
			cancel();
		});
	}
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

return {
	cmp,
	natcmp,
	esc_stack_push,
	esc_stack_pop,
};

})();


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    module.exports = cbts_utils;

    var Mousetrap = null; // Mousetrap library
}
/*/@DEV*/
