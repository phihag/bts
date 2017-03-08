'use strict';

var toprow = (function() {

function update_container(container, elems, with_sep) {
	uiu.empty(container);

	elems.forEach(function(el, idx) {
		if ((idx > 0) && (with_sep)) {
			uiu.create_el(container, 'span', 'toprow_sep', '>');
		}

		const css_class = 'toprow_link' + ((el.func || el.href) ? ' vlink' : '') + (el.class ? (' ' + el.class) : '');
		const attrs = {
			'class': css_class,
		};

		if (el.href) {
			attrs.href = el.href;
		}

		const link = uiu.create_el(container, (el.href ? 'a' : 'span'), attrs, el.label);
		if (el.func) {
			link.addEventListener('click', el.func);
		}
	});
}

function set(elems, right_elems) {
	const left = uiu.qs('.toprow');
	update_container(left, elems, true);

	const right = uiu.el(left, 'div', 'toprow_right');
	if (!right_elems) {
		right_elems = [];
	}
	update_container(right, right_elems, false);
}

function link(href) {
	return function follow_link() {
		location.href = href;
	};
}

return {
	link,
	set,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var uiu = require('./uiu');

    module.exports = toprow;
}
/*/@DEV*/
