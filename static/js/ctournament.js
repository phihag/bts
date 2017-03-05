'use strict';

var ctournament = (function() {
var curt; // current tournament

function _route_single(rex, func) {
	crouting.register(rex, function(m) {
		send({
			type: 'tournament_get',
			key: m[1],
		}, function(err, response) {
			if (err) {
				return cerror.net(err);
			}

			switch_tournament(response.tournament);
			func();
		});
	});
}

function ui_create() {
	const main = uiu.qs('.main');

	uiu.empty(main);
	const form = uiu.el(main, 'form');
	uiu.el(form, 'h2', {}, 'Turnier erstellen');
	const id_label = uiu.el(form, 'label', {}, 'Turnier-ID:');
	const key_input = uiu.el(id_label, 'input', {
		type: 'text',
		name: 'key',
		autofocus: 'autofocus',
		required: 'required',
		pattern: '^[a-z0-9]+$',
	});
	uiu.el(form, 'button', {
		role: 'submit',
	}, 'Turnier erstellen');
	key_input.focus();

	form_utils.onsubmit(form, function(data) {
		send({
			type: 'create_tournament',
			key: data.key,
		}, function(err, tournament) {
			uiu.remove(form);
			switch_tournament(tournament);
			ui_show();
		});
	});
}

function switch_tournament(tournament) {
	curt = tournament;
}

function ui_list() {
	crouting.set('t/');
	toprow.set([{
		label: 'Turniere',
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
crouting.register(/t\/$/, ui_list);

function list_show(tournaments) {
	const main = uiu.qs('.main');
	uiu.empty(main);
	uiu.el(main, 'h1', {}, 'Turniere');
	tournaments.forEach(function(t) {
		const link = uiu.el(main, 'div', 'vlink', t.name || t.key);
		link.addEventListener('click', function() {
			switch_tournament(t);
			ui_show();
		});
	});

	const create_btn = uiu.el(main, 'button', {
		role: 'button',
	}, 'Turnier erstellen ...');
	create_btn.addEventListener('click', ui_create);
}

function ui_show() {
	crouting.set('t/:key/', {key: curt.key});
	toprow.set([{
		label: 'Turniere',
		func: ui_list,
	}, {
		label: curt.name || curt.key,
		func: ui_show,
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);
	const settings_btn = uiu.el(main, 'div', 'tournament_settings_link vlink', 'Turnier bearbeiten');
	settings_btn.addEventListener('click', ui_edit);

	uiu.el(main, 'h1', 'tournament_name', curt.name || curt.key);
}
_route_single(/t\/([a-z0-9]+)\/$/, ui_show);

function ui_edit() {
	crouting.set('t/:key/edit', {key: curt.key});
	toprow.set([{
		label: 'Turniere',
		func: ui_list,
	}, {
		label: curt.name || curt.key,
		func: ui_show,
	}, {
		label: 'Turnier bearbeiten',
		func: ui_edit,
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	const form = uiu.el(main, 'form', 'tournament_settings');
	const key_label = uiu.el(form, 'label');
	uiu.el(key_label, 'span', {}, 'Turnier-Id:');
	uiu.el(key_label, 'input', {
		type: 'text',
		name: 'key',
		readonly: 'readonly',
		disabled: 'disabled',
		title: 'Kann nicht geändert werden',
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
	});
	uiu.el(form, 'button', {
		role: 'submit',
	}, 'Ändern');
	form_utils.onsubmit(form, function(data) {
		send({
			type: 'tournament_edit',
			key: curt.key,
			change: {name: data.name},
		}, function(err, response) {
			if (err) {
				return cerror.net(err);
			}
			switch_tournament(response.tournament);
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
		}, 'Löschen');
		del_btn.addEventListener('click', function(e) {
			const del_btn = e.target;
			const court_id = del_btn.getAttribute('data-court-id');
			if (prompt('Court ' + court_id + ' wirklich löschen?')) {
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
	}, '.. Courts hinzufügen');
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
		if (tournaments.length === 0) {
			ui_create();
		} else if (tournaments.length === 1) {
			switch_tournament(tournaments[0]);
			ui_show();
		} else {
			list_show(tournaments);
		}
	});
}
crouting.register(/^$/, init);

return {
	init: init,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var crouting = require('./crouting');
	var debug = require('./debug');
	var form_utils = require('./form_utils');
	var toprow = require('./toprow');
	var uiu = require('../bup/js/uiu');

    module.exports = ctournament;
}
/*/@DEV*/
