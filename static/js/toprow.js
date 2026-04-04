'use strict';

var toprow = (function() {

function update_container(container, elems, with_sep) {
	uiu.empty(container);

	elems.forEach(function(el, idx) {
		if ((idx > 0) && (with_sep)) {
			uiu.el(container, 'span', 'toprow_sep', '>');
		}

		if (el.class === 'toprow_menu_separator') {
			uiu.el(container, 'div', 'toprow_menu_separator');
			return;
		}

		if (el.items && Array.isArray(el.items)) {
			const menu = uiu.el(container, 'div', 'toprow_menu');
			uiu.el(menu, 'span', 'toprow_link vlink toprow_menu_label', el.label);
			const dropdown = uiu.el(menu, 'div', 'toprow_menu_dropdown');
			el.items.forEach(function(item) {
				if (item.class === 'toprow_menu_separator') {
					uiu.el(dropdown, 'div', 'toprow_menu_separator');
					return;
				}
				const item_attrs = {
					'class': 'toprow_menu_item' + ((item.func || item.href) ? ' vlink' : '') + (item.class ? (' ' + item.class) : ''),
				};
				if (item.href) {
					item_attrs.href = item.href;
				}
				const item_el = uiu.el(dropdown, (item.href ? 'a' : 'span'), item_attrs, item.label);
				if (item.func) {
					item_el.addEventListener('click', item.func);
				}
			});
			return;
		}

		const css_class = 'toprow_link' + ((el.func || el.href) ? ' vlink' : '') + (el.class ? (' ' + el.class) : '');
		const attrs = {
			'class': css_class,
		};

		if (el.href) {
			attrs.href = el.href;
		}

		const link = uiu.el(container, (el.href ? 'a' : 'span'), attrs, el.label);
		if (el.func) {
			link.addEventListener('click', el.func);
		}
	});
}

function set(elems, right_elems) {
	const left = uiu.qs('.toprow');
	uiu.show(left);
	update_container(left, elems, true);

	const right = uiu.el(left, 'div', 'toprow_right');
	if (!right_elems) {
		right_elems = [];
	}
	update_container(right, right_elems, false);
}

function hide() {
	const toprow = uiu.qs('.toprow');
	uiu.hide(toprow);
}

function link(href) {
	return function follow_link() {
		location.href = href;
	};
}

return {
	link,
	hide,
	set,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var uiu = require('./uiu');

    module.exports = toprow;
}
/*/@DEV*/
