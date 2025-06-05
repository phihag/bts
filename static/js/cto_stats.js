'use strict';

(function() {

function ui_to_stats() {
	crouting.set('t/:key/to_stats', {key: curt.key});
	toprow.set([{
		label: ci18n('Tournaments'),
		func: ctournament.ui_list,
	}, {
		label: curt.name || curt.key,
		func: ctournament.ui_show,
		'class': 'ct_name',
	}, {
		label: ci18n('to_stats:header'),
		func: ui_to_stats,
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	uiu.el(main, 'h2', {}, ci18n('to_stats:header'));
	uiu.el(main, 'h3', {}, curt.name || curt.key);

	const table = uiu.el(main, 'table', 'table-outlined');
	const thead = uiu.el(table, 'thead');
	const thead_tr = uiu.el(thead, 'tr');
	uiu.el(thead_tr, 'th', {}, 'to_stats:name');
	
}
crouting.register(/t\/([a-z0-9]+)\/to_stats$/, function(m) {
	ctournament.switch_tournament(m[1], function(t) {
		ui_to_stats(t);
	});
}, change.default_handler(ui_to_stats));

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
