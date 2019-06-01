'use strict';

var ccsvexport = (function() {

function make_csv(table) {
	return table.map(row => {
		return row.map(val => {
			const str = '' + val;
			if (/^[-_a-z0-9A-Z]+$/.test(str)) {
				return str;
			}
			return '"' + str.replace('"', '""') + '"';
		});
	}).join('\r\n');
}

function export_winners() {
	const today = utils.iso8601(new Date());
	const header = [
		'Altersklasse', 'Geschlecht', 'Disziplin', 'Platzierung',
		'Vorname1', 'Nachname1', 'Vorname1', 'Vorname2', 'Ansetzung', 'Ende'];
	const table = [];
	for (const match of curt.matches) {
		if (typeof match.team1_won !== 'boolean') continue;
		if (!/HF|Finale/.test(match.setup.match_name)) continue;
		if (match.setup.scheduled_date_str !== today) continue;
		const is_semifinals = /HF/.test(match.setup.match_name);

		const event_m = /([A-Z]+)\s*([OU]\s*[0-9]+)/.exec(match.setup.event_name);
		const age_group = event_m ? event_m[2] : '';
		const discipline = event_m ? event_m[1] : '';
		const gender = {
			'DD': 'Damen',
			'DE': 'Damen',
			'HD': 'Herren',
			'HE': 'Herren',
		}[discipline] || '';

		let teams;
		if (is_semifinals) {
			teams = [match.setup.teams[match.team1_won ? 1 : 0]];
		} else {
			teams = match.setup.teams;
		}
		let team_idx = 0;
		for (const team of teams) {
			const firstname1 = team.players[0].firstname;
			const lastname1 = team.players[0].lastname;
			let place = 3;
			if (!is_semifinals) {
				place = (match.team1_won == (team_idx == 0)) ? 1 : 2;
			}

			let firstname2 = '';
			let lastname2 = '';
			if (team.players.length === 2) {
				firstname2 = team.players[1].firstname;
				lastname2 = team.players[1].lastname;
			}

			table.push([
				age_group, gender, discipline, place,
				firstname1, lastname1, firstname2, lastname2,
				match.setup.scheduled_time_str,
				match.end_ts ? utils.time_str(match.end_ts) : '']);
			team_idx++;
		}
	}

	table.sort((rowa, rowb) => {
		const enda = rowa[9], endb = rowb[9];
		if (enda && !endb) return -1;
		if (!enda && endb) return 1;

		let cmp;
		if (enda && endb) {
			cmp = cbts_utils.natcmp(enda, endb);
			if (cmp !== 0) return cmp;
		}

		// age group
		cmp = cbts_utils.natcmp(rowa[0], rowb[0]);
		if (cmp !== 0) return cmp;

		// discipline
		cmp = cbts_utils.natcmp(rowa[1], rowb[1]);
		if (cmp !== 1) return cmp;

		// place
		return cbts_utils.natcmp('' + rowa[3], '' + rowb[3]);
	});


	table.unshift(header);
	const csv = make_csv(table);
	const blob = new Blob([csv], {type: 'text/csv'});
	save_file(blob, 'urkunden.csv');
}

return {
	export_winners,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var calc = require('../bup/js/calc');
	var displaymode = require('../bup/js/displaymode');
	var cbts_utils = require('./cbts_utils');
	var cerror = require('./cerror');
	var change = require('./change');
	var ci18n = require('./ci18n');
	var cmatch = require('./cmatch');
	var countries = require('./countries');
	var crouting = require('./crouting');
	var cumpires = require('./cumpires');
	var debug = require('./debug');
	var form_utils = require('./form_utils');
	var i18n = require('../bup/js/i18n');
	var i18n_de = require('../bup/js/i18n_de');
	var i18n_en = require('../bup/js/i18n_en');
	var printing = require('../bup/js/printing');
	var pronunciation = require('../bup/js/pronunciation');
	var scoresheet = require('../bup/js/scoresheet');
	var svg2pdf = require('../bup/js/svg2pdf');
	var toprow = require('./toprow');
	var uiu = require('../bup/js/uiu');
	var utils = require('../bup/bup/js/utils.js');
	var save_file = require('../bup/bup/js/save_file.js');

	var JSZip = null; // External library

	module.exports = ccsvexport;
}
/*/@DEV*/
