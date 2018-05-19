'use strict';

var curt; // current tournament

var ctournament = (function() {
function _route_single(rex, func, handler) {
	if (!handler) {
		handler = change.default_handler(func);
	}

	crouting.register(rex, function(m) {
		switch_tournament(m[1], func);
	}, handler);
}

function switch_tournament(tournament_key, success_cb) {
	send({
		type: 'tournament_get',
		key: tournament_key,
	}, function(err, response) {
		if (err) {
			return cerror.net(err);
		}

		curt = response.tournament;
		uiu.text_qs('.btp_status', 'BTP status: ' + curt.btp_status);
		uiu.text_qs('.ticker_status', 'Ticker status: ' + curt.ticker_status);
		success_cb();
	});
}

function ui_create() {
	const main = uiu.qs('.main');

	uiu.empty(main);
	const form = uiu.el(main, 'form');
	uiu.el(form, 'h2', {}, 'Create tournament');
	const id_label = uiu.el(form, 'label', {}, 'tournament ID (all lowercase, no spaces):');
	const key_input = uiu.el(id_label, 'input', {
		type: 'text',
		name: 'key',
		autofocus: 'autofocus',
		required: 'required',
		pattern: '^[a-z0-9]+$',
	});
	uiu.el(form, 'button', {
		role: 'submit',
	}, 'Create tournament');
	key_input.focus();

	form_utils.onsubmit(form, function(data) {
		send({
			type: 'create_tournament',
			key: data.key,
		}, function(err) {
			if (err) return cerror.net(err);

			uiu.remove(form);
			switch_tournament(data.key, ui_show);
		});
	});
}

function ui_list() {
	crouting.set('t/');
	toprow.set([{
		label: 'Tournaments',
		func: ui_list,
	}]);

	send({
		type: 'tournament_list',
	}, function(err, response) {
		if (err) {
			return cerror.net(err);
		}
		list_show(response.tournaments);
	});
}
crouting.register(/^t\/$/, ui_list, change.default_handler);

function list_show(tournaments) {
	const main = uiu.qs('.main');
	uiu.empty(main);
	uiu.el(main, 'h1', {}, 'Tournaments');
	tournaments.forEach(function(t) {
		const link = uiu.el(main, 'div', 'vlink', t.name || t.key);
		link.addEventListener('click', function() {
			switch_tournament(t.key, ui_show);
		});
	});

	const create_btn = uiu.el(main, 'button', {
		role: 'button',
	}, 'Create tournament ...');
	create_btn.addEventListener('click', ui_create);
}

function update_score(c) {
	const cval = c.val;
	const match_id = cval.match_id;

	// Find the match
	const m = utils.find(curt.matches, m => m._id === match_id);
	if (!m) {
		cerror.silent('Cannot find match to update score, ID: ' + JSON.stringify(match_id));
		return;
	}

	const old_section = cmatch.calc_section(m);
	m.network_score = cval.network_score;
	m.presses = cval.presses;
	m.team1_won = cval.team1_won;
	const new_section = cmatch.calc_section(m);

	if (old_section === new_section) {
		cmatch.update_match_score(m);
	} else {
		_show_render_matches();
	}
}

function update_current_match(c) {
	change.change_current_match(c.val);
	_show_render_matches();
}

function _show_render_matches() {
	cmatch.render_courts(uiu.qs('.courts_container'));
	cmatch.render_unassigned(uiu.qs('.unassigned_container'));
	cmatch.render_finished(uiu.qs('.finished_container'));
}

function ui_btp_fetch() {
	send({
		type: 'btp_fetch',
		tournament_key: curt.key,
	}, err => {
		if (err) {
			return cerror.net(err);
		}
	});
}

function ui_ticker_push() {
	send({
		type: 'ticker_pushall',
		tournament_key: curt.key,
	}, err => {
		if (err) {
			return cerror.net(err);
		}
	});
}

function ui_show() {
	crouting.set('t/:key/', {key: curt.key});
	toprow.set([{
		label: 'Tournaments',
		func: ui_list,
	}, {
		label: curt.name || curt.key,
		func: ui_show,
		'class': 'ct_name',
	}], [{
		label: 'Scoreboard',
		href: '/bup/#btsh_e=' + encodeURIComponent(curt.key) + '&display&dm_style=international',
	}, {
		label: 'Umpire Panel',
		href: '/bup/#btsh_e=' + encodeURIComponent(curt.key),
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	const settings_btn = uiu.el(main, 'div', 'tournament_settings_link vlink', ci18n('edit tournament'));
	settings_btn.addEventListener('click', ui_edit);

	if (curt.btp_enabled) {
		const btp_fetch_btn = uiu.el(main, 'button', 'tournament_btp_fetch', 'Von BTP aktualisieren');
		btp_fetch_btn.addEventListener('click', ui_btp_fetch);
	}
	if (curt.ticker_enabled) {
		const ticker_push_btn = uiu.el(main, 'button', 'tournament_ticker_push', 'Ticker aktualisieren');
		ticker_push_btn.addEventListener('click', ui_ticker_push);
	}


	uiu.el(main, 'h1', 'tournament_name ct_name', curt.name || curt.key);

	cmatch.prepare_render(curt);

	uiu.el(main, 'div', 'courts_container');
	uiu.el(main, 'div', 'unassigned_container');
	const match_create_container = uiu.el(main, 'div');
	cmatch.render_create(match_create_container);
	uiu.el(main, 'div', 'finished_container');
	_show_render_matches();
}
_route_single(/t\/([a-z0-9]+)\/$/, ui_show, change.default_handler(_show_render_matches, {
	score: update_score,
	court_current_match: update_current_match,
}));

function ui_edit() {
	crouting.set('t/:key/edit', {key: curt.key});
	toprow.set([{
		label: 'Tournaments',
		func: ui_list,
	}, {
		label: curt.name || curt.key,
		func: ui_show,
		'class': 'ct_name',
	}, {
		label: ci18n('edit tournament'),
		func: ui_edit,
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	const form = uiu.el(main, 'form', 'tournament_settings');
	const key_label = uiu.el(form, 'label');
	uiu.el(key_label, 'span', {}, 'Tournament id:');
	uiu.el(key_label, 'input', {
		type: 'text',
		name: 'key',
		readonly: 'readonly',
		disabled: 'disabled',
		title: 'Can not be changed',
		'class': 'uneditable',
		value: curt.key,
	});
	const name_label = uiu.el(form, 'label');
	uiu.el(name_label, 'span', {}, 'Name:');
	uiu.el(name_label, 'input', {
		type: 'text',
		name: 'name',
		required: 'required',
		value: curt.name || curt.key,
		'class': 'ct_name',
	});

	// Team?
	const is_team_label = uiu.el(form, 'label');
	const is_team_attrs = {
		type: 'checkbox',
		name: 'is_team',
	};
	if (curt.is_team) {
		is_team_attrs.checked = 'checked';
	}
	uiu.el(is_team_label, 'input', is_team_attrs);
	uiu.el(is_team_label, 'span', {}, 'Mannschafts-Wettbewerb');

	// BTP
	const btp_enabled_label = uiu.el(form, 'label');
	const ba_attrs = {
		type: 'checkbox',
		name: 'btp_enabled',
	};
	if (curt.btp_enabled) {
		ba_attrs.checked = 'checked';
	}
	uiu.el(btp_enabled_label, 'input', ba_attrs);
	uiu.el(btp_enabled_label, 'span', {}, 'BTP-Anbindung aktivieren');

	const btp_autofetch_enabled_label = uiu.el(form, 'label');
	const bae_attrs = {
		type: 'checkbox',
		name: 'btp_autofetch_enabled',
	};
	if (curt.btp_autofetch_enabled) {
		bae_attrs.checked = 'checked';
	}
	uiu.el(btp_autofetch_enabled_label, 'input', bae_attrs);
	uiu.el(btp_autofetch_enabled_label, 'span', {}, 'Automatisch synchronisieren');

	const btp_readonly_label = uiu.el(form, 'label');
	const bro_attrs = {
		type: 'checkbox',
		name: 'btp_readonly',
	};
	if (curt.btp_readonly) {
		bro_attrs.checked = 'checked';
	}
	uiu.el(btp_readonly_label, 'input', bro_attrs);
	uiu.el(btp_readonly_label, 'span', {}, 'Nur lesen');

	const btp_ip_label = uiu.el(form, 'label');
	uiu.el(btp_ip_label, 'span', {}, 'BTP-IP:');
	uiu.el(btp_ip_label, 'input', {
		type: 'text',
		name: 'btp_ip',
		value: (curt.btp_ip || ''),
	});

	const btp_password_label = uiu.el(form, 'label');
	uiu.el(btp_password_label, 'span', {}, 'BTP-Passwort:');
	uiu.el(btp_password_label, 'input', {
		type: 'text',
		name: 'btp_password',
		value: (curt.btp_password || ''),
	});


	// Ticker
	const ticker_enabled_label = uiu.el(form, 'label');
	const te_attrs = {
		type: 'checkbox',
		name: 'ticker_enabled',
	};
	if (curt.ticker_enabled) {
		te_attrs.checked = 'checked';
	}
	uiu.el(ticker_enabled_label, 'input', te_attrs);
	uiu.el(ticker_enabled_label, 'span', {}, 'Ticker aktivieren');

	const ticker_url_label = uiu.el(form, 'label');
	uiu.el(ticker_url_label, 'span', {}, 'Ticker-Addresse:');
	uiu.el(ticker_url_label, 'input', {
		type: 'text',
		name: 'ticker_url',
		value: (curt.ticker_url || ''),
	});

	const ticker_password_label = uiu.el(form, 'label');
	uiu.el(ticker_password_label, 'span', {}, 'Ticker-Passwort:');
	uiu.el(ticker_password_label, 'input', {
		type: 'text',
		name: 'ticker_password',
		value: (curt.ticker_password || ''),
	});



	uiu.el(form, 'button', {
		role: 'submit',
	}, 'Ändern');
	form_utils.onsubmit(form, function(data) {
		const props = {
			name: data.name,
			is_team: (!!data.is_team),
			btp_enabled: (!!data.btp_enabled),
			btp_autofetch_enabled: (!!data.btp_autofetch_enabled),
			btp_readonly: (!!data.btp_readonly),
			btp_ip: data.btp_ip,
			btp_password: data.btp_password,
			ticker_enabled: (!! data.ticker_enabled),
			ticker_url: data.ticker_url,
			ticker_password: data.ticker_password,
		};
		send({
			type: 'tournament_edit_props',
			key: curt.key,
			props: props,
		}, function(err) {
			if (err) {
				return cerror.net(err);
			}
			ui_show();
		});
	});

	uiu.el(main, 'h2', {}, 'Courts');

	const courts_table = uiu.el(main, 'table');
	const courts_tbody = uiu.el(courts_table, 'tbody');
	for (const c of curt.courts) {
		const tr = uiu.el(courts_tbody, 'tr');
		uiu.el(tr, 'th', {}, c.num);
		uiu.el(tr, 'td', {}, c.name || '');
		const actions_td = uiu.el(tr, 'td', {});
		const del_btn = uiu.el(actions_td, 'button', {
			'data-court-id': c._id,
		}, 'Delete');
		del_btn.addEventListener('click', function(e) {
			const del_btn = e.target;
			const court_id = del_btn.getAttribute('data-court-id');
			if (confirm('Do you really want to delete ' + court_id + '? (Will not do anything yet!)')) {
				debug.log('TODO: would now delete court');
			}
		});
	}

	const nums = curt.courts.map(c => parseInt(c.num));
	const maxnum = Math.max(0, Math.max.apply(null, nums));

	const courts_add_form = uiu.el(main, 'form');
	uiu.el(courts_add_form, 'input', {
		type: 'number',
		name: 'count',
		min: 1,
		max: 99,
		value: 1,
	});
	const courts_add_button = uiu.el(courts_add_form, 'button', {
		role: 'button',
	}, 'Add Courts');
	form_utils.onsubmit(courts_add_form, function(data) {
		courts_add_button.setAttribute('disabled', 'disabled');
		const court_count = parseInt(data.count);
		const nums = [];
		for (let court_num = maxnum + 1;court_num <= maxnum + court_count;court_num++) {
			nums.push(court_num);
		}

		send({
			type: 'courts_add',
			tournament_key: curt.key,
			nums,
		}, function(err, response) {
			if (err) {
				courts_add_button.removeAttribute('disabled');
				return cerror.net(err);
			}
			Array.prototype.push.apply(curt.courts, response.added_courts);
			ui_edit();
		});
	});
}
_route_single(/t\/([a-z0-9]+)\/edit$/, ui_edit);

function init() {
	send({
		type: 'tournament_list',
	}, function(err, response) {
		if (err) {
			return cerror.net(err);
		}

		const tournaments = response.tournaments;
		if (tournaments.length === 1) {
			switch_tournament(tournaments[0].key, ui_show);
		} else {
			list_show(tournaments);
		}
	});
}
crouting.register(/^$/, init, change.default_handler);

function _cancel_ui_umpfixup() {
	const dlg = document.querySelector('.umpfixup_dialog');
	if (!dlg) {
		return; // Already cancelled
	}
	cbts_utils.esc_stack_pop();
	uiu.remove(dlg);
	ui_show();
}

function ui_umpfixup() {
	crouting.set('t/' + curt.key + '/umpfixup', {}, _cancel_ui_umpfixup);

	cbts_utils.esc_stack_push(_cancel_ui_umpfixup);

	const body = uiu.qs('body');
	const dialog_bg = uiu.el(body, 'div', 'umpfixup_dialog');
	const dialog = uiu.el(dialog_bg, 'div', 'dialog');

	uiu.el(dialog, 'h3', {}, 'Umpire Fixup (DM O35 2017)');

	const form = uiu.el(dialog, 'form');
	uiu.el(form, 'input', {
		type: 'hidden',
		name: 'tournament_id',
		value: curt.key,
	});

	const textarea = uiu.el(form, 'textarea', {
		cols: 80,
		rows: 30,
		name: 'csv',
	});

	const btn = uiu.el(form, 'button', {
		'class': 'umpfixup_button',
		type: 'submit',
	}, 'Fixup');

	form_utils.onsubmit(form, function(d) {
		btn.setAttribute('disabled', 'disabled');
		send({
			type: 'umpfixup',
			tournament_key: curt.key,
			csv: d.csv,
		}, function (err, response) {
			btn.removeAttribute('disabled');
			if (err) {
				return cerror.net(err);
			}

			const new_val = response.remaining.map(r => {
				return r.line + ' # ' + r.message;
			}).join('\n');
			textarea.value = new_val;
		});
	});

	const cancel_btn = uiu.el(dialog, 'div', 'match_cancel_link vlink', ci18n('Cancel'));
	cancel_btn.addEventListener('click', _cancel_ui_umpfixup);
}
crouting.register(/t\/([a-z0-9]+)\/umpfixup$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_umpfixup();
	});
}, change.default_handler(ui_umpfixup));


function _cancel_ui_allscoresheets() {
	const dlg = document.querySelector('.allscoresheets_dialog');
	if (!dlg) {
		return; // Already cancelled
	}
	cbts_utils.esc_stack_pop();
	uiu.remove(dlg);
	ui_show();
}

function _pad(n, width, z) {
	z = z || '0';
	n = n + '';
	return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}


function _render_scoresheet(task, pos, cb) {
	const {
		container,
		status,
		progress,
		matches,
		pseudo_state,
		tournament_name,
		zip} = task;

	if (pos >= matches.length) {
		return cb();
	}

	progress.value = pos;
	uiu.text(status, 'Rendere ' + (pos + 1) + ' / ' + (matches.length));

	const match = matches[pos];
	const setup = utils.deep_copy(match.setup);
	setup.tournament_name = curt.name;
	const s = calc.remote_state(pseudo_state, setup, match.presses);
	s.ui = {};

	scoresheet.load_sheet(scoresheet.sheet_name(setup), function(xml) {
		var svg = scoresheet.make_sheet_node(s, xml);
		svg.setAttribute('class', 'scoresheet single_scoresheet');
		// Usually we'd call importNode here to import the document here, but IE/Edge then ignores the styles
		container.appendChild(svg);
		scoresheet.sheet_render(s, svg);

		const title = (
			tournament_name + ' ' + _pad(setup.match_num, 3, ' ') + ' ' + 
			setup.event_name + ' ' + setup.match_name + ' ' +
			pronunciation.teamtext_internal(s, 0) + ' v ' +
			pronunciation.teamtext_internal(s, 1));
		const props = {
			title,
			subject: 'Schiedsrichterzettel',
			creator: 'bts with bup (https://github.com/phihag/bts/)',
		};
		const pdf = svg2pdf.make([svg], props, 'landscape');

		const ab = pdf.output('arraybuffer');
		zip.file(title.replace(/\s*\/\s*/g, ', ') + '.pdf', ab);

		uiu.empty(container);
		progress.value = pos + 1;
		setTimeout(function() {
			_render_scoresheet(task, pos + 1, cb);
		}, 0);
	}, '/bupdev/');
}

function ui_allscoresheets() {
	crouting.set('t/' + curt.key + '/allscoresheets', {}, _cancel_ui_allscoresheets);

	cbts_utils.esc_stack_push(_cancel_ui_allscoresheets);

	const body = uiu.qs('body');
	const dialog_bg = uiu.el(body, 'div', 'dialog_bg allscoresheets_dialog');
	const dialog = uiu.el(dialog_bg, 'div', 'dialog');

	uiu.el(dialog, 'h3', {}, 'Generiere Schiedsrichterzettel');

	const status = uiu.el(dialog, 'div', {}, 'Lade Daten ...');

	const progress = uiu.el(dialog, 'progress', {
		style: 'min-width: 60vw;',
	});
	send({
		type: 'fetch_allscoresheets_data',
		tournament_key: curt.key,
	}, function (err, response) {
		if (err) {
			return cerror.net(err);
		}

		const matches = response.matches;
		progress.max = matches.length;
		uiu.text(status, 'Starte Rendering (' + matches.length + ' Spiele)');

		const zip = new JSZip();
		const container = uiu.el(dialog, 'div', {
			'class': 'allscoresheets_svg_container',
		});
		printing.set_orientation('landscape');

		const lang = 'en';
		const pseudo_state = {
			settings: {
				shuttle_counter: true,
			},
			lang,
		};
		i18n.update_state(pseudo_state, lang);
		i18n.register_lang(i18n_de);
		i18n.register_lang(i18n_en);

		const task = {
			container,
			status,
			progress,
			matches,
			pseudo_state,
			tournament_name: curt.name,
			zip,
		};

		_render_scoresheet(task, 0, function() {
			uiu.text(status, 'Generiere Zip.');
			const zip_fn = curt.name + ' Schiedsrichterzettel.zip';
			zip.generateAsync({type: 'blob'}).then(function(blob) {
				uiu.text(status, 'Starte  Download.');

				saveAs(blob, zip_fn);
				uiu.text(status, 'Fertig.');
			}).catch(function(error) {
				uiu.text(status, 'Fehler: ' + error.stack);
			});
		});
	});

	const cancel_btn = uiu.el(dialog, 'div', 'vlink', 'Zurück');
	cancel_btn.addEventListener('click', _cancel_ui_allscoresheets);
}
crouting.register(/t\/([a-z0-9]+)\/allscoresheets$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_allscoresheets();
	});
}, change.default_handler(ui_allscoresheets));


return {
	init,
	// For other modules
	switch_tournament,
	ui_show,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var calc = require('../bup/js/calc');
	var cbts_utils = require('./cbts_utils');
	var cerror = require('./cerror');
	var change = require('./change');
	var cmatch = require('./cmatch');
	var crouting = require('./crouting');
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

	var JSZip = null; // External library
	var saveAs = null; // External library

    module.exports = ctournament;
}
/*/@DEV*/
