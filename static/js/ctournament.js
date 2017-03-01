'use strict';

const ctournament = (function() {
var curt; // current tournament

function _route_single(rex, func) {
	crouting.register(rex, function(m) {
		send({
			type: 'tournament_get',
			key: m[1],
		}, function(err, response) {
			if (err) {
				return on_error.show(err);
			}

			switch_tournament(response.tournament);
			func();
		});
	});
}

function ui_create() {
	const main = uiu.qs('.main');

	uiu.empty(main);
	const form = uiu.create_el(main, 'form');
	uiu.create_el(form, 'h2', {}, 'Turnier erstellen');
	const id_label = uiu.create_el(form, 'label', {}, 'Turnier-ID:');
	uiu.create_el(id_label, 'input', {
		type: 'text',
		name: 'key',
		autofocus: 'autofocus',
		required: 'required',
		pattern: '^[a-z0-9]+$',
	});
	uiu.create_el(form, 'button', {
		role: 'submit',
	}, 'Turnier erstellen');

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
			return on_error.show(err);
		}
		list_show(response.tournaments);
	});
}
crouting.register(/t\/$/, ui_list);

function list_show(tournaments) {
	const main = uiu.qs('.main');
	uiu.empty(main);
	const h1 = uiu.create_el(main, 'h1', {}, 'Turniere');
	tournaments.forEach(function(t) {
		const link = uiu.create_el(main, 'div', 'vlink', t.name || t.key);
		link.addEventListener('click', function() {
			switch_tournament(t);
			ui_show();
		});
	});

	const create_btn = uiu.create_el(main, 'button', {
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
	const settings_btn = uiu.create_el(main, 'div', 'tournament_settings_link vlink', 'Turnier bearbeiten');
	settings_btn.addEventListener('click', ui_edit);

	uiu.create_el(main, 'h1', 'tournament_name', curt.name || curt.key);
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

	const form = uiu.create_el(main, 'form', 'tournament_settings');
	const key_label = uiu.create_el(form, 'label');
	uiu.create_el(key_label, 'span', {}, 'Turnier-Id:');
	uiu.create_el(key_label, 'input', {
		type: 'text',
		name: 'key',
		readonly: 'readonly',
		disabled: 'disabled',
		title: 'Kann nicht geändert werden',
		'class': 'uneditable',
		value: curt.key,
	});
	const name_label = uiu.create_el(form, 'label');
	uiu.create_el(name_label, 'span', {}, 'Name:');
	uiu.create_el(name_label, 'input', {
		type: 'text',
		name: 'name',
		required: 'required',
		value: curt.name || curt.key,
	});

	uiu.create_el(form, 'button', {
		role: 'submit',
	}, 'Ändern');
	form_utils.onsubmit(form, function(data) {
		send({
			type: 'tournament_edit',
			key: curt.key,
			change: {name: data.name},
		}, function(err, response) {
			if (err) {
				return on_error.show(err);
			}
			switch_tournament(response.tournament);
			ui_show();
		});
	});
}
_route_single(/t\/([a-z0-9]+)\/edit$/, ui_edit);

function init() {
	send({
		type: 'tournament_list',
	}, function(err, response) {
		if (err) {
			return on_error.show(err);
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

    module.exports = ctournament;
}
/*/@DEV*/
