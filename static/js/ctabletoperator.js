'use strict';

var ctabletoperator = (function() {

function render_unassigned(container) {
	uiu.empty(container);
	uiu.el(container, 'h3', {}, ci18n('tabletoperator:unassigned'));

	const unassigned_tabletoperators = curt.tabletoperators.filter(m => m.court == null);
	render_tabletoperator_table(container, unassigned_tabletoperators);
	}

function render_tabletoperator_table(container, tabletoperators) {
	
	const table = uiu.el(container, 'table', 'tabletoperators_table');
	render_tabletoperator_table_header(table);
	const tbody = uiu.el(table, 'tbody');

	for (const t of tabletoperators) {
		const tr = uiu.el(tbody, 'tr');
		render_tabletoperator_row(tr, t);
	}
}

function render_tabletoperator_table_header(table) {
	const thead = uiu.el(table, 'thead');
	const title_tr = uiu.el(thead, 'tr');
	uiu.el(title_tr, 'th', {}, ci18n('tabletoperator:name'));
}
function render_tabletoperator_row(tr, tabletoperator) {
	const to = tabletoperator.tabletoperator;
	const to_td = uiu.el(tr, 'td');
	uiu.el(to_td, 'div', 'tablet', '');
	uiu.el(to_td, 'span', 'match_no_umpire', to[0].name);
	if (to.length > 1) {
		uiu.el(to_td, 'span', 'match_no_umpire', ' \u200B/ ');
		uiu.el(to_td, 'span', 'match_no_umpire', to[1].name);
	}
	if (tabletoperator.court == null) {
		const buttonbar = uiu.el(tr, 'td');
		create_tabletoperator_button(buttonbar, 'vlink tabletoperator_remove_button', 'tabletoperator:remove', on_remove_from_list_button_click, tabletoperator._id);
	}
}
function on_remove_from_list_button_click(e) {
	const to = fetchTabletOperatorFromEvent(e);
	if (to != null) {
		send({
			type: 'tabletoperator_remove',
			tournament_key: curt.key,
			tabletoperator: to,
		}, err => {
			if (err) {
				return cerror.net(err);
			}
		});
	}
}

function fetchTabletOperatorFromEvent(e) {
	const btn = e.target;
	const to_id = btn.getAttribute('data-tabletoperator_id');
	const to = utils.find(curt.tabletoperators, to => to._id === to_id);
	if (!to) {
		cerror.silent('Tabletoperator ' + to_id + ' konnte nicht gefunden werden');
		return null;
	} else {
		return to;
	}
}
function create_tabletoperator_button(targetEl, cssClass, title, listener, tabletoperatorID) {
	const btn = uiu.el(targetEl, 'div', {
		'class': cssClass,
		'title': ci18n(title),
		'data-tabletoperator_id': tabletoperatorID,
	});
	btn.addEventListener('click', listener);
}
//crouting.register(/t\/([a-z0-9]+)\/umpires$/, function(m) {
//	ctournament.switch_tournament(m[1], function() {
//		render_unassigned();
//	});
//}, change.default_handler(render_unassigned));


return {
	render_unassigned,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cflags = require('./cflags');
	var ci18n = require('./ci18n.js');
	var change = require('./change.js');
	var cmatch = require('./cmatch.js');
	var crouting = require('./crouting.js');
	var ctournament = require('./ctournament.js');
	var toprow = require('./toprow.js');
	var uiu = require('../bup/js/uiu.js');
	var utils = require('../bup/js/utils.js');

	module.exports = ctabletoperator;
}
/*/@DEV*/
