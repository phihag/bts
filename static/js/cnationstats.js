'use strict';

(function() {

function ui_nationstats() {
	crouting.set('t/' + curt.key + '/nationstats');
	toprow.set([{
		label: ci18n('Tournaments'),
		func: ctournament.ui_list,
	}, {
		label: curt.name || curt.key,
		func: ctournament.ui_show,
		'class': 'ct_name',
	}, {
		label: ci18n('nationstats'),
		func: ctournament.ui_show,
		'class': 'ct_name',
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);
	const container = main;

	const all_players = new Map();
	for (const m of curt.matches) {
		for (const t of m.setup.teams) {
			for (const p of t.players) {
				all_players.set(p.name, p);
			}
		}
	}

	const by_nation = new Map();
	for (const p of all_players.values()) {
		const nationality = p.nationality || 'unknown';
		let cur = by_nation.get(nationality);
		if (!cur) {
			cur = [];
			by_nation.set(nationality, cur);
		}
		cur.push(p);
	}

	uiu.el(container, 'div', {}, ci18n('nationstats:summary', {
		player_count: all_players.size,
		nation_count: by_nation.size,
	}));

	const nation_counts = Array.from(by_nation.entries()).map(([nationality, players]) => {
		return {
			nationality,
			count: players.length,
		};
	});
	nation_counts.sort((n1, n2) => {
		const count_cmp = utils.cmp(n2.count, n1.count);
		if (count_cmp != 0) return count_cmp;
		return utils.cmp(n1.nationality, n2.nationality);
	});
	
	const table = uiu.el(container, 'table', {
		'class': 'nationstats_table',
		style: 'border-collapse:collapse;',
	});
	const tbody = uiu.el(table, 'tbody');
	for (const nc of nation_counts) {
		const tr = uiu.el(tbody, 'tr');

		const flag_td = uiu.el(tr, 'td');
		cflags.render_flag_el(flag_td, nc.nationality);

		uiu.el(tr, 'td', {
			style: 'text-align:left;',
		}, countries.lookup(nc.nationality));

		uiu.el(tr, 'td', {style: 'text-align:right;font-weight:bold;padding:0 0.6em;'}, nc.count);
	}

	console.log(curt.umpires);
}
crouting.register(/t\/([a-z0-9]+)\/nationstats$/, function(m) {
	ctournament.switch_tournament(m[1], function(t) {
		ui_nationstats(t);
	});
}, change.default_handler(ui_nationstats));

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cflags = require('./cflags');
	var change = require('./change');
	var ctournament = require('./ctournament');
	var ci18n = require('./ci18n');
	var countries = require('./countries');
	var crouting = require('./crouting');
	var toprow = require('./toprow');
	var uiu = require('../bup/js/uiu');
	var utils = require('../bup/bup/js/utils.js');

	module.exports = {};
}
/*/@DEV*/
