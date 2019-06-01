'use strict';

var cumpires = (function() {

function calc_umpire_status(t) {
	if (!t.umpires) return [];
	const umpires_by_name = new Map();
	for (const u of t.umpires) {
		umpires_by_name.set(u.name, u);
		if (u.paused_since_ts) {
			u.status = 'paused';
		} else {
			u.status = 'ready';
		}
	}

	for (const m of t.matches) {
		if (!m.setup.umpire_name) continue;
		const u = umpires_by_name.get(m.setup.umpire_name);
		if (!u) continue;

		if (m.end_ts) {
			if (u.last_on_court_ts) {
				u.last_on_court_ts = Math.max(m.end_ts, u.last_on_court_ts);
			} else {
				u.last_on_court_ts = m.end_ts;
			}
		}
		if (typeof m.team1_won !== 'boolean') {
			u.status = 'oncourt';
		}
	}

	const umpires = Array.from(umpires_by_name.values());
	umpires.sort((u0, u1) => {
		if (!u0.last_on_court_ts && u1.last_on_court_ts) return -1;
		if (u0.last_on_court_ts && !u1.last_on_court_ts) return 1;
		let cmp = utils.cmp_key('last_on_court_ts')(u0, u1);
		if (cmp !== 0) return cmp;
		return utils.cmp_key('name')(u0, u1);
	});
	return umpires;
}

function _ui_render_table(container, umpires, status) {
	const table = uiu.el(container, 'table');
	const tbody = uiu.el(table, 'tbody');
	for (const u of umpires) {
		if (u.status !== status) continue;

		const tr = uiu.el(tbody, 'tr');
		if (curt.is_nation_competition) {
			const flag_td = uiu.el(tr, 'td');
			cmatch.render_flag_el(flag_td, u.nationality);
		}
		uiu.el(tr, 'td', {}, u.name);
		if (status === 'paused') {
			uiu.el(tr, 'td', 'umpires_since',
				(u.paused_since_ts ? ci18n('umpires:paused_since', {time: utils.time_str(u.paused_since_ts)}) : ''));
		}
		uiu.el(tr, 'td', 'umpires_since',
			(u.last_on_court_ts ? ci18n('umpires:last_on_court', {time: utils.time_str(u.last_on_court_ts)}) : ''));
	}
}

function _ui_status_update() {
	const container = uiu.qs('.umpires_status');
	uiu.empty(container);

	cmatch.render_courts(container, 'umpires');

	const umpires = calc_umpire_status(curt);

	uiu.el(container, 'h3', {}, ci18n('umpires:status:ready'));
	_ui_render_table(container, umpires, 'ready');

	uiu.el(container, 'h3', {}, ci18n('umpires:status:paused'));
	_ui_render_table(container, umpires, 'paused');
}

function ui_status() {
	crouting.set('t/:key/umpires', {key: curt.key});
	toprow.set([{
		label: ci18n('Tournaments'),
		func: ctournament.ui_list,
	}, {
		label: curt.name || curt.key,
		func: ctournament.ui_show,
		'class': 'ct_name',
	}, {
		label: ci18n('umpires:status:heading'),
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	uiu.el(main, 'div', 'umpires_status');
	_ui_status_update();
}
crouting.register(/t\/([a-z0-9]+)\/umpires$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_status();
	});
}, change.default_handler(ui_status));


return {
	ui_status,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var ci18n = require('./ci18n.js');
	var change = require('./change.js');
	var cmatch = require('./cmatch.js');
	var crouting = require('./crouting.js');
	var ctournament = require('./ctournament.js');
	var toprow = require('./toprow.js');
	var uiu = require('../bup/js/uiu.js');
	var utils = require('../bup/js/utils.js');

	module.exports = cumpires;
}
/*/@DEV*/
