'use strict';

var toprow = (function() {
function set(elems) {
	var container = uiu.qs('.toprow');
	uiu.empty(container);

	elems.forEach(function(el, idx) {
		if (idx > 0) {
			uiu.create_el(container, 'span', 'toprow_sep', '>');
		}

		var link = uiu.create_el(container, 'span', 'toprow_link' + (el.func ? ' vlink' : ''), el.label);
		if (el.func) {
			link.addEventListener('click', el.func);
		}
	});
}

return {
	set: set,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var uiu = require('./uiu');

    module.exports = toprow;
}
/*/@DEV*/
