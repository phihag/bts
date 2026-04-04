'use strict';

var curt; // current tournament
let current_view = null;
let scoring_formats_main = null;
let live_settings_status_el = null;
let live_settings_pending_requests = 0;

var ctournament = (function() {
	function _route_single(rex, func, handler) {
		if (!handler) {
			handler = change.default_handler(func);
		}

		crouting.register(rex, function (m) {
			switch_tournament(m[1], func);
		}, handler);
	}

	function switch_tournament(tournament_key, success_cb) {
		send({
			type: 'tournament_get',
			key: tournament_key,
		}, function (err, response) {
			if (err) {
				return cerror.net(err);
			}

			curt = response.tournament;
			if (curt.language && curt.language !== 'auto') {
				ci18n.switch_language(curt.language);
			}
			success_cb();
		});
	}

	function ui_create() {
		const main = uiu.qs('.main');

		uiu.empty(main);
		const form = uiu.el(main, 'form');
		uiu.el(form, 'h2', 'edit', ci18n('Create tournament'));
		const id_label = uiu.el(form, 'label', {}, ci18n('create:id:label'));
		const key_input = uiu.el(id_label, 'input', {
			type: 'text',
			name: 'key',
			autofocus: 'autofocus',
			required: 'required',
			pattern: '^[a-z0-9]+$',
		});
		uiu.el(form, 'button', {
			role: 'submit',
		}, ci18n('Create tournament'));
		key_input.focus();

		form_utils.onsubmit(form, function (data) {
			send({
				type: 'create_tournament',
				key: data.key,
			}, function (err) {
				if (err) return cerror.net(err);

				uiu.remove(form);
				switch_tournament(data.key, ui_show);
			});
		});
	}

	function ui_list() {
		crouting.set('t/');
		toprow.set([{
			label: ci18n('Tournaments'),
			func: ui_list,
		}]);

		send({
			type: 'tournament_list',
		}, function (err, response) {
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
		tournaments.forEach(function (t) {
			const link = uiu.el(main, 'div', 'vlink', t.name || t.key);
			link.addEventListener('click', function () {
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
		m.shuttle_count = cval.shuttle_count;
		const new_section = cmatch.calc_section(m);

		if (old_section === new_section) {
			cmatch.update_match_score(m);
		} else {
			if (new_section == 'finished' || new_section == 'unassigned') {
				m.setup.now_on_court = false;
			}
			else {
				m.setup.now_on_court = true;
			}
			cmatch.update_match(m, old_section, new_section);
		}
	}

	function update_player_status(c) {
		const cval = c.val;
		const match_id = cval.match__id;

		// Find the match
		const m = utils.find(curt.matches, m => m._id === match_id);
		if (!m) {
			cerror.silent('Cannot find match to update player status, ID: ' + JSON.stringify(match_id));
			return;
		}
		m.btp_winner = cval.btp_winner;
		m.setup = cval.setup;

		if(current_view == 'show'){
			cmatch.update_players(m);
		}
		
	}

	function remove_match(c) {
		const cval = c.val;
		const match_id = cval.match__id;

		const m = utils.find(curt.matches, m => m._id === match_id);
		if (!m) {
			cerror.silent('Cannot find match to update, ID: ' + JSON.stringify(match_id));
			return;
		}
		const section = cmatch.calc_section(m);
		cmatch.remove_match_from_gui(m, section);

	}

	function add_match(c){
		const cval = c.val;
		const m = cval.match;
		const new_section = cmatch.calc_section(m);
		cmatch.add_match(m, new_section);
	}

	function update_match(c) {
		const cval = c.val;
		const match_id = cval.match__id;

		// Find the match
		const m = utils.find(curt.matches, m => m._id === match_id);
		if (!m) {
			cerror.silent('Cannot find match to update, ID: ' + JSON.stringify(match_id));
			return;
		}
		const old_section = cmatch.calc_section(m);
		if (cval.match) {
			if('network_score' in cval.match){
				m.network_score = cval.match.network_score;
			}
			m.presses = cval.match.presses;
			m.team1_won = cval.match.team1_won;
			m.shuttle_count = cval.match.shuttle_count;
			m.setup = cval.match.setup;
			m.btp_winner = cval.match.btp_winner;
		}
		const new_section = cmatch.calc_section(m);
		cmatch.update_match(m, old_section, new_section);

		return old_section;
	}

	function update_upcoming_match(c) {
		const cval = c.val;
		const match_id = cval.match__id;

		// Find the match
		const m = utils.find(curt.matches, m => m._id === match_id);
		if (!m) {
			cerror.silent('Cannot find match to update, ID: ' + JSON.stringify(match_id));
			return;
		}
		const old_section = cmatch.calc_section(m);
		if(cval.match.network_score) {
			m.network_score = cval.match.network_score;
		}
		m.presses = cval.match.presses;
		m.team1_won = cval.match.team1_won;
		m.shuttle_count = cval.match.shuttle_count;
		m.setup = cval.match.setup;
		m.btp_winner = cval.match.btp_winner;
		const new_section = cmatch.calc_section(m);
		cmatch.update_match(m, old_section, new_section);
		rerender_public_match_views(old_section, new_section);

		if (old_section != new_section || new_section == 'unassigned') {
			uiu.qsEach('.upcoming_container', (upcoming_container) => {
				cmatch.render_upcoming_matches(upcoming_container);
			});
		}
	}

	function tabletoperator_add(c) {
		curt.tabletoperators.push(c.val.tabletoperator);
		_show_render_tabletoperators();
	}

	function tabletoperator_moved_up(c) {
		const changed_t = utils.find(curt.tabletoperators, m => m._id === c.val.tabletoperator._id);
		if (changed_t) {
			changed_t.start_ts = c.val.tabletoperator.start_ts;
		}
		_show_render_tabletoperators();
	}

	function tabletoperator_moved_down(c) {
		const changed_t = utils.find(curt.tabletoperators, m => m._id === c.val.tabletoperator._id);
		if (changed_t) {
			changed_t.start_ts = c.val.tabletoperator.start_ts;
		}
		_show_render_tabletoperators();
	}

	function tabletoperator_removed(c) {
		const changed_t = utils.find(curt.tabletoperators, m => m._id === c.val.tabletoperator._id);
		if (changed_t) {
			changed_t.court = c.val.tabletoperator.court;
		}
		_show_render_tabletoperators();
	}

	function add_normalization(c) {
		curt.normalizations.push(c.val.normalization);
		update_normalization_values(c)
	}

	function remove_normalization(c) {
		const changed_t = utils.find(curt.normalizations, m => m._id === c.val.normalization_id);
		if (changed_t) {
			curt.normalizations.splice(curt.normalizations.indexOf(changed_t), 1);
		}
		update_normalization_values(c)
	}
	function update_normalization_values(c) {
		uiu.qsEach('.normalizations_values_div', (div_el) => {
			div_el.innerHTML = "";
			render_normalisation_values(div_el);
		});
	}

	function add_advertisement(c) {
		curt.advertisements.push(c.val.advertisement);
		update_advertisements(c)
	}

	function remove_advertisement(c) {
		const changed_t = utils.find(curt.advertisements, m => m._id === c.val.advertisement_id);
		if (changed_t) {
			curt.advertisements.splice(curt.advertisements.indexOf(changed_t), 1);
		}
		update_advertisements(c)
	}

	function update_advertisements(c) {
		uiu.qsEach('.advertisements_div', (div_el) => {
			div_el.innerHTML = "";
			render_advertisements(div_el);
		});
	}

	function update_current_match(c) {
		update_match(c);
	}

	function update_upcoming_current_match(c) {
		update_upcoming_match(c);
	}

	function _update_all_ui_elements() {
		_show_render_matches();
		_show_render_tabletoperators();

	}

	function _update_all_ui_elements_edit() {
		update_general_displaysettings(uiu.qs('.general_displaysettings'));
	}

	function refresh_current_view() {
		switch (current_view) {
			case 'edit':
				ui_edit();
				break;
			case 'show':
				ui_show();
				break;
			case 'upcoming':
				ui_upcoming();
				break;
			case 'current_matches':
				ui_current_matches();
				break;
			case 'next_matches':
				ui_next_matches();
				break;
			default:
				break;
		}
	}

	function _set_disabled_by_name(field_name, disabled) {
		uiu.qsEach('[name="' + field_name + '"]', function(el) {
			el.disabled = !!disabled;
		});
	}

	function update_edit_dependencies() {
		if (current_view !== 'edit') {
			return;
		}

		const warmup_select = document.querySelector('[name="warmup"]');
		if (warmup_select) {
			const custom_warmup = ['choise', 'call-down'];
			const is_custom = custom_warmup.includes(warmup_select.value);
			_set_disabled_by_name('warmup_ready', !is_custom);
			_set_disabled_by_name('warmup_start', !is_custom);
		}

		const btp_enabled = !!curt.btp_enabled;
		_set_disabled_by_name('btp_autofetch_enabled', !btp_enabled);
		_set_disabled_by_name('btp_readonly', !btp_enabled);
		_set_disabled_by_name('btp_ip', !btp_enabled);
		_set_disabled_by_name('btp_password', !btp_enabled);
		_set_disabled_by_name('btp_timezone', !btp_enabled);
		_set_disabled_by_name('btp_autofetch_timeout_intervall', !btp_enabled || !curt.btp_autofetch_enabled);

		const ticker_enabled = !!curt.ticker_enabled;
		_set_disabled_by_name('ticker_url', !ticker_enabled);
		_set_disabled_by_name('ticker_password', !ticker_enabled);

		const tabletoperator_enabled = !!curt.tabletoperator_enabled;
		[
			'tabletoperator_with_umpire_enabled',
			'tabletoperator_winner_of_quaterfinals_enabled',
			'tabletoperator_use_manual_counting_boards_enabled',
			'tabletoperator_split_doubles',
			'tabletoperator_with_state_enabled',
			'tabletoperator_with_state_from_match_enabled',
			'tabletoperator_set_break_after_tabletservice',
			'tabletoperator_break_seconds',
		].forEach(field_name => _set_disabled_by_name(field_name, !tabletoperator_enabled));
	}

	function set_live_settings_status(status_key) {
		if (!live_settings_status_el) {
			return;
		}
		live_settings_status_el.className = 'live_settings_status live_settings_status_' + status_key;
		uiu.text(live_settings_status_el, ci18n('tournament:edit:live_status:' + status_key));
	}

	function set_live_settings_status_message(message, status_key) {
		if (!live_settings_status_el) {
			return false;
		}
		live_settings_status_el.className = 'live_settings_status live_settings_status_' + (status_key || 'saved');
		uiu.text(live_settings_status_el, message);
		return true;
	}

	function begin_live_settings_request() {
		live_settings_pending_requests += 1;
		set_live_settings_status('saving');
	}

	function end_live_settings_request(err) {
		live_settings_pending_requests = Math.max(0, live_settings_pending_requests - 1);
		if (err) {
			set_live_settings_status('error');
			return;
		}
		if (live_settings_pending_requests === 0) {
			set_live_settings_status('saved');
		} else {
			set_live_settings_status('saving');
		}
	}

	function send_single_prop(field, value, callback) {
		begin_live_settings_request();
		send({
			type: 'tournament_edit_prop',
			key: curt.key,
			field,
			value,
		}, (err) => {
			end_live_settings_request(err);
			if (callback) {
				callback(err);
			}
		});
	}

	function send_with_live_status(msg, callback) {
		begin_live_settings_request();
		send(msg, function(err, response) {
			end_live_settings_request(err);
			if (callback) {
				return callback(err, response);
			}
		});
	}

	function bind_live_prop(el, field, options) {
		options = options || {};
		const event_name = options.event_name || 'change';
		const get_value = options.get_value || function(input_el) {
			if (input_el.type === 'checkbox') {
				return input_el.checked;
			}
			return input_el.value;
		};
		const on_before_send = options.on_before_send || function() {};
		const on_success = options.on_success || function() {};
		const on_error = options.on_error || function(input_el, old_value) {
			if (input_el.type === 'checkbox') {
				input_el.checked = !!old_value;
			} else {
				input_el.value = old_value ?? '';
			}
		};

		el.addEventListener(event_name, function() {
			const old_value = curt[field];
			on_before_send(el);
			const value = get_value(el);
			send_single_prop(field, value, function(err) {
				if (err) {
					on_error(el, old_value);
					return cerror.net(err);
				}
				on_success(el, value);
			});
		});
	}

	function _update_all_ui_elements_upcoming() {
		cmatch.render_courts(uiu.qs('.courts_container'), 'public');
		cmatch.render_upcoming_matches(uiu.qs('.upcoming_container'));
	}

	function _update_all_ui_elements_current_matches() {
		cmatch.render_courts(uiu.qs('.courts_container'), 'public');
	}

	function _update_all_ui_elements_next_matches() {
		cmatch.render_upcoming_matches(uiu.qs('.upcoming_container'));
	}

	function _show_render_matches() {
		cmatch.render_courts(uiu.qs('.courts_container'));
		cmatch.render_unassigned(uiu.qs('.unassigned_container'));
		cmatch.render_finished(uiu.qs('.finished_container'));
	}
	function _show_render_tabletoperators() {
		if(curt.tabletoperator_enabled) {
			ctabletoperator.render_unassigned(uiu.qs('.unassigned_tableoperators_container'));
		}
	}

	function update_show_tabletoperators() {
		if (current_view !== 'show') {
			return;
		}
		const meta_div = document.querySelector('.metadata_container');
		if (!meta_div) {
			return;
		}
		let container = meta_div.querySelector('.unassigned_tableoperators_container');
		if (curt.tabletoperator_enabled) {
			if (!container) {
				container = document.createElement('div');
				container.className = 'unassigned_tableoperators_container';
				meta_div.insertBefore(container, meta_div.firstChild);
			} else {
				container.innerHTML = '';
			}
			_show_render_tabletoperators();
		} else if (container) {
			container.remove();
		}
	}

	function update_btp_settings_ui() {
		switch (current_view) {
			case 'show':
				_show_render_matches();
				_show_render_umpires();
				break;
			case 'upcoming':
				_update_all_ui_elements_upcoming();
				break;
			case 'current_matches':
				_update_all_ui_elements_current_matches();
				break;
			case 'next_matches':
				_update_all_ui_elements_next_matches();
				break;
			case 'edit':
				update_edit_dependencies();
				break;
			default:
				break;
		}
	}

	function _show_render_umpires() {
		cumpires.ui_status(uiu.qs('.umpire_container'));
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
			type: 'ticker_reset',
			tournament_key: curt.key,
		}, err => {
			if (err) {
				return cerror.net(err);
			}
		});
	}

	// function render_announcement_formular(target) {
	// 	const announcements = uiu.el(target, 'div', 'announcements_container');
	// 	const heading = uiu.el(announcements, 'h3', {}, 'Freie Ansage');
	// 	const form = uiu.el(announcements, 'form');
	// 	uiu.el(form, 'textarea', {
	// 		type: 'textarea',
	// 		id: 'custom_announcement',
	// 		name: 'custom_announcement',
	// 		cols: '50',
	// 		rows: '4',
	// 		maxlength: '175'
	// 	});
	// 	const btp_fetch_btn = uiu.el(form, 'button', {
	// 		'class': 'match_save_button',
	// 		role: 'submit',
	// 	}, 'Ansage abspielen');
	// 	form_utils.onsubmit(form, function (d) {
	// 		//announce([d.custom_announcement]);
	// 		send({
	// 			type: 'free_announce',
	// 			tournament_key: curt.key,
	// 			text: d.custom_announcement,
	// 		}, function (err) {
	// 			if (err) {
	// 				return cerror.net(err);
	// 			}
	// 		});
	// 	});
	// }

	function render_announcement_formular(target) {
		const announcements = uiu.el(target, 'div', 'announcements_container');
		uiu.el(announcements, 'h3', {}, 'Freie Ansage');
	
		const form = uiu.el(announcements, 'form');
	
		const textarea = uiu.el(form, 'textarea', {
			type: 'textarea',
			id: 'custom_announcement',
			name: 'custom_announcement',
			cols: '50',
			rows: '4',
			maxlength: '175'
		});
	
		const btn_container = uiu.el(form, 'div', 'announcements_btn_container');

		// Button: Lokal Abspielen
		const local_btn = uiu.el(btn_container, 'button', {
			type: 'button',
			class: 'announce_button',
			id: 'local_announce_btn'
		}, 'Lokal Abspielen');
	
		// Button: Remote Abspielen
		const remote_btn = uiu.el(btn_container, 'button', {
			type: 'submit',
			class: 'announce_button',
			id: 'remote_announce_btn'
		}, 'Remote Abspielen');

		const emergency_btn = uiu.el(btn_container, 'button', {
			type: 'submit',
			class: !curt.enable_emergency ? 'announce_emergency_button' : 'stop_emergency_button',
			id: 'announce_emergency_btn'
		}, !curt.enable_emergency ? 'Evakuierung Abspielen' : 'Evakuierung Stoppen');
	
		// Lokales Abspielen (z. B. mit deiner announce-Funktion)
		local_btn.addEventListener('click', function () {
			const text = textarea.value.trim();
			if (!text) return;
	
			// Lokale Ansage abspielen
			announce([text], true);  // ← Diese Funktion muss bei dir lokal definiert sein
		});

		emergency_btn.addEventListener("click", () => {
  			const bestaetigt = confirm(!curt.enable_emergency ? "Soll wirklich evakuiert werden?" : "Soll die Evakuierung wirklich abgebrochen werden?");

  			if (bestaetigt) {
    			send({
					type: 'emergency_announce',
					tournament_key: curt.key,
					enable: !curt.enable_emergency
				}, function (err) {
					if (err) {
						return cerror.net(err);
					}
				});
  			}
		});
	
		// Remote Abspielen
		form_utils.onsubmit(form, function (d) {
			const text = d.custom_announcement?.trim();
			if (!text) return;
	
			send({
				type: 'free_announce',
				tournament_key: curt.key,
				text: text,
			}, function (err) {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function update_emergency_btn() {
		const btn = document.getElementById('announce_emergency_btn');
		if (!btn) return;

		if (curt.enable_emergency) {
			btn.classList.remove('announce_emergency_button');
			btn.classList.add('stop_emergency_button');
			btn.textContent = 'Evakuierung Stoppen';
		} else {
			btn.classList.remove('stop_emergency_button');
			btn.classList.add('announce_emergency_button');
			btn.textContent = 'Evakuierung Abspielen';
		}
	}

	// function render_enable_announcement(target) {
	// 	const announcements = uiu.el(target, 'div', 'enable_announcements_container');
	// 	const heading = uiu.el(announcements, 'h3', {}, 'Ansagen auf diesem Gerät');
	// 	const form = uiu.el(announcements, 'form');
	// 	const enable_announcements = uiu.el(form, 'input', {
	// 		type: 'checkbox',
	// 		id: 'enable_announcements',
	// 		name: 'enable_announcements'
	// 	});

	// 	enable_announcements.checked = (window.localStorage.getItem('enable_announcements') === 'true');
	// 	uiu.el(form, 'label', { for: 'enable_announcements' }, 'aktiv');
	// 	enable_announcements.addEventListener('change', change_announcements);
	// }

	// function change_announcements(e) {
	// 	let enable_announcements = document.getElementById('enable_announcements');
	// 	window.localStorage.setItem('enable_announcements', enable_announcements.checked);
	// }

	function render_enable_announcements(target, locations) {
		const container = uiu.el(target, 'div', 'enable_announcements_container');
		uiu.el(container, 'h3', {}, 'Ansagen auf diesem Gerät');
	
		locations.forEach(loc => {
			{
				const form = uiu.el(container, 'form');
		
				const checkboxId = `enable_announcement_calls_${loc._id}`;
				const checkbox = uiu.el(form, 'input', {
					type: 'checkbox',
					id: checkboxId,
					name: checkboxId
				});
		
				// Initialer Zustand aus localStorage
				checkbox.checked = (window.localStorage.getItem(checkboxId) === 'true');
		
				// Label anzeigen mit dem Location-Namen
				uiu.el(form, 'label', { for: checkboxId }, (loc.name || 'Unbenannte Location') + " (Spielaufruf)");
		
				// Event Listener zum Speichern in localStorage
				checkbox.addEventListener('change', function () {
					window.localStorage.setItem(checkboxId, checkbox.checked);
				});
			}
			{
				const form = uiu.el(container, 'form');
		
				const checkboxId = `enable_announcement_preparations_${loc._id}`;
				const checkbox = uiu.el(form, 'input', {
					type: 'checkbox',
					id: checkboxId,
					name: checkboxId
				});
		
				// Initialer Zustand aus localStorage
				checkbox.checked = (window.localStorage.getItem(checkboxId) === 'true');
		
				// Label anzeigen mit dem Location-Namen
				uiu.el(form, 'label', { for: checkboxId }, (loc.name || 'Unbenannte Location') + " (in Vorbereitung)");
		
				// Event Listener zum Speichern in localStorage
				checkbox.addEventListener('change', function () {
					window.localStorage.setItem(checkboxId, checkbox.checked);
				});
			}
		});

		{
			const form = uiu.el(container, 'form');
	
			const checkboxId = 'enable_free_announcements';
			const checkbox = uiu.el(form, 'input', {
				type: 'checkbox',
				id: checkboxId,
				name: checkboxId
			});
	
			// Initialer Zustand aus localStorage
			checkbox.checked = (window.localStorage.getItem(checkboxId) === 'true');
	
			// Label anzeigen mit dem Location-Namen
			uiu.el(form, 'label', { for: checkboxId }, 'Freie Remote Ansagen');
	
			// Event Listener zum Speichern in localStorage
			checkbox.addEventListener('change', function () {
				window.localStorage.setItem(checkboxId, checkbox.checked);
			});
		}
	}

	function render_enable_location_courts(target, locations) {
		const container = uiu.el(target, 'div', 'enable_announcements_container');
		uiu.el(container, 'h3', {}, 'Zeige Felder');
	
		locations.forEach(loc => {
			const form = uiu.el(container, 'form');
	
			const checkboxId = `show_location_courts_${loc._id}`;
			const checkbox = uiu.el(form, 'input', {
				type: 'checkbox',
				id: checkboxId,
				name: checkboxId
			});
	
			// Initialer Zustand aus localStorage oder Default auf true
			const storedValue = window.localStorage.getItem(checkboxId);
			checkbox.checked = (storedValue === null) ? true : (storedValue === 'true');
	
			// Label anzeigen mit dem Location-Namen
			uiu.el(form, 'label', { for: checkboxId }, loc.name + " ["+ loc.short_name +"]" || 'Unbenannte Location');
	
			// Event Listener zum Speichern in localStorage und Aufruf mit Parametern
			checkbox.addEventListener('change', function () {
				window.localStorage.setItem(checkboxId, checkbox.checked);
				cmatch.update_tables(loc._id, checkbox.checked);
			});
	
			// Gleich initial einmal aufrufen, damit der Sichtbarkeitszustand korrekt gesetzt ist
			cmatch.update_tables(loc._id, checkbox.checked);
		});
	}

	function build_location_view_menu_items() {
		const base_path = '/admin/t/' + encodeURIComponent(curt.key);
		const bup_lang = ((curt.language && curt.language !== 'auto') ? '&lang=' + encodeURIComponent(curt.language) : '');
		const bup_dm_style = '&dm_style=' + encodeURIComponent(curt.dm_style || 'international');
		const locations = curt.locations || [];

		function section_items(label, path_suffix) {
			const items = [{
				label,
				href: base_path + path_suffix,
			}];

			locations.forEach((loc) => {
				const params = new URLSearchParams({ location: loc.name });
				items.push({
					label: label + ' (' + ci18n('only location') + ' ' + loc.name + ')',
					href: base_path + path_suffix + '?' + params.toString(),
				});
			});

			items.push({ class: 'toprow_menu_separator' });
			return items;
		}

		const view_items = [
			...section_items(ci18n('Matchoverview'), '/upcoming'),
			...section_items(ci18n('Current Matches'), '/current_matches'),
			...section_items(ci18n('Next Matches'), '/next_matches'),
		];
		if (view_items.length > 0 && view_items[view_items.length - 1].class === 'toprow_menu_separator') {
			view_items.pop();
		}

		return [{
			label: ci18n('Scoreboard'),
			href: '/bup/#btsh_e=' + encodeURIComponent(curt.key) + '&display' + bup_dm_style + bup_lang,
		}, {
			class: 'toprow_menu_separator',
		}, {
			label: ci18n('Umpire Panel'),
			href: '/bup/#btsh_e=' + encodeURIComponent(curt.key) + bup_lang,
		}, {
			class: 'toprow_menu_separator',
		},
		...view_items];
	}
	function ui_show() {
		current_view = 'show'
		crouting.set('t/:key/', { key: curt.key });
		toprow.set([{
			label: ci18n('Tournaments'),
			func: ui_list,
		}, {
			label: curt.name || curt.key,
			func: ui_show,
			'class': 'ct_name',
		}], [{
			label: '\u2630',
			class: 'toprow_menu_button',
			items: build_location_view_menu_items(),
		}]);

		const main = uiu.qs('.main');
		uiu.empty(main);

		const meta_div = uiu.el(main, 'div', 'metadata_container');

		
		if(curt.tabletoperator_enabled) {
			uiu.el(meta_div, 'div', 'unassigned_tableoperators_container');
		}
		uiu.el(meta_div, 'div', 'umpire_container');
		render_announcement_formular(meta_div);


		render_enable_announcements(meta_div, curt.locations);


		const meta_right_div = uiu.el(meta_div, 'div', 'metadata_right_container');

		const meta_right_top_div = uiu.el(meta_right_div, 'div', 'metadata_right_top_container');

		render_enable_location_courts(meta_right_top_div, curt.locations);
		
		render_settings(meta_right_top_div);

		const errors_scroll_left_div = uiu.el(meta_right_div, 'div', 'errors_scroll_left');

		uiu.el(errors_scroll_left_div, 'div', 'errors');
		
		cmatch.prepare_render(curt);


		uiu.el(main, 'div', 'courts_container');
		uiu.el(main, 'div', 'unassigned_container');
		const match_create_container = uiu.el(main, 'div');
		cmatch.render_create(match_create_container);
		uiu.el(main, 'div', 'finished_container');

		_show_render_matches();

		_show_render_tabletoperators();
		_show_render_umpires();
	}
	_route_single(/t\/([a-z0-9]+)\/$/, ui_show, change.default_handler(_update_all_ui_elements, {
		score: update_score,
		court_current_match: update_current_match,
		update_player_status: update_player_status,
		match_edit: update_match,
		match_remove: remove_match,
		normalization_removed: remove_normalization,
		normalization_add: add_normalization,
		advertisement_removed: remove_advertisement,
		advertisement_add: add_advertisement,
		tabletoperator_add: tabletoperator_add,
		tabletoperator_moved_up: tabletoperator_moved_up,
		tabletoperator_moved_down: tabletoperator_moved_down,
		tabletoperator_removed: tabletoperator_removed,
		btp_status: btp_status_changed,
		ticker_status: ticker_status_changed,
	}));

	function render_settings(target) {
		const settings_div = uiu.el(target, 'div', 'metadata_right_container_2');
		uiu.el(settings_div, 'h3', {}, 'Turnier-Einstellungen');
	
		const settings_table = uiu.el(settings_div, 'table');	
		var tr = uiu.el(settings_table, 'tr');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'status_label', 'BTS');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'status status_connected','');
		var td = uiu.el(tr, 'td');
		const settings_btn = uiu.el(td, 'button', 'tournament_settings_link vlink', ci18n('edit tournament'));
		settings_btn.addEventListener('click', ui_edit);

		var tr = uiu.el(settings_table, 'tr');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'btp_status_label', 'BTP');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'btp_status', '');
		btp_status_changed({ val: curt.btp_status });
		var td = uiu.el(tr, 'td');
		if (curt.btp_enabled) {
			const btp_fetch_btn = uiu.el(td, 'button', 'tournament_btp_fetch vlink', ci18n('update from BTP'));
			btp_fetch_btn.addEventListener('click', ui_btp_fetch);
		}
		var tr = uiu.el(settings_table, 'tr');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'ticker_status_label', 'Ticker');
		var td = uiu.el(tr, 'td');
		uiu.el(td, 'div', 'ticker_status', '');
		ticker_status_changed({ val: curt.ticker_status });
		var td = uiu.el(tr, 'td');
		if (curt.ticker_enabled) {
			const ticker_push_btn = uiu.el(td, 'button', 'tournament_ticker_push vlink', ci18n('update ticker'));
			ticker_push_btn.addEventListener('click', ui_ticker_push);
		}
	}

	function update_metadata_settings() {
		if (current_view !== 'show') {
			return;
		}
		const settings_div = document.querySelector('.metadata_right_container_2');
		if (!settings_div) {
			return;
		}
		const target = settings_div.parentNode;
		settings_div.remove();
		render_settings(target);
	}

	function btp_status_changed(c) {
		set_service_status('btp_status', c);
	}
	function ticker_status_changed(c) {
		set_service_status('ticker_status', c);
	}

	function bts_status_changed(c) {
		set_service_status('status', c);
	}
	
	function set_service_status(service_id, c) {
		if (c && c.val) {
			if (curt) {
				curt[service_id] = c.val;
			}
			uiu.qsEach('.' + service_id, (div_el) => {
				div_el.className = service_id + ' status_' + c.val.status;
				div_el.title = c.val.message;
			});
		}
	}
	
	function _upload_logo(e) {
		const input = e.target;
		if (!input.files.length) return;

		const reader = new FileReader();
		reader.readAsDataURL(input.files[0]);
		reader.onload = () => {
			send_with_live_status({
				type: 'tournament_upload_logo',
				tournament_key: curt.key,
				data_url: reader.result,
				name: e.target.files[0].name,
			}, (err) => {
				if (err) {
					return cerror.net(err);
				}`
				input.closest('form').reset();`
			});
		};
		reader.onerror = (e) => {
			alert('Failed to upload: ' + e);
		};
	}

	function ui_edit() {
		current_view = 'edit';
		crouting.set('t/:key/edit', { key: curt.key });
		toprow.set([{
			label: ci18n('Tournaments'),
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

		const form = uiu.el(main, 'div', 'tournament_settings');
		let input = {};
	
		// tournament-div##################################################################################
		{
			const tournament_div = uiu.el(form, 'div', 'settings');
			uiu.el(tournament_div, 'h2', 'edit', ci18n('tournament:edit:tournament'));
			
			const key_label = uiu.el(tournament_div, 'label');
			uiu.el(key_label, 'span', {}, ci18n('tournament:edit:id'));
			uiu.el(key_label, 'input', {
				type: 'text',
				name: 'key',
				readonly: 'readonly',
				disabled: 'disabled',
				title: 'Can not be changed',
				'class': 'uneditable',
				value: curt.key,
			});

			const name_label = uiu.el(tournament_div, 'label');
			uiu.el(name_label, 'span', {}, ci18n('tournament:edit:name'));
				input.name = uiu.el(name_label, 'input', {
				type: 'text',
				name: 'name',
				required: 'required',
				value: curt.name || curt.key,
					'class': 'ct_name',
				});
				bind_live_prop(input.name, 'name', { event_name: 'blur' });


			const name_tguid = uiu.el(tournament_div, 'label');
			uiu.el(name_tguid, 'span', {}, ci18n('tournament:edit:tguid'));
				input.tguid = uiu.el(name_tguid, 'input', {
				type: 'text',
				name: 'tguid',
				value: curt.tguid ? curt.tguid : "",
					'class': 'ct_tguid',
				});
				bind_live_prop(input.tguid, 'tguid', { event_name: 'blur' });

			// Tournament language selection
			const language_label = uiu.el(tournament_div, 'label');
			uiu.el(language_label, 'span', {}, ci18n('tournament:edit:language'));
			const language_select = uiu.el(language_label, 'select', {
				name: 'language',
				required: 'required',
			});
			const all_langs = ci18n.get_all_languages();
			uiu.el(language_select, 'option', { value: 'auto' }, ci18n('tournament:edit:language:auto'));
			for (const l of all_langs) {
				const l_attrs = {
					value: l._code,
				};
				if (l._code === curt.language) {
					l_attrs.selected = 'selected';
				}
				uiu.el(language_select, 'option', l_attrs, l._name);
			}
				input.language = language_select;
				bind_live_prop(input.language, 'language');

			// Team competition?
			const is_team_label = uiu.el(tournament_div, 'label');
			uiu.el(is_team_label, 'span', {}, ci18n('tournament:edit:tournament:type'));
			const is_team_attrs = {
				type: 'checkbox',
				name: 'is_team',
			};
			if (curt.is_team) {
				is_team_attrs.checked = 'checked';
			}

				input.is_team = uiu.el(is_team_label, 'input', is_team_attrs);
				uiu.el(is_team_label, 'span', {}, ci18n('team competition'));
				bind_live_prop(input.is_team, 'is_team');

			// Nation competition?
			const is_nation_competition_label = uiu.el(tournament_div, 'label');
			const is_nation_competition_attrs = {
				type: 'checkbox',
				name: 'is_nation_competition',
			};
			if (curt.is_nation_competition) {
				is_nation_competition_attrs.checked = 'checked';
			}

			uiu.el(is_nation_competition_label, 'span', {}, '');
				input.is_nation_competition = uiu.el(is_nation_competition_label, 'input', is_nation_competition_attrs);
				uiu.el(is_nation_competition_label, 'span', {}, ci18n('nation competition'));
				bind_live_prop(input.is_nation_competition, 'is_nation_competition');
		}

		// btp-connection-div##################################################################################
		{
			const btp_connection_div = uiu.el(form, 'div', 'settings');
			uiu.el(btp_connection_div, 'h2', 'edit', ci18n('tournament:edit:btp_connection'));

			// BTP
			const btp_fieldset = uiu.el(btp_connection_div, 'fieldset');
			const btp_enabled_label = uiu.el(btp_fieldset, 'label');
			const ba_attrs = {
				type: 'checkbox',
				name: 'btp_enabled',
			};
			if (curt.btp_enabled) {
				ba_attrs.checked = 'checked';
			}
				input.btp_enabled = uiu.el(btp_enabled_label, 'input', ba_attrs);
				uiu.el(btp_enabled_label, 'span', {}, ci18n('tournament:edit:btp:enabled'));
				bind_live_prop(input.btp_enabled, 'btp_enabled');

			const btp_autofetch_enabled_label = uiu.el(btp_fieldset, 'label');
			const bae_attrs = {
				type: 'checkbox',
				name: 'btp_autofetch_enabled',
			};
			if (curt.btp_autofetch_enabled) {
				bae_attrs.checked = 'checked';
			}
				input.btp_autofetch_enabled = uiu.el(btp_autofetch_enabled_label, 'input', bae_attrs);
				uiu.el(btp_autofetch_enabled_label, 'span', {}, ci18n('tournament:edit:btp:autofetch_enabled'));
				bind_live_prop(input.btp_autofetch_enabled, 'btp_autofetch_enabled');

			const btp_readonly_label = uiu.el(btp_fieldset, 'label');
			const bro_attrs = {
				type: 'checkbox',
				name: 'btp_readonly',
			};
			if (curt.btp_readonly) {
				bro_attrs.checked = 'checked';
			}
				if (!curt['btp_autofetch_timeout_intervall']) {
					curt['btp_autofetch_timeout_intervall'] = 30000;
				}
				input.btp_autofetch_timeout_intervall = create_input(curt, "number", btp_connection_div, 'btp_autofetch_timeout_intervall')

				input.btp_readonly = uiu.el(btp_readonly_label, 'input', bro_attrs);
				uiu.el(btp_readonly_label, 'span', {}, ci18n('tournament:edit:btp:readonly'));
				bind_live_prop(input.btp_readonly, 'btp_readonly');

			const btp_ip_label = uiu.el(btp_fieldset, 'label');
			uiu.el(btp_ip_label, 'span', {}, ci18n('tournament:edit:btp:ip'));
				input.btp_ip = uiu.el(btp_ip_label, 'input', {
				type: 'text',
				name: 'btp_ip',
					value: (curt.btp_ip || ''),
				});
				bind_live_prop(input.btp_ip, 'btp_ip', { event_name: 'blur' });

			const btp_password_label = uiu.el(btp_fieldset, 'label');
			uiu.el(btp_password_label, 'span', {}, ci18n('tournament:edit:btp:password'));
				input.btp_password = uiu.el(btp_password_label, 'input', {
				type: 'text',
				name: 'btp_password',
					value: (curt.btp_password || ''),
				});
				bind_live_prop(input.btp_password, 'btp_password', { event_name: 'blur' });

			// BTP timezone
			const btp_timezone_label = uiu.el(btp_fieldset, 'label');
			uiu.el(btp_timezone_label, 'span', {}, ci18n('tournament:edit:btp:timezone'));
			const btp_timezone_select = uiu.el(btp_timezone_label, 'select', {
				name: 'btp_timezone',
			});
			uiu.el(
				btp_timezone_select, 'option', { value: 'system' },
				ci18n('tournament:edit:btp:system timezone', { tz: curt.system_timezone }));
			let marked = false;
			for (const tz of timezones.ALL_TIMEZONES) {
				const attrs = {
					value: tz,
				}

				if ((tz === curt.btp_timezone) && !marked) {
					marked = true;
					attrs.selected = 'selected';
				}

				uiu.el(btp_timezone_select, 'option', attrs, tz);
			}
				input.btp_timezone = btp_timezone_select;
				bind_live_prop(input.btp_timezone, 'btp_timezone');
		}		

		// tournament-flow-div##################################################################################
		{
			const tournament_flow_div = uiu.el(form, 'div', 'settings');
			uiu.el(tournament_flow_div, 'h2', 'edit', ci18n('tournament:edit:tournament_flow'));
			// Warmup Timer
			if (!curt.warmup_ready) {
				curt.warmup_ready = 150;
			}

			if (!curt.warmup_start) {
				curt.warmup_start = 180;
			}

			var warmup_options = [['bwf-2016', 90, 120, true],
				['legacy', 120, 120, true],
				['choise', curt.warmup_ready, curt.warmup_start, false],
				['call-down', curt.warmup_ready, curt.warmup_start, false],
				['call-up', 0, 0, true],
				['none', 0, 0, true]];

			var last_selected_warmup = warmup_options[0];

			const warmup_timer_label = uiu.el(tournament_flow_div, 'label');
			uiu.el(warmup_timer_label, 'span', {}, ci18n('tournament:edit:warmup_timer_behavior'));
			const warmup_timer_select = uiu.el(warmup_timer_label, 'select', {
				name: 'warmup',
			});
			uiu.el(warmup_timer_select, 'option', { value: warmup_options[0][0] }, ci18n('tournament:edit:warmup_timer_behavior:' + warmup_options[0][0]), { wo: warmup_options[0][0] });
			let warmup_marked = false;
				input.warmup = warmup_timer_select;

			const warmup_ready = uiu.el(tournament_flow_div, 'label');
			uiu.el(warmup_ready, 'span', {}, ci18n('tournament:edit:warmup_ready'));
			var warmup_ready_input = uiu.el(warmup_ready, 'input', {
				type: 'number',
				name: 'warmup_ready',
				required: 'required',
				disabled: warmup_options[0][3],
				value: warmup_options[0][1],
			});
				input.warmup_ready = warmup_ready_input;
				bind_live_prop(input.warmup_ready, 'warmup_ready', {
					get_value: input_el => Number(input_el.value),
				});

			const warmup_start = uiu.el(tournament_flow_div, 'label');
			uiu.el(warmup_start, 'span', {}, ci18n('tournament:edit:warmup_start'));
			var warmup_start_input = uiu.el(warmup_start, 'input', {
				type: 'number',
				name: 'warmup_start',
				required: 'required',
				disabled: warmup_options[0][3],
				value: warmup_options[0][2],
			});
				input.warmup_start = warmup_start_input;
				bind_live_prop(input.warmup_start, 'warmup_start', {
					get_value: input_el => Number(input_el.value),
				});

			for (const wo of warmup_options.slice(1)) {
				const attrs = {
					value: wo[0],
				}
	
				if ((wo[0] === curt.warmup) && !warmup_marked) {
					warmup_marked = true;
					attrs.selected = 'selected';
	
					warmup_ready_input.value = wo[1];
					warmup_ready_input.disabled = wo[3];
					warmup_start_input.value = wo[2];
					warmup_start_input.disabled = wo[3];
	
					last_selected_warmup = wo;
				}
	
				uiu.el(warmup_timer_select, 'option', attrs, ci18n('tournament:edit:warmup_timer_behavior:' + wo[0]));
			}
	
				warmup_timer_select.onchange = function () {
				if (!last_selected_warmup[3]) {
					for (const wo of warmup_options) {
						if (!wo[3]) {
							wo[1] = warmup_ready_input.value;
							wo[2] = warmup_start_input.value;
						}
					}
				}
	
				for (const wo of warmup_options) {
					if (warmup_timer_select.value == wo[0]) {
						warmup_ready_input.value = wo[1];
						warmup_ready_input.disabled = wo[3];
						warmup_start_input.value = wo[2];
						warmup_start_input.disabled = wo[3];
	
							last_selected_warmup = wo;
						}
					}
					send_single_prop('warmup', warmup_timer_select.value, function(err) {
						if (err) {
							return cerror.net(err);
						}
					});
					send_single_prop('warmup_ready', Number(warmup_ready_input.value), function(err) {
						if (err) {
							return cerror.net(err);
						}
					});
					send_single_prop('warmup_start', Number(warmup_start_input.value), function(err) {
						if (err) {
							return cerror.net(err);
						}
					});
				};

			const bts_fieldset = uiu.el(tournament_flow_div, 'fieldset');
			input.call_preparation_matches_automatically_enabled    = create_checkbox(curt, bts_fieldset, 'call_preparation_matches_automatically_enabled');
			input.call_next_possible_scheduled_match_in_preparation = create_checkbox(curt, bts_fieldset, 'call_next_possible_scheduled_match_in_preparation');

			const tablet_fieldset = uiu.el(tournament_flow_div, 'fieldset');
			input.tabletoperator_enabled                            = create_checkbox(curt, tablet_fieldset, 'tabletoperator_enabled');
			input.tabletoperator_with_umpire_enabled                = create_checkbox(curt, tablet_fieldset, 'tabletoperator_with_umpire_enabled');
			input.tabletoperator_winner_of_quaterfinals_enabled     = create_checkbox(curt, tablet_fieldset, 'tabletoperator_winner_of_quaterfinals_enabled');
			input.tabletoperator_use_manual_counting_boards_enabled = create_checkbox(curt, tablet_fieldset, 'tabletoperator_use_manual_counting_boards_enabled');
			input.tabletoperator_split_doubles                      = create_checkbox(curt, tablet_fieldset, 'tabletoperator_split_doubles');
			input.tabletoperator_with_state_enabled                 = create_checkbox(curt, tablet_fieldset, 'tabletoperator_with_state_enabled');
			input.tabletoperator_with_state_from_match_enabled      = create_checkbox(curt, tablet_fieldset, 'tabletoperator_with_state_from_match_enabled');
			input.tabletoperator_set_break_after_tabletservice      = create_checkbox(curt, tablet_fieldset, 'tabletoperator_set_break_after_tabletservice');

			if (!curt.tabletoperator_break_seconds) {
				curt.tabletoperator_break_seconds = 300;
			}
			input.tabletoperator_break_seconds                      = create_input(curt, "number", tablet_fieldset, 'tabletoperator_break_seconds')
		
		}


		// scoring-formats-div##############################################################################
		{
		const scoring_div = uiu.el(form, "div", "settings");
		scoring_formats_main = scoring_div;
		render_scoring_formats(scoring_div);
		render_stages_scoring_formats(scoring_div)
		}



		// call-div##################################################################################
		{
			const call_div = uiu.el(form, 'div', 'settings');
			uiu.el(call_div, 'h2', 'edit', ci18n('tournament:edit:calls'));
			
			const announcements_fieldset = uiu.el(call_div, 'fieldset');
			input.annoncement_include_event = create_checkbox(curt, announcements_fieldset, 'annoncement_include_event');
			input.annoncement_include_round = create_checkbox(curt, announcements_fieldset, 'annoncement_include_round');
			input.annoncement_include_matchnumber = create_checkbox(curt, announcements_fieldset, 'annoncement_include_matchnumber');
			input.preparation_meetingpoint_enabled = create_checkbox(curt, announcements_fieldset, 'preparation_meetingpoint_enabled');
			input.preparation_tabletoperator_setup_enabled = create_checkbox(curt, announcements_fieldset, 'preparation_tabletoperator_setup_enabled');

			input.announcement_speed = create_numeric_input(curt, call_div, 'announcement_speed', 0.8, 1.3, 1.05, 0.01);
			input.announcement_pause_time_ms = create_numeric_input(curt, call_div, 'announcement_pause_time_ms', 0.0, 5.0, 2.0, 0.1);

			render_normalisation_values(uiu.el(call_div, 'div','normalizations_values_div'));

		
		}

		// upcoming-div ###################################################################################################
		{
			const upcoming_div = uiu.el(form, 'div', 'settings');
			uiu.el(upcoming_div, 'h2', 'edit', ci18n('tournament:edit:upcoming_matches_settings'));

			const upcoming_fieldset = uiu.el(upcoming_div, 'fieldset');
			input.upcoming_animation_speed = create_numeric_input(curt, upcoming_fieldset, 'upcoming_matches_animation_speed', 0, 10, 2, 1);
			input.upcoming_animation_pause = create_numeric_input(curt, upcoming_fieldset, 'upcoming_matches_animation_pause', 1, 20, 4, 1);
			input.upcoming_matches_max_count = create_numeric_input(curt, upcoming_fieldset, 'upcoming_matches_max_count', 10, 50, 15, 1);
		}

// officials_host ######################################################################################################

		// irgendwo in ui_edit (oder wo du initial renderst)
		const officials_host = uiu.el(form, 'div', { id: 'officials_host' });
		update_official_tables(officials_host);  // initial + später auch für Updates

		
		
		// devices-div##################################################################################
		{
			const devices_div = uiu.el(form, 'div', 'settings');
			uiu.el(devices_div, 'h2', 'edit', ci18n('tournament:edit:devices'));
			
			render_logo_preview(devices_div);

			const default_display_fieldset = uiu.el(devices_div, 'fieldset');
			// Default display
			const cur_dm_style = curt.dm_style || 'international';
			const dm_style_label = uiu.el(default_display_fieldset, 'label');
			uiu.el(dm_style_label, 'span', {}, ci18n('tournament:edit:dm_style'));
			const dm_style_select = uiu.el(dm_style_label, 'select', {
				name: 'dm_style',
				required: 'required',
			});
			const all_dm_styles = displaymode.ALL_STYLES;
			for (const s of all_dm_styles) {
				const s_attrs = {
					value: s,
				};
				if (s === cur_dm_style) {
					s_attrs.selected = 'selected';
				}
				uiu.el(dm_style_select, 'option', s_attrs, s);
			}
				input.dm_style = dm_style_select;
				bind_live_prop(input.dm_style, 'dm_style');

			const displaysettings_style_label = uiu.el(default_display_fieldset, 'label');
			uiu.el(displaysettings_style_label, 'span', {}, ci18n('tournament:edit:displaysettings_general'));

				input.displaysettings_general = createGeneralDisplaySettingsSelectBox(displaysettings_style_label, curt.displaysettings_general ? curt.displaysettings_general : "default");
				bind_live_prop(input.displaysettings_general, 'displaysettings_general');

			const general_displaysettings_div = uiu.el(devices_div, 'div', 'general_displaysettings');
			render_general_displaysettings(general_displaysettings_div);
			render_displaysettings(devices_div);
		}


		// advertisement-div##################################################################################
		{
			const advertisement_div = uiu.el(form, 'div', 'settings');
			render_advertisements(advertisement_div);
		}


		
		// location-div##################################################################################
		{
			const location_div = uiu.el(form, 'div', 'settings');
			render_locations(location_div);
			render_courts(location_div);
		}

		// ticker-connection-div##################################################################################
		{
			const ticker_div = uiu.el(form, 'div', 'settings');
			uiu.el(ticker_div, 'h2', 'edit', ci18n('tournament:edit:ticker_connection'));
			
			const ticker_fieldset = uiu.el(ticker_div, 'fieldset');
			const ticker_enabled_label = uiu.el(ticker_fieldset, 'label');
			const te_attrs = {
				type: 'checkbox',
				name: 'ticker_enabled',
			};
			if (curt.ticker_enabled) {
				te_attrs.checked = 'checked';
			}
				input.ticker_enabled = uiu.el(ticker_enabled_label, 'input', te_attrs);
				uiu.el(ticker_enabled_label, 'span', {}, ci18n('tournament:edit:ticker_enabled'));
				bind_live_prop(input.ticker_enabled, 'ticker_enabled');
	
			const ticker_url_label = uiu.el(ticker_fieldset, 'label');
			uiu.el(ticker_url_label, 'span', {}, ci18n('tournament:edit:ticker_url'));
				input.ticker_url = uiu.el(ticker_url_label, 'input', {
				type: 'text',
				name: 'ticker_url',
					value: (curt.ticker_url || ''),
				});
				bind_live_prop(input.ticker_url, 'ticker_url', { event_name: 'blur' });
	
			const ticker_password_label = uiu.el(ticker_fieldset, 'label');
			uiu.el(ticker_password_label, 'span', {}, ci18n('tournament:edit:ticker_password'));
				input.ticker_password = uiu.el(ticker_password_label, 'input', {
				type: 'text',
				name: 'ticker_password',
					value: (curt.ticker_password || ''),
				});
				bind_live_prop(input.ticker_password, 'ticker_password', { event_name: 'blur' });
		}

			// save-div##################################################################################
			{
				const save_div = uiu.el(form, 'div', 'settings');
				uiu.el(save_div, 'h2', 'edit', ci18n('tournament:edit'));
				live_settings_pending_requests = 0;
				live_settings_status_el = uiu.el(save_div, 'div', {
					class: 'live_settings_status live_settings_status_saved',
				}, ci18n('tournament:edit:live_status:saved'));

				const back_btn = uiu.el(save_div, 'button', {
					role: 'button',
				}, ci18n('Back'));
				back_btn.addEventListener('click', () => {
					ui_show();
				});
			}		
			update_edit_dependencies();
		}
	_route_single(/t\/([a-z0-9]+)\/edit$/, ui_edit, change.default_handler(_update_all_ui_elements_edit, {
		update_general_displaysettings: update_general_displaysettings,
		update_player_status: update_player_status,
	}));

		function update_scoring_formats() {
		if (!scoring_formats_main) {
			if (typeof debug !== "undefined" && debug?.log) {
				debug.log("update_scoring_formats: main container not initialized");	
			}
			return;
		}

		// kompletten Bereich leeren
		while (scoring_formats_main.firstChild) {
			scoring_formats_main.removeChild(scoring_formats_main.firstChild);
		}

		// vollständig neu rendern
		render_scoring_formats(scoring_formats_main);
		render_stages_scoring_formats(scoring_formats_main);
	}

	function format_duration_ms(durationMs) {
		const duration = Number(durationMs);
		if (!Number.isFinite(duration) || duration < 0) {
			return "—";
		}
		if (duration === 0) {
			return "0 s";
		}
		return `${Math.round(duration / 1000)} s`;
	}

	function format_set_rule_summary(setPoints) {
		if (!setPoints) {
			return "—";
		}

		const endPoints = setPoints.end_points ?? "—";
		const maxPoints = setPoints.max_points ?? "—";
		return `${endPoints} / ${maxPoints}`;
	}

	function parse_nullable_number(value) {
		if (value === undefined || value === null || value === "") {
			return null;
		}
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function duration_ms_to_seconds(value) {
		const duration = parse_nullable_number(value);
		if (duration === null) {
			return "";
		}
		return duration / 1000;
	}

	function duration_seconds_to_ms(value) {
		const duration = parse_nullable_number(value);
		if (duration === null) {
			return null;
		}
		return duration * 1000;
	}

	function is_break_in_set_enabled(setPoints) {
		if (!setPoints) {
			return false;
		}
		if (typeof setPoints.interval_enabled === "boolean") {
			return setPoints.interval_enabled;
		}
		return (
			setPoints.interval_at !== null &&
			setPoints.interval_at !== undefined &&
			setPoints.interval_duration_ms !== null &&
			setPoints.interval_duration_ms !== undefined
		);
	}

	function clone_scoring_formats() {
		const scoringFormats = curt?.scoring_formats || { formats: [], default_id: null };
		return structuredClone(scoringFormats);
	}

	function _cancel_ui_edit_scoring_format() {
		const dlg = document.querySelector('.scoring_format_edit_dialog');
		if (!dlg) {
			return;
		}
		cbts_utils.esc_stack_pop();
		uiu.remove(dlg);
	}

	function close_scoring_format_dialog_if_open(scoringFormatId, reason_i18n_key) {
		const dlg = document.querySelector('.scoring_format_edit_dialog');
		if (!dlg) {
			return false;
		}
		const open_id = dlg.getAttribute('data-scoring-format-id');
		if (typeof scoringFormatId !== 'undefined' && scoringFormatId !== null && Number(open_id) !== Number(scoringFormatId)) {
			return false;
		}
		_cancel_ui_edit_scoring_format();
		if (reason_i18n_key) {
			const reason_text = ci18n(reason_i18n_key);
			if (!set_live_settings_status_message(reason_text, 'error')) {
				cerror.silent(reason_text);
			}
		}
		return true;
	}

	function create_scoring_format_field(parent, label, name, value, type = "text", attrs = {}) {
		const row = uiu.el(parent, 'label', 'scoring_format_edit_row');
		uiu.el(row, 'span', {}, label);
		return uiu.el(row, 'input', Object.assign({
			type,
			name,
			value: value ?? '',
		}, attrs));
	}

	function create_scoring_format_checkbox(parent, label, name, checked) {
		const row = uiu.el(parent, 'label', 'scoring_format_edit_row');
		uiu.el(row, 'span', {}, label);
		const attrs = {
			type: 'checkbox',
			name,
		};
		if (checked) {
			attrs.checked = 'checked';
		}
		return uiu.el(row, 'input', attrs);
	}

	function is_scoring_value_editable(setPoints, fieldName) {
		return !!(setPoints && setPoints[`${fieldName}_editable`]);
	}

	function render_scoring_format_edit_section(parent, prefix, title, setPoints) {
		const fieldset = uiu.el(parent, 'fieldset', 'scoring_format_edit_section');
		uiu.el(fieldset, 'legend', {}, title);
		const endPointAttrs = { min: 1, step: 1 };
		if (!is_scoring_value_editable(setPoints, "end_points")) {
			endPointAttrs.disabled = 'disabled';
		} else {
			endPointAttrs.required = 'required';
		}
		const maxPointAttrs = { min: 1, step: 1 };
		if (!is_scoring_value_editable(setPoints, "max_points")) {
			maxPointAttrs.disabled = 'disabled';
		} else {
			maxPointAttrs.required = 'required';
		}
		const endPointsInput = create_scoring_format_field(fieldset, ci18n("tournament:edit:scoring_formats:end_points_label"), `${prefix}_end_points`, setPoints?.end_points, "number", endPointAttrs);
		const maxPointsInput = create_scoring_format_field(fieldset, ci18n("tournament:edit:scoring_formats:max_points"), `${prefix}_max_points`, setPoints?.max_points, "number", maxPointAttrs);
		const hasBreakInSet = is_break_in_set_enabled(setPoints);
		const breakEnabled = create_scoring_format_checkbox(fieldset, ci18n("tournament:edit:scoring_formats:break_in_set_enabled"), `${prefix}_break_in_set_enabled`, hasBreakInSet);
		const intervalAtInput = create_scoring_format_field(fieldset, ci18n("tournament:edit:scoring_formats:interval_at"), `${prefix}_interval_at`, setPoints?.interval_at, "number", { min: 0, step: 1 });
		const intervalDurationInput = create_scoring_format_field(fieldset, `${ci18n("tournament:edit:scoring_formats:interval_duration")} (s)`, `${prefix}_interval_duration_s`, duration_ms_to_seconds(setPoints?.interval_duration_ms), "number", { min: 0, step: 1 });
		create_scoring_format_field(fieldset, `${ci18n("tournament:edit:scoring_formats:break_before_set")} (s)`, `${prefix}_break_before_set_duration_s`, duration_ms_to_seconds(setPoints?.break_before_set_duration_ms), "number", { min: 0, step: 1 });

		function normalizeScoreInputs() {
			if (!endPointsInput.disabled) {
				let endPoints = Number(endPointsInput.value);
				if (!Number.isFinite(endPoints) || endPoints < 1) {
					endPoints = Math.max(1, Number(setPoints?.end_points) || 1);
				}
				endPointsInput.value = String(endPoints);
				if (!maxPointsInput.disabled) {
					maxPointsInput.min = String(endPoints);
					let maxPoints = Number(maxPointsInput.value);
					if (!Number.isFinite(maxPoints) || maxPoints < endPoints) {
						maxPoints = endPoints;
					}
					maxPointsInput.value = String(maxPoints);
				}
			} else if (!maxPointsInput.disabled) {
				let maxPoints = Number(maxPointsInput.value);
				const minValue = Math.max(1, Number(setPoints?.end_points) || 1);
				maxPointsInput.min = String(minValue);
				if (!Number.isFinite(maxPoints) || maxPoints < minValue) {
					maxPointsInput.value = String(minValue);
				}
			}
		}

		if (!endPointsInput.disabled) {
			endPointsInput.addEventListener('input', normalizeScoreInputs);
			endPointsInput.addEventListener('blur', normalizeScoreInputs);
		}
		if (!maxPointsInput.disabled) {
			maxPointsInput.addEventListener('input', normalizeScoreInputs);
			maxPointsInput.addEventListener('blur', normalizeScoreInputs);
		}
		normalizeScoreInputs();

		function updateBreakInSetUi() {
			const enabled = breakEnabled.checked;
			intervalAtInput.disabled = !enabled;
			intervalDurationInput.disabled = !enabled;
		}

		breakEnabled.addEventListener('change', updateBreakInSetUi);
		updateBreakInSetUi();
	}

	function scoring_format_from_form_data(baseFormat, data) {
		const scoringFormat = structuredClone(baseFormat);

		function update_set_points(target, prefix) {
			if (is_scoring_value_editable(target, "end_points")) {
				target.end_points = Math.max(1, Number(data[`${prefix}_end_points`]));
			}
			if (is_scoring_value_editable(target, "max_points")) {
				const minPoints = Math.max(1, Number(target.end_points));
				target.max_points = Math.max(minPoints, Number(data[`${prefix}_max_points`]));
			}
			const hasBreakInSet = !!data[`${prefix}_break_in_set_enabled`];
			target.interval_enabled = hasBreakInSet;
			if (hasBreakInSet) {
				target.interval_at = parse_nullable_number(data[`${prefix}_interval_at`]);
				target.interval_duration_ms = duration_seconds_to_ms(data[`${prefix}_interval_duration_s`]);
			}
			target.break_before_set_duration_ms = duration_seconds_to_ms(data[`${prefix}_break_before_set_duration_s`]);
		}

		update_set_points(scoringFormat.set_points, 'set_points');
		update_set_points(scoringFormat.last_set_points, 'last_set_points');
		return scoringFormat;
	}

	function save_scoring_format(scoringFormatId, scoringFormat, callback) {
		send_with_live_status({
			type: 'tournament_edit_scoring_format',
			key: curt.key,
			scoring_format: scoringFormat,
		}, callback);
	}

	function ui_edit_scoring_format(scoringFormatId) {
		const scoringFormats = curt?.scoring_formats;
		const baseFormat = structuredClone(utils.find((scoringFormats && scoringFormats.formats) || [], f => Number(f.id) === Number(scoringFormatId)));
		if (!baseFormat) {
			return;
		}

		cbts_utils.esc_stack_push(_cancel_ui_edit_scoring_format);

		const body = uiu.qs('body');
		const dialogBg = uiu.el(body, 'div', 'dialog_bg scoring_format_edit_dialog', {
			'data-scoring-format-id': scoringFormatId,
		});
		dialogBg.addEventListener('click', (e) => {
			if (e.target === dialogBg) {
				_cancel_ui_edit_scoring_format();
			}
		});

		const dialog = uiu.el(dialogBg, 'div', 'dialog');
		uiu.el(dialog, 'h3', {}, ci18n('tournament:edit:scoring_formats:dialog_title'));

		const form = uiu.el(dialog, 'form');
		const container = uiu.el(form, 'div', 'scoring_format_edit_container');
		uiu.el(container, 'div', 'hint', ci18n('tournament:edit:scoring_formats:dialog_hint'));
		create_scoring_format_field(container, ci18n("tournament:edit:scoring_formats:name"), 'name', baseFormat.name, 'text', { disabled: 'disabled' });
		create_scoring_format_field(container, ci18n("tournament:edit:scoring_formats:num_sets"), 'numSets', baseFormat.numSets, 'number', { min: 1, step: 1, disabled: 'disabled' });
		render_scoring_format_edit_section(container, 'set_points', ci18n("tournament:edit:scoring_formats:regular_sets"), baseFormat.set_points);
		render_scoring_format_edit_section(container, 'last_set_points', ci18n("tournament:edit:scoring_formats:last_set"), baseFormat.last_set_points);

		const buttons = uiu.el(form, 'div', { style: 'margin-top: 2em;' });
		uiu.el(buttons, 'button', {
			'class': 'match_save_button',
			role: 'submit',
		}, ci18n('Change'));

		form_utils.onsubmit(form, function(data) {
			const scoringFormat = scoring_format_from_form_data(baseFormat, data);
			save_scoring_format(scoringFormatId, scoringFormat, (err) => {
				if (err) {
					return cerror.net(err);
				}
				_cancel_ui_edit_scoring_format();
			});
		});

		const cancelBtn = uiu.el(buttons, 'span', 'match_cancel_link vlink', ci18n('Cancel'));
		cancelBtn.addEventListener('click', _cancel_ui_edit_scoring_format);
	}

	function render_scoring_formats(main) {
		uiu.el(main, "h2", "edit", ci18n("tournament:edit:scoring_formats"));

		const sf = curt?.scoring_formats || { formats: [], default_id: null };
		const formats = Array.isArray(sf.formats) ? sf.formats : [];
		const defaultId = sf.default_id;

		const table = uiu.el(main, "table", "scoring_formats_table");
		const tbody = uiu.el(table, "tbody");

		{
			const tr = uiu.el(tbody, "tr");
			uiu.el(tr, "th", { class: "scoring_format_name_cell" }, ci18n("tournament:edit:scoring_formats:name"));
			uiu.el(tr, "th", { class: "scoring_format_center_cell" }, ci18n("tournament:edit:scoring_formats:num_sets"));
			uiu.el(tr, "th", { class: "scoring_format_type_cell" }, ci18n("tournament:edit:scoring_formats:type"));
			uiu.el(tr, "th", { class: "scoring_format_center_cell" }, ci18n("tournament:edit:scoring_formats:end_max"));
			uiu.el(tr, "th", { class: "scoring_format_center_cell" }, ci18n("tournament:edit:scoring_formats:interval_at"));
			uiu.el(tr, "th", { class: "scoring_format_right_cell" }, ci18n("tournament:edit:scoring_formats:interval_duration"));
			uiu.el(tr, "th", { class: "scoring_format_right_cell" }, ci18n("tournament:edit:scoring_formats:break_before_set"));
			uiu.el(tr, "th", { class: "scoring_format_center_cell" }, ci18n("tournament:edit:scoring_formats:default"));
			uiu.el(tr, "th", { class: "scoring_format_center_cell" }, ci18n("tournament:edit:scoring_formats:edit"));
		}

		for (const [formatIndex, f] of formats.entries()) {
			const rowClass = (formatIndex % 2 === 0) ? "scoring_formats_row_group_even" : "scoring_formats_row_group_odd";
			const regularTr = uiu.el(tbody, "tr", rowClass);
			const lastTr = uiu.el(tbody, "tr", `scoring_formats_subrow ${rowClass}`);
			const regularSetPoints = f?.set_points;
			const lastSetPoints = f?.last_set_points;
			const isDefault = Number(f.id) === Number(defaultId);
				const canEdit = true;

				uiu.el(regularTr, "td", { rowspan: 2, class: "scoring_format_name_cell" }, f.name || "");
				uiu.el(regularTr, "td", { rowspan: 2, class: "scoring_format_center_cell" }, String(f.numSets ?? ""));
				uiu.el(regularTr, "td", { class: "scoring_format_type_cell scoring_format_rule_cell" }, ci18n("tournament:edit:scoring_formats:type_regular"));
				uiu.el(regularTr, "td", { class: "scoring_format_rule_cell scoring_format_center_cell" }, format_set_rule_summary(regularSetPoints));
				uiu.el(regularTr, "td", { class: "scoring_format_rule_cell scoring_format_center_cell" }, is_break_in_set_enabled(regularSetPoints) ? String(regularSetPoints.interval_at) : "—");
				uiu.el(regularTr, "td", { class: "scoring_format_rule_cell scoring_format_right_cell" }, is_break_in_set_enabled(regularSetPoints) ? format_duration_ms(regularSetPoints && regularSetPoints.interval_duration_ms) : "—");
				uiu.el(regularTr, "td", { class: "scoring_format_rule_cell scoring_format_right_cell" }, format_duration_ms(regularSetPoints && regularSetPoints.break_before_set_duration_ms));

				const defTd = uiu.el(regularTr, "td", { rowspan: 2, class: "scoring_format_center_cell" });
				if (isDefault) {
					uiu.el(defTd, "span", {
						class: "default_scoring_format_badge",
						title: ci18n("tournament:edit:scoring_formats:default"),
					}, ci18n("tournament:edit:scoring_formats:default_badge"));
				} else {
					uiu.el(defTd, "span", { class: "default_scoring_format_badge default_scoring_format_badge_inactive" }, "—");
				}

				const actionsTd = uiu.el(regularTr, "td", { rowspan: 2, class: "scoring_format_center_cell" });
				const editBtn = uiu.el(
					actionsTd,
					"button",
					{ "data-scoring-format-id": f.id },
					ci18n("tournament:edit:scoring_formats:edit")
					);

				editBtn.addEventListener("click", (e) => {
					const id = e.target.getAttribute("data-scoring-format-id");
					ui_edit_scoring_format(id);
				});

				uiu.el(lastTr, "td", { class: "scoring_format_type_cell scoring_format_rule_cell" }, ci18n("tournament:edit:scoring_formats:type_last"));
				uiu.el(lastTr, "td", { class: "scoring_format_rule_cell scoring_format_center_cell" }, format_set_rule_summary(lastSetPoints));
				uiu.el(lastTr, "td", { class: "scoring_format_rule_cell scoring_format_center_cell" }, is_break_in_set_enabled(lastSetPoints) ? String(lastSetPoints.interval_at) : "—");
				uiu.el(lastTr, "td", { class: "scoring_format_rule_cell scoring_format_right_cell" }, is_break_in_set_enabled(lastSetPoints) ? format_duration_ms(lastSetPoints && lastSetPoints.interval_duration_ms) : "—");
				uiu.el(lastTr, "td", { class: "scoring_format_rule_cell scoring_format_right_cell" }, format_duration_ms(lastSetPoints && lastSetPoints.break_before_set_duration_ms));
		}
	}

	function update_stages_scoring_formats() {
		if (!scoring_formats_main) {
			if (typeof debug !== "undefined" && debug?.log) {
				debug.log("update_scoring_formats: main container not initialized");	
			}
			return;
		}

		// kompletten Bereich leeren
		while (scoring_formats_main.firstChild) {
			scoring_formats_main.removeChild(scoring_formats_main.firstChild);
		}

		// vollständig neu rendern
		render_scoring_formats(scoring_formats_main);
		render_stages_scoring_formats(scoring_formats_main);
	}

	function render_stages_scoring_formats(main) {
		const sf = curt?.scoring_formats || { formats: [], default_id: null };
		const defaultId = sf.default_id;

		// Build lookup: scoring_format_id -> scoring_format_name
		const formatNameById = new Map();
		for (const f of sf.formats || []) {
			formatNameById.set(Number(f.id), f.name || String(f.id));
		}

		const eventsPayload = curt?.events?.events || [];
		const deviations = [];

		for (const ev of eventsPayload) {
			const eventName = ev?.name || "";
			const stages = Array.isArray(ev?.stages) ? ev.stages : [];

			for (const st of stages) {
				// Missing/null scoring_format => default
				const stageSfId =
					st && st.scoring_format !== undefined && st.scoring_format !== null
					? Number(st.scoring_format)
					: null;

				if (
					stageSfId !== null &&
					defaultId !== null &&
					defaultId !== undefined &&
					stageSfId !== Number(defaultId)
				) {
					deviations.push({
						event_name: eventName,
						stage_name: st?.name || "",
						scoring_format_id: stageSfId,
						scoring_format_name: formatNameById.get(stageSfId) || String(stageSfId),
					});
				}
			}
		}

		deviations.sort((a, b) => {
			const e = (a.event_name || "").localeCompare(b.event_name || "");
			if (e) return e;
			const s = (a.stage_name || "").localeCompare(b.stage_name || "");
			if (s) return s;
			return (a.scoring_format_id || 0) - (b.scoring_format_id || 0);
		});

		uiu.el(main, "h3", "edit", "Abweichungen vom Default");

		if (defaultId === null || defaultId === undefined) {
			uiu.el(
				main,
				"div",
				"hint",
				"Kein Default-Scoring-Format gefunden (scoring_formats.default_id ist leer)."
			);
			return;
		}

		if (deviations.length === 0) {
			uiu.el(main, "div", "hint", "Keine Stages weichen vom Default-Scoring-Format ab.");
			return;
		}

		const devTable = uiu.el(main, "table", "scoring_format_deviations_table");
		const devBody = uiu.el(devTable, "tbody");

		{
			const tr = uiu.el(devBody, "tr");
			uiu.el(tr, "th", {}, "Event");
			uiu.el(tr, "th", {}, "Stage");
			uiu.el(tr, "th", {}, "Verwendete Zählweise");
		}

		for (const d of deviations) {
			const tr = uiu.el(devBody, "tr");
			uiu.el(tr, "td", {}, d.event_name);
			uiu.el(tr, "td", {}, d.stage_name);
			uiu.el(tr, "td", {}, `${d.scoring_format_name} (#${d.scoring_format_id})`);
		}
	}



	function render_normalisation_values(main) {
		uiu.el(main, 'h2','edit', ci18n('tournament:edit:normalizations'));

		const display_table = uiu.el(main, 'table');
		const display_tbody = uiu.el(display_table, 'tbody');
		const tr = uiu.el(display_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:normalizations:origin'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:normalizations:replace'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:normalizations:language'));
		uiu.el(tr, 'th', {}, '');
		const tr_input = uiu.el(display_tbody, 'tr');
		create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'normalizations_origin');
		create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'normalizations_replace');

		// Tournament language selection
		const language_td = uiu.el(tr_input, 'td');
		const language_select = uiu.el(language_td, 'select', {
		 	name: 'language',
		 	required: 'required',
			name: 'normalizations_language',
			id: 'normalizations_language',
		});
		const all_langs = ci18n.get_all_languages();
		for (const l of all_langs) {
			const l_attrs = {
		 		value: l['announcements:lang'],
		 	};
		 	if (l._code === curt.language) {
		 		l_attrs.selected = 'selected';
		 	}
		 	uiu.el(language_select, 'option', l_attrs, l._name);
		}

		//create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'normalizations_language');
		const actions_td = uiu.el(tr_input, 'td', {});
		const add_btn = uiu.el(actions_td, 'button', {}, ci18n('tournament:edit:add'));
		add_btn.addEventListener('click', function (e) {

			var new_normalization = {}
			new_normalization.origin = document.getElementById('normalizations_origin').value;
			new_normalization.replace = document.getElementById('normalizations_replace').value;
			new_normalization.language = document.getElementById('normalizations_language').value;

			send_with_live_status({
				type: 'normalization_add',
				tournament_key: curt.key,
				normalization: new_normalization,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
		for (const nv of curt.normalizations) {
			const tr = uiu.el(display_tbody, 'tr');
			uiu.el(tr, 'td', {}, nv.origin);
			uiu.el(tr, 'td', {}, nv.replace);
			uiu.el(tr, 'td', {}, nv.language);
			const actions_td = uiu.el(tr, 'td', {});
			const delete_btn = uiu.el(actions_td, 'button', {
				'data-normalization-id': nv._id,
			}, ci18n('tournament:edit:delete'));
						
			delete_btn.addEventListener('click', function (e) {
				const del_btn = e.target;
				const normalization_id = del_btn.getAttribute('data-normalization-id');
					send_with_live_status({
						type: 'normalization_remove',
						tournament_key: curt.key,
						normalization_id: normalization_id,
				}, err => {
					if (err) {
						return cerror.net(err);
					}
				});
			});
		}
	}

	function render_advertisements(main) {
		uiu.el(main, 'h2', 'edit', ci18n('tournament:edit:advertisements'));

		const display_table = uiu.el(main, 'table');
		const display_tbody = uiu.el(display_table, 'tbody');
		const tr = uiu.el(display_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:advertisements:id'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:advertisements:url'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:advertisements:type'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:advertisements:disabled'));
		uiu.el(tr, 'th', {}, '');
		const tr_input = uiu.el(display_tbody, 'tr');
		uiu.el(tr_input, 'td', {}, '');
		create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'advertisement_url');
		create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'advertisement_type');
		uiu.el(tr_input, 'td', {}, '');
		const actions_td = uiu.el(tr_input, 'td', {});
		const add_btn = uiu.el(actions_td, 'button', {}, ci18n('tournament:edit:add'));
		add_btn.addEventListener('click', function (e) {

			var new_advertisement = {}
			new_advertisement.id = generateGUID();
			new_advertisement.url = document.getElementById('advertisement_url').value;
			new_advertisement.type = document.getElementById('advertisement_type').value;
			new_advertisement.disabled = false;
				send_with_live_status({
					type: 'advertisement_add',
					tournament_key: curt.key,
					advertisement: new_advertisement,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
		for (const nv of curt.advertisements) {
			const tr = uiu.el(display_tbody, 'tr');
			uiu.el(tr, 'td', {}, nv.id);
			uiu.el(tr, 'td', {}, nv.url);
			uiu.el(tr, 'td', {}, nv.type);
			uiu.el(tr, 'td', {}, nv.disabled);
			const actions_td = uiu.el(tr, 'td', {});
			const delete_btn = uiu.el(actions_td, 'button', {
				'data-advertisement-id': nv._id,
			}, ci18n('tournament:edit:delete'));

			delete_btn.addEventListener('click', function (e) {
				const del_btn = e.target;
				const advertisement_id = del_btn.getAttribute('data-advertisement-id');
					send_with_live_status({
						type: 'advertisement_remove',
						tournament_key: curt.key,
						advertisement_id: advertisement_id,
				}, err => {
					if (err) {
						return cerror.net(err);
					}
				});
			});
		}
	}
	function generateGUID() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
			const random = Math.random() * 16 | 0;
			const value = char === 'x' ? random : (random & 0x3 | 0x8);
			return value.toString(16);
		});
	}

	function set_battery_state(battery, node) {
		if (battery && battery != null) {
			node.removeAttribute("class");
			let level = Math.floor(battery.level * 100);
			node.innerHTML = level + '%';
			if (battery.charging) {
				node.classList.add('battery-status-charging');

				node.title = ci18n('tournament:edit:displays:battery_charging_time', {
					battery_charging_time : Math.floor(battery.chargingTime / 60)
				});
			} else {
				node.title = ci18n('tournament:edit:displays:battery_duscharging_time', {
					battery_discharging_time: Math.floor(battery.dischargingTime / 60)
				});
				
				if (level <= 10) {
					node.classList.add('battery-status-red');
				} else if (level <= 20) {
					node.classList.add('battery-status-orange');
				} else if (level <= 40) {
					node.classList.add('battery-status-yellow');
				} else {
					node.classList.add('battery-status-green');
				}
			}
		}
	}

	function render_logo_preview(main) {
		uiu.el(main, 'h3', 'edit', ci18n('tournament:edit:logo'));
		const logo_preview_container = uiu.el(main, 'div', {
			style: (
				'position:relative;text-align:center;' +
				'height: 432px; width: 768px; font-size: 70px;' +
				'background:' + (curt.logo_background_color || '#000000') + ';' +
				'color:' + (curt.logo_foreground_color || '#aaaaaa') + ';'
			),
			name: "logo_preview",
		});
		if (curt.logo_id) {
			uiu.el(logo_preview_container, 'img', {
				style: 'height: 320px;',
				src: '/h/' + encodeURIComponent(curt.key) + '/logo/' + curt.logo_id,
				name: 'logo_preview_img'
			});
		}
		uiu.el(logo_preview_container, 'div', {}, 'Court 42');

		const logo_form = uiu.el(main, 'form', 'logo_form');
		const logo_button_id = 'logo_upload_input';

		const custom_label = uiu.el(logo_form, 'label', {
			for: logo_button_id,
			style: (
				'display:inline-block;padding:3px 8px;cursor:pointer; border:1px solid;' +
				'background:#eeeeee;color:black;border-radius:4px;margin:10px;'
			),
		}, 'Logo auswählen');

		const filename_display = uiu.el(logo_form, 'span', {
			id: 'upload_filename',
			style: 'font-style: italic; color: #555;',
		}, curt.logo_name ? curt.logo_name : 'Noch keine Datei ausgewählt');

		const logo_button = uiu.el(logo_form, 'input', {
			id: logo_button_id,
			type: 'file',
			accept: 'image/*',
			style: 'display:none;',
		});
		logo_button.addEventListener('change', (e) => {
			_upload_logo(e);
		});
		const logo_colors_container = uiu.el(logo_form, 'div', { style: 'display: block' });
		const bg_col_label = uiu.el(logo_colors_container, 'label', {}, ci18n('tournament:edit:logo:background'));
		const logo_background_color_input = uiu.el(bg_col_label, 'input', {
			type: 'color',
			name: 'logo_background_color',
			value: curt.logo_background_color || '#000000',
		});
		logo_background_color_input.addEventListener('input', (e) => {
			send_with_live_status({
				type: 'tournament_edit_logo',
				key: curt.key,
				props: {
					logo_background_color: e.target.value,
				},
			}, function (err) {
				if (err) {
					return cerror.net(err);
				}
			});
		});
		const fg_col_label = uiu.el(logo_colors_container, 'label', {}, ci18n('tournament:edit:logo:foreground'));
		const fg_col_input = uiu.el(fg_col_label, 'input', {
			type: 'color',
			name: 'logo_foreground_color',
			value: curt.logo_foreground_color || '#aaaaaa',
		});
		fg_col_input.addEventListener('input', (e) => {
			send_with_live_status({
				type: 'tournament_edit_logo',
				key: curt.key,
				props: {
					logo_foreground_color: e.target.value,
				},
			}, function (err) {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function update_logo() {
		switch (get_admin_subpage()){
			case 'edit':
				const logo_preview_container = document.querySelector('[name="logo_preview"]');
				logo_preview_container.style.background = curt.logo_background_color;
				logo_preview_container.style.color = curt.logo_foreground_color;
				let logo_background_color_input = document.querySelector('[name="logo_background_color"]');
				logo_background_color_input.value = curt.logo_background_color;
				let fg_col_input = document.querySelector('[name="logo_foreground_color"]');
				fg_col_input.value = curt.logo_foreground_color;
				const logo_preview_img = logo_preview_container.querySelector('[name="logo_preview_img"]');
				logo_preview_img.setAttribute('src', '/h/' + encodeURIComponent(curt.key) + '/logo/' + curt.logo_id);
				const filename_display = document.querySelector('#upload_filename');
				filename_display.textContent = curt.logo_name ? curt.logo_name : 'Noch keine Datei ausgewählt';
				break;
			default:
				break;
		}
		return;
	}

	function render_general_displaysettings(main) {
		let used_configs = new Set();
		curt.displays.forEach((d) => {
			used_configs.add(d.displaysetting_id);
		});
		
		uiu.el(main, 'h3',  'edit', ci18n('tournament:edit:general_displaysettings'));
		const display_settings_table = uiu.el(main, 'table');
		const display_settings_tbody = uiu.el(display_settings_table, 'tbody');
		const tr = uiu.el(display_settings_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:setting'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:description'));
		uiu.el(tr, 'th', {}, "");

		for (const s of curt.displaysettings) {
			const tr = uiu.el(display_settings_tbody, 'tr', { 'data-displaysetting_id': s.id });
			render_general_displaysetting_line(tr, s, used_configs);
		}
	}

	function render_general_displaysetting_line(parrent, s, used_configs) {		
		uiu.el(parrent, 'th', {}, s.description ||s.id);
		const description_td = uiu.el(parrent, 'td', {}, s.devicemode + (s.devicemode == 'display' ? ' (' + s.displaymode_style + ')' : ''));
		const actions_td = uiu.el(parrent, 'td', {});
		const edit_btn = uiu.el(actions_td, 'button', {
			'data-display_setting_id': s.id,
		}, 'Edit');

		edit_btn.addEventListener('click', (e) => {				
			on_edit_display_setting_button_click(e);
		});


		const delete_btn = uiu.el(actions_td, 'button', {
			'data-display-setting-id': s.id,
		}, 'Delete');

		if (used_configs.has(s.id)) {
			delete_btn.setAttribute('disabled', 'disabled');
		}

		delete_btn.addEventListener('click', (e) => {
			const del_btn = e.target;
			const setting_id = del_btn.getAttribute('data-display-setting-id');

			send_with_live_status({
				type: 'delete_display_setting',
				tournament_key: curt.key,
				setting_id: setting_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function _cancel_ui_edit_display_setting() {
		const dlg = document.querySelector('.display_setting_edit_dialog');
		if (!dlg) {
			return; // Already cancelled
		}
		cbts_utils.esc_stack_pop();
		uiu.remove(dlg);
	
		ui_edit();
	}

	function on_edit_display_setting_button_click(e) {
		const btn = e.target;
		const display_setting_id = btn.getAttribute('data-display_setting_id');
		ui_edit_display_setting(display_setting_id);
	}

	function ui_edit_display_setting(display_setting_id) {
		const display_setting = structuredClone(utils.find(curt.displaysettings, d => d.id === display_setting_id));
		crouting.set('t/' + curt.key + '/edit/s/' + display_setting_id, {}, _cancel_ui_edit_display_setting);

		cbts_utils.esc_stack_push(_cancel_ui_edit_display_setting);

		const body = uiu.qs('body');
		const dialog_bg = uiu.el(body, 'div', 'dialog_bg display_setting_edit_dialog', {
		 	'data-display_setting_id': display_setting_id,
		});
		const dialog = uiu.el(dialog_bg, 'div', 'dialog');

		uiu.el(dialog, 'h3', {}, ci18n('Edit display setting'));

		const form = uiu.el(dialog, 'form');
		uiu.el(form, 'input', {
			type: 'hidden',
			name: 'display_setting_id',
			value: display_setting_id,
		});
		render_edit_display_setting(form, display_setting);

		const buttons = uiu.el(form, 'div', {
			style: 'margin-top: 2em;',
		});

		const btn = uiu.el(buttons, 'button', {
			'class': 'match_save_button',
			role: 'submit',
		}, ci18n('Change'));

		form_utils.onsubmit(form, function(d) {
			const displaysetting = create_displaysettings_object(d);

			send_with_live_status({
				type: 'edit_display_setting',
				tournament_key: curt.key,
				displaysetting: displaysetting,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
				_cancel_ui_edit_display_setting();
			});
		});

		const cancel_btn = uiu.el(buttons, 'span', 'match_cancel_link vlink', ci18n('Cancel'));
		cancel_btn.addEventListener('click', _cancel_ui_edit_display_setting);
	}
	crouting.register(/t\/([a-z0-9]+)\/edit\/s\/([-a-zA-Z0-9_ ]+)$/, function(m) {
		ctournament.switch_tournament(m[1], function() {
			ui_edit_display_setting(m[2]);
		});
	}, change.default_handler(() => {
		const dlg = uiu.qs('.display_setting_edit_dialog');
		const display_setting_id = dlg.getAttribute('data-display_setting_id');
		ui_edit_display_setting(display_setting_id);
	}));

	function render_edit_display_setting(form, display_setting) {
		const edit_display_setting_container = uiu.el(form, 'div', 'edit_display_setting_container');
		const id_div = uiu.el(edit_display_setting_container, 'div');
		uiu.el(id_div, 'span', 'display_setting_id', ci18n('display_setting:id'));
		uiu.el(id_div, 'input', {
			type: 'text',
			name: 'display_setting_id',
			size: 24,
			required: 'required',
			value: display_setting.id || '',
			tabindex: 1,
			disabled: 'disabled',
		});


		const description_div = uiu.el(edit_display_setting_container, 'div');
		uiu.el(description_div, 'span', 'display_setting_description', 'Description:');
		uiu.el(description_div, 'input', {
			type: 'text',
			name: 'display_setting_description',
			placeholder: ci18n('e.g. MX O55'),
			size: 18,
			value: display_setting.description || '',
			tabindex: 2,
		});

		const ALL_DEVICE_MODES = [
			'umpire',
			'display'
		];


		const calculated_style = (display_setting.devicemode === 'umpire' ? 'umpire' : display_setting.displaymode_style);


		render_drop_down(edit_display_setting_container, ci18n('display_setting:devicemode'), 'devicemode', true, ALL_DEVICE_MODES, display_setting.devicemode || '');
		const displaystyle_select = render_drop_down(edit_display_setting_container, ci18n('display_setting:style'), 'displaymode_style', (display_setting.devicemode === 'umpire' ? 'umpire' : true), displaymode.ALL_STYLES, display_setting.displaymode_style || '');
		
		displaystyle_select.addEventListener('change', (e) => {
			const style = e.target;
			update_edit_display_setting(style.value);
		});
		
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_pause'), 'show_pause', calculated_style, display_setting.d_show_pause);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_court_number'), 'show_court_number', calculated_style, display_setting.d_show_court_number);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_competition'), 'show_competition', calculated_style, display_setting.d_show_competition);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_round'), 'show_round', calculated_style, display_setting.d_show_round);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_middle_name'), 'show_middle_name', calculated_style, display_setting.d_show_middle_name);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_doubles_receiving'), 'show_doubles_receiving', calculated_style, display_setting.d_show_doubles_receiving);
		
		const select_color_div = uiu.el(edit_display_setting_container, 'div', { style: 'display: block' });
		const select_color_label = uiu.el(select_color_div, 'label', {}, ci18n('display_setting:colors'));
		render_select_color(select_color_label, 'c0', calculated_style, display_setting.d_c0);
		render_select_color(select_color_label, 'c1', calculated_style, display_setting.d_c1);
		render_select_color(select_color_label, 'cb0', calculated_style, display_setting.d_cb0);
		render_select_color(select_color_label, 'cb1', calculated_style, display_setting.d_cb1);
		render_select_color(select_color_label, 'cbg', calculated_style, display_setting.d_cbg);
		render_select_color(select_color_label, 'cbg2', calculated_style, display_setting.d_cbg2);
		render_select_color(select_color_label, 'cbg3', calculated_style, display_setting.d_cbg3);
		render_select_color(select_color_label, 'cbg4', calculated_style, display_setting.d_cbg4);
		render_select_color(select_color_label, 'cfg', calculated_style, display_setting.d_cfg);
		render_select_color(select_color_label, 'cfg2', calculated_style, display_setting.d_cfg2);
		render_select_color(select_color_label, 'cfg3', calculated_style, display_setting.d_cfg3);
		render_select_color(select_color_label, 'cfg4', calculated_style, display_setting.d_cfg4);
		render_select_color(select_color_label, 'cfgdark', calculated_style, display_setting.d_cfgdark);
		render_select_color(select_color_label, 'cexp', calculated_style, display_setting.d_cexp);
		render_select_color(select_color_label, 'ct', calculated_style, display_setting.d_ct);
		render_select_color(select_color_label, 'cborder', calculated_style, display_setting.d_cborder);
		render_select_color(select_color_label, 'cserv', calculated_style, display_setting.d_cserv);
		render_select_color(select_color_label, 'cserv2', calculated_style, display_setting.d_cserv2);
		render_select_color(select_color_label, 'crecv', calculated_style, display_setting.d_crecv);
		render_select_color(select_color_label, 'ctim_blue', calculated_style, display_setting.d_ctim_blue);
		render_select_color(select_color_label, 'ctim_active', calculated_style, display_setting.d_ctim_active);
		render_check_box(edit_display_setting_container, ci18n('display_setting:use_team_colors'), 'team_colors', calculated_style, display_setting.d_team_colors);
		render_select_number(edit_display_setting_container, ci18n('display_setting:scale'), 'scale', calculated_style, display_setting.d_scale, 20, 500);

		const ALL_BUP_LANGUAGES = [
			ci18n('display_setting:language_automatic'),
			ci18n('display_setting:language_en'),
			ci18n('display_setting:language_de'),
			ci18n('display_setting:language_de-AT'),
			ci18n('display_setting:language_de-CH'),
			ci18n('display_setting:language_fr-CH'),
			ci18n('display_setting:language_nl-BE'),
		]

		const SHORT_BUP_LANGUAGES = [
			'auto',
			'en',
			'de',
			'de-AT',
			'de-CH',
			'fr-CH',
			'nl-BE'
		]

		// let current_language = '';

		// for (const [i, value] of SHORT_BUP_LANGUAGES.entries()) {
		// 	if ((display_setting.language || '') == value) {
		// 		current_language = ALL_BUP_LANGUAGES[i];
		// 		break;
		// 	}
		// }

		render_drop_down(edit_display_setting_container, ci18n('display_setting:language'), 'language', true, SHORT_BUP_LANGUAGES, display_setting.language, ALL_BUP_LANGUAGES);


		const ALL_ASK_FULLSCREAN_MODES = [
			'always',
			'auto',
			'never',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:fullscreen_ask'), 'fullscreen_ask', true, ALL_ASK_FULLSCREAN_MODES, display_setting.fullscreen_ask || '');


		const ALL_ANNOUNCEMENT_MODES = [
			'none',
			'all',
			'except-first',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:show_announcements'), 'show_announcements', calculated_style, ALL_ANNOUNCEMENT_MODES, display_setting.show_announcements || '');

		render_select_number(edit_display_setting_container, ci18n('display_setting:button_block_timeout'), 'button_block_timeout', calculated_style, display_setting.button_block_timeout, 0, 5000);
		
		render_check_box(edit_display_setting_container, ci18n('display_setting:negative_timers'), 'negative_timers', calculated_style, display_setting.negative_timers);
		render_check_box(edit_display_setting_container, ci18n('display_setting:shuttle_counter'), 'shuttle_counter', calculated_style, display_setting.shuttle_counter);
		render_check_box(edit_display_setting_container, ci18n('display_setting:editmode_doubleclick'), 'editmode_doubleclick', calculated_style, display_setting.editmode_doubleclick);

		const ALL_CLICK_MODES = [
			'auto',
			'click',
			'touchstart',
			'touchend',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:click_mode'), 'click_mode', calculated_style, ALL_CLICK_MODES, display_setting.click_mode || '');
		
		const ALL_STYLE_MODES = [
			'default',
			'complete',
			'clean',
			'focus',
			'hidden',
		];

		render_drop_down(edit_display_setting_container, ci18n('display_setting:settings_style'), 'style', calculated_style, ALL_STYLE_MODES, display_setting.style || '');
		render_select_number(edit_display_setting_container, ci18n('display_setting:network_timeout'), 'network_timeout', true, display_setting.network_timeout, 1, 600000);
		render_select_number(edit_display_setting_container, ci18n('display_setting:network_update_interval'), 'network_update_interval', true, display_setting.network_update_interval, 1, 600000);
	}

	function render_drop_down(container, label_text, select_name, displaystyle, values, curval, labels) {
		if(!labels) {
			labels = values;
		}
		
		const div = uiu.el(container, 'div', {field_name: select_name});
		uiu.el(div, 'span', 'label', label_text);
		const select = uiu.el(div, 'select', {
			name: select_name,
			size: 1,
		});
		uiu.empty(select);
		for (const [i, s] of values.entries()) {
			const attrs = {
				value: s,
				label: labels[i] || s,
			};
			if (s === curval) {
				attrs.selected = 'selected';
			}
			uiu.el(select, 'option', attrs, s);
		}

		uiu.visible(div, (displaystyle === true || displaymode.option_applies(displaystyle, select_name)));

		return select;
	}

	function render_check_box(container, label_text, checkbox_name, displaystyle, is_checked) {
		const div = uiu.el(container, 'div', {field_name: checkbox_name});
		const label = uiu.el(div, 'label');
		const attrs = {
			type: 'checkbox',
			name: checkbox_name,
		};

		if (is_checked) {
			attrs.checked = 'checked';
		}

		uiu.el(label, 'input', attrs);
		uiu.el(label, 'span', 'display_setting_label', label_text);

		uiu.visible(div, (displaystyle === true || displaymode.option_applies(displaystyle, checkbox_name)));
	}

	function render_select_color(container, field_name, displaystyle, value) {
		const input = uiu.el(container, 'input', {
			type: 'color',
			name: field_name,
			title: field_name,
			field_name: field_name,
			value: value || '#000000',
		});

		uiu.visible(input, (displaystyle === true ||displaymode.option_applies(displaystyle, field_name)));
	}

	function render_select_number(container, label_text, input_name, displaystyle, value, min_value, max_value) {
		const div = uiu.el(container, 'div', {field_name: input_name});
		const label = uiu.el(div, 'span', 'label', label_text);
		uiu.el(div, 'input', {
			type: 'number',
			name: input_name,
			min: min_value || 0,
			max: max_value || 0,
			value: value || 0,
		});

		uiu.visible(div, (displaystyle === true ||displaymode.option_applies(displaystyle, input_name)));
	} 

	function create_displaysettings_object(d) {
		const displaysetting  = {
			id: d.display_setting_id,
			description: d.display_setting_description || '',
			devicemode: d.devicemode || 'display',
			displaymode_style: d.displaymode_style || 'tournamentcourt',
			d_show_pause: d.show_pause == 'on' ? true : false,
			d_show_court_number: d.show_court_number == 'on' ? true : false,
			d_show_competition: d.show_competition == 'on' ? true : false,
			d_show_round: d.show_round == 'on' ? true : false,
			d_show_middle_name: d.show_middle_name == 'on' ? true : false,
			d_show_doubles_receiving: d.show_doubles_receiving == 'on' ? true : false,
			d_c0: d.c0 || '#50e87d',
			d_c1: d.c1 || '#f76a23',
			d_cb0: d.cb0 || '#000000',
			d_cb1: d.cb1 || '#000000',
			d_cbg: d.cbg || '#000000',
			d_cbg2: d.cbg2 || '#d9d9d9',
			d_cbg3: d.cbg3 || '#252525',
			d_cbg4: d.cbg4 || '#404040',
			d_cfg: d.cfg || '#ffffff',
			d_cfg2: d.cfg2 || '#aaaaaa',
			d_cfg3: d.cfg3 || '#cccccc',
			d_cfg4: d.cfg4 || '#000000',
			d_cfgdark: d.cfgdark || '#000000',
			d_cexp: d.cexp || '#000000',
			d_ct: d.ct || '#80ff00',
			d_cborder: d.cborder || '#444444',
			d_cserv: d.cserv || '#fff200',
			d_cserv2: d.cserv2 || '#dba766',
			d_crecv: d.crecv || '#707676',
			d_ctim_blue: d.ctim_blue || '#0070c0',
			d_ctim_active: d.ctim_active || '#ffc000',
			d_team_colors: d.team_colors == 'on' ? true : false,
			d_scale: d.scale || '100',
			fullscreen_ask: d.fullscreen_ask || 'auto',
			show_announcements: d.show_announcements || 'all', 
			button_block_timeout: d.button_block_timeout || '100',
			negative_timers: d.negative_timers == 'on' ? true : false,
			shuttle_counter: d.shuttle_counter == 'on' ? true : false,
			editmode_doubleclick: d.editmode_doubleclick == 'on' ? true : false,
			click_mode: d.click_mode || 'auto',
			style: d.style || 'complete',
			network_timeout: d.network_timeout || '10000',
			network_update_interval: d.network_update_interval || '10000',
			language: d.language || 'auto',
		}

		//

		return displaysetting;
	}

	function update_edit_display_setting(displaystyle)
	{
		const names = [ 'show_pause', 'show_court_number', 'show_competition', 'show_round', 'show_middle_name', 'show_doubles_receiving', 
						'c0', 'c1', 'cb0', 'cb1', 'cbg', 'cbg2', 'cbg3', 'cbg4', 'cfg', 'cfg2', 'cfg3', 'cfg4', 'cfgdark', 'cexp', 'ct', 
						'cborder', 'cserv', 'cserv2', 'crecv', 'ctim_blue', 'ctim_active', 'team_colors', 'scale',
						'show_announcements', 'button_block_timeout', 'negative_timers', 'shuttle_counter', 'editmode_doubleclick', 
						'click_mode', 'style', 'language'];
		
		names.forEach((field_name) => {
			const update = uiu.qs('[field_name='+field_name+']');
			uiu.visible(update, (displaystyle === true || displaymode.option_applies(displaystyle, field_name)));
		});
	}

	function update_general_displaysettings(c)
	{	
		//const general_displaysettings_div = uiu.qs('.general_displaysettings');
		const general_displaysettings_div = document.querySelector(".general_displaysettings");
		if(general_displaysettings_div) {
			general_displaysettings_div.innerHTML = '';
			render_general_displaysettings(general_displaysettings_div);
		}
	}

	function render_displaysettings(general_displaysettings_div) {
		uiu.el(general_displaysettings_div, 'h3', 'edit', ci18n('tournament:edit:displays'));

		const display_table = uiu.el(general_displaysettings_div, 'table');
		const display_tbody = uiu.el(display_table, 'tbody', 'display_tbody');
		const tr = uiu.el(display_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:num'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:hostname'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:batterylevel')); 
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:court'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:setting'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:onlinestatus'));
		uiu.el(tr, 'th', {}, "");
		uiu.el(tr, 'th', {}, "");
		

		for (const display of curt.displays) {
			const tr = uiu.el(display_tbody, 'tr', { 'data-display_id': display.client_id });
			render_display(tr, display);
		}
	}

	function update_display(display) {
		// Do this function only if the Display view (in on edit) is open
		if(!document.querySelectorAll('.display_tbody').length) {
			return;
		}
		
		var nodes = document.querySelectorAll('[data-display_id=' + JSON.stringify(display.client_id) + ']');
		if(nodes.length > 0) {
			uiu.qsEach('[data-display_id=' + JSON.stringify(display.client_id) + ']', function (display_tr) {
				display_tr.innerHTML = '';
				render_display(display_tr, display);
			});
		}
		else {
			new_display(display);
		}
	}

	function new_display(display) {
		const display_tbody = document.querySelector(".display_tbody");
		const tr = uiu.el(display_tbody, 'tr', { 'data-display_id': display.client_id });
		render_display(tr, display);

		for (const child of display_tbody.children) {
			const child_id = child.dataset.display_id;
			if(child_id && Number(child_id) > Number(display.client_id))
			{
				display_tbody.insertBefore(tr, child);
			}
		}
	}


	function render_display(tr, display) {
		tr.setAttribute('class', (!display.online) ? 'offline' : (display.wait_for_done ? 'wait_for_done' : 'online'));
		uiu.el(tr, 'th', {}, display.client_id);
		uiu.el(tr, 'th', {}, display.hostname);
		var battery_node = uiu.el(tr, 'td', {}, 'N/A');
		set_battery_state(display.battery, battery_node);
		createCourtSelectBox(uiu.el(tr, 'td', {}, ''), display.client_id, display.court_id);
		createDisplaySettingsSelectBox(uiu.el(tr, 'td', {}, ''), display.client_id, display.displaysetting_id);
		uiu.el(tr, 'td', {}, (!display.online) ? 'offline' : 'online');
		const actions_td = uiu.el(tr, 'td', {});
		const reset_btn = uiu.el(actions_td, 'button', {
			'data-display-client-id': display.client_id,
		}, 'Restart');

		if (!display.online) {
			reset_btn.setAttribute('disabled', 'disabled');
		}
		reset_btn.addEventListener('click', function (e) {
			const rst_btn = e.target;
			const display_client_id = rst_btn.getAttribute('data-display-client-id');
			send_with_live_status({
				type: 'display_reset',
				tournament_key: curt.key,
				display_client_id: display_client_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});

		const delete_td = uiu.el(tr, 'td', {});
		const delete_btn = uiu.el(delete_td, 'button', {
			'data-display-client-id': display.client_id,
		}, 'Delete');
		if (display.online) {
			delete_btn.setAttribute('disabled', 'disabled');
		}
		delete_btn.addEventListener('click', function (e) {
			const del_btn = e.target;
			const display_client_id = del_btn.getAttribute('data-display-client-id');
			send_with_live_status({
				type: 'display_delete',
				tournament_key: curt.key,
				display_client_id: display_client_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function delete_display(c) {
		uiu.qsEach('[data-display_id=' + JSON.stringify(c.val) + ']', function (display_tr) {
			display_tr.parentNode.removeChild(display_tr);
		});
	}

	function render_locations(main) {
		const location_div = uiu.el(main, 'div', 'locations_div');
		uiu.el(location_div, 'h2', 'edit', ci18n('tournament:edit:location'));

		const locations_table = uiu.el(location_div, 'table', 'locations_table');
		const locations_tbody = uiu.el(locations_table, 'tbody');

		const tr = uiu.el(locations_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:location'));
		uiu.el(tr, 'th', {}, 'In Vorbereitungd Ergänzung');
		uiu.el(tr, 'th', {}, 'Meetingpoint durchsage');
		uiu.el(tr, 'th', {}, 'In Vorbereitung Icon');
		uiu.el(tr, 'th', {}, '');

		let highlight_in_use = [];
		for (const l of curt.locations) {
			if(l.highlight) {
				highlight_in_use.push(l.highlight);
			}
		}

		for (const l of curt.locations) {
			const tr = uiu.el(locations_tbody, 'tr');
			const name_th = uiu.el(tr, 'th', {});
			uiu.el(name_th, 'div', {}, l.name);

			const content = [1, 2, 3, 4, 5, 6];
			const selected = l.highlight;
			const select_color = uiu.el(name_th, 'select', {id: 'select_highlight', class: 'highlight_' + selected, 'data-location_id': l._id});
			for (const item of content) {			
					const attrs = {
						'data-display-setting-id': item,
						value: item,
						class: 'highlight_' + item,
						style: (highlight_in_use.includes(item) && selected !== item) ? 'display:none;' : '',
					}
					if ((selected === item)) {
						attrs.selected = 'selected';
					}
					uiu.el(select_color, 'option', attrs);
				//}
			}

			select_color.addEventListener('change', (e) => {
				e.target.classList = [e.target.value];
				send_location_to_admin(e.target.parentNode.parentNode, e.target.getAttribute('data-location_id'));
			});
				
			const preparation_td = uiu.el(tr, 'td', {});
			const preparation_input = create_textarea_input("textarea", preparation_td, 'preparation_addition');
			preparation_input.value = l.preparation_addition;
			preparation_input.setAttribute('data-location-id', l._id);
			preparation_input.setAttribute('maxlength', 175);
			preparation_input.addEventListener('focusout', (e) => {
				send_location_to_admin(e.target.parentNode.parentNode, e.target.getAttribute('data-location-id'));
			});
			const meetinpoint_td = uiu.el(tr, 'td', {});
			const meetingpoint_input = create_textarea_input("textarea", meetinpoint_td, 'meetingpoint_announcement');
			meetingpoint_input.value = l.meetingpoint_announcement;
			meetingpoint_input.setAttribute('data-location-id', l._id);
			meetingpoint_input.setAttribute('maxlength', 175);
			meetingpoint_input.addEventListener('focusout', (e) => {
				send_location_to_admin(e.target.parentNode.parentNode, e.target.getAttribute('data-location-id'));
			});
			const icon_td = uiu.el(tr, 'td', 'icon_td');
			uiu.el(icon_td, 'img', {
				style: 'height: 40px;',
				src: l.logo_id ? '/h/' + encodeURIComponent(curt.key) + '/logo/' + l.logo_id : '/static/icons/preparation.svg',
				name: 'location_logo_img',
				'data-location_id': l._id
			});

			const logo_form = uiu.el(icon_td, 'form', 'logo_form');
			const logo_button_id = l._id +'_logo_upload_input';

			const filename_display = uiu.el(logo_form, 'div', {
				class: 'upload_filename_location',
				'data-location_id': l._id,
			}, l.logo_name ? l.logo_name : 'preparation.svg');

			const custom_label = uiu.el(logo_form, 'label', {
				for: logo_button_id,
				style: (
					'display:inline-block;padding:3px 8px;cursor:pointer; border:1px solid;' +
					'background:#eeeeee;color:black;border-radius:4px;margin:5px;font-size:small;'
				),
			}, 'ändern');

			const logo_button = uiu.el(logo_form, 'input', {
				id: logo_button_id,
				type: 'file',
				accept: 'image/*',
				style: 'display:none;',
				'data-location_id': l._id, 
			});
			logo_button.addEventListener('change', (e) => {
				_upload_location_logo(e);
			});

			const actions_td = uiu.el(tr, 'td', {});
			const del_btn = uiu.el(actions_td, 'button', {
				'data-location-id': l._id,
			}, 'Delete');
			del_btn.addEventListener('click', function (e) {
				const del_btn = e.target;
				const location_id = del_btn.getAttribute('data-location-id');
				if (confirm('Do you really want to delete ' + location_id + '? (Will not do anything yet!)')) {
					debug.log('TODO: would now delete court');
				}
			});
		}
	}

	function _upload_location_logo(e) {
		const input = e.target;
		const location_id = e.target.getAttribute('data-location_id');
		if (!input.files.length) return;

		const reader = new FileReader();
		reader.readAsDataURL(input.files[0]);
		reader.onload = () => {
			send_with_live_status({
				type: 'tournament_upload_location_logo',
				tournament_key: curt.key,
				data_url: reader.result,
				name: e.target.files[0].name,
				location_id
			}, (err) => {
				if (err) {
					return cerror.net(err);
				}`
				input.closest('form').reset();`
			});
		};
		reader.onerror = (e) => {
			alert('Failed to upload: ' + e);
		};
	}

	function update_location_logo(location_id, logo_id, logo_name) {
		switch (get_admin_subpage()){
			case 'edit':
				const location_logo_img = document.querySelector(`[name="location_logo_img"][data-location_id="${location_id}"]`);
				location_logo_img.setAttribute('src', '/h/' + encodeURIComponent(curt.key) + '/logo/' + logo_id);
				const filename_display = document.querySelector(`.upload_filename_location[data-location_id="${location_id}"]`);
				filename_display.textContent = logo_name;
				break;
			default:
				break;
		}
		return;
	}

	function send_location_to_admin(parent, location_id) {
		const highlight = parseInt(parent.querySelector("#select_highlight").value, 10);
		const preparation_addition = parent.querySelector("#preparation_addition").value;
		const meetingpoint_announcement = parent.querySelector("#meetingpoint_announcement").value;

		send_with_live_status({
			type: 'location_changed',
			tournament_key: curt.key,
			location_id,
			highlight: highlight,
			preparation_addition,
			meetingpoint_announcement,
		}, function (err, response) {
			if (err) {
				return cerror.net(err);
			}
		});
	}

	function update_location(location_id, highlight, preparation_addition, meetingpoint_announcement) {
		switch (get_admin_subpage()){
			case 'edit':
				const locations_table = document.querySelector('.locations_table');
				const location_div = locations_table.parentElement;
				location_div.innerHTML="";
				render_locations(location_div);

				break;
			default:
				break;
		}
		return;
	};

/* ============================================================
 * DROP-ZONES (schmale Reihen zum Droppen)
 * ============================================================ */

function add_drop_zones_to_tbody(tbody, {
  row_selector = 'tr',
  zone_class = 'drop-zone',
  zone_active_class = 'drop-zones-active',
  is_header_row = (tr) => !!tr.querySelector('th'),
  col_count = 3,
  on_zone_dragover = (tbody, insertBeforeRow, e) => {},
} = {}) {
  // alte Zonen entfernen
  for (const z of [...tbody.querySelectorAll(`tr.${zone_class}`)]) z.remove();
  tbody.classList.add(zone_active_class);

  const rows = [...tbody.querySelectorAll(row_selector)];
  const header = rows.find(is_header_row) || null;

  // Spacer erkennen (kommt von ensure_min_table_height)
  const spacer = tbody.querySelector('tr.table-spacer') || null;

  // Datenzeilen: data-official-id (und NICHT spacer)
  const dataRows = rows.filter(tr =>
    tr !== header &&
    tr !== spacer &&
    tr.getAttribute('data-official-id')
  );

  function makeZone(insertBeforeRow, heightPx = null) {
    const ztr = document.createElement('tr');
    ztr.className = zone_class;

    const ztd = document.createElement('td');
    ztd.colSpan = col_count;
    ztr.appendChild(ztd);

    if (heightPx != null) {
      ztd.style.height = `${heightPx}px`;
      ztd.style.padding = '0';
      ztd.style.border = 'none';
    }

    ztr.addEventListener('dragover', (e) => {
      e.preventDefault();
      on_zone_dragover(tbody, insertBeforeRow, e);
    });

    ztr.addEventListener('drop', (e) => e.preventDefault());
    ztr.addEventListener('dragenter', () => ztr.classList.add('drop-zone-hover'));
    ztr.addEventListener('dragleave', () => ztr.classList.remove('drop-zone-hover'));

    return ztr;
  }

  // Wenn Spacer existiert: Spacer zu einer einzigen großen Dropzone machen
  if (spacer) {
    // Spacer-Höhe ermitteln (td height oder inline style)
    const spacerTd = spacer.querySelector('td');
    const h = spacerTd ? spacerTd.getBoundingClientRect().height : 0;

    // Spacer entfernen und als Dropzone mit gleicher Höhe ersetzen.
    // Drop soll "unter letzte Datenzeile" sein -> insertBeforeRow = null
    spacer.remove();

    const bigZone = makeZone(null, Math.max(0, Math.ceil(h)));
    tbody.appendChild(bigZone);
    return;
  }

  // Normalfall ohne Spacer: Top/Between/Bottom Zonen
  const topZone = makeZone(dataRows[0] || null);

  if (header) {
    if (header.nextSibling) tbody.insertBefore(topZone, header.nextSibling);
    else tbody.appendChild(topZone);
  } else {
    tbody.insertBefore(topZone, tbody.firstChild);
  }

  for (let i = 0; i < dataRows.length; i++) {
    const current = dataRows[i];
    const next = dataRows[i + 1] || null;
    const zone = makeZone(next);
    if (current.nextSibling) tbody.insertBefore(zone, current.nextSibling);
    else tbody.appendChild(zone);
  }
}


function remove_drop_zones_from_tbody(tbody, {
  zone_class = 'drop-zone',
  zone_active_class = 'drop-zones-active',
} = {}) {
  tbody.classList.remove(zone_active_class);
  for (const z of [...tbody.querySelectorAll(`tr.${zone_class}`)]) {
    z.remove();
  }
}

/* ============================================================
 * MULTI-TABLE DND (mit Drop-Zones, zwischen Tabellen)
 * ============================================================ */

function enable_multitable_row_dragdrop(tbodies, {
  row_selector = 'tr',
  table_id_attr = 'data-table-id',
  row_id_attr = 'data-official-id',
  is_header_row = (tr) => !!tr.querySelector('th'),
  can_drag_row = (tr) => !is_header_row(tr) && !tr.classList.contains('drop-zone'),
  col_count = 3,
  on_move = ({ row_id, from_table, to_table, from_order, to_order }) => {},
} = {}) {
  let dragged_tr = null;
  let from_tbody = null;

  function set_dragging(tr, isDragging) {
    if (!tr) return;
    tr.classList.toggle('dragging', !!isDragging);
  }

  function get_table_id(tbody) {
    return tbody?.getAttribute(table_id_attr) || '';
  }

  function get_order_ids(tbody) {
    if (!tbody) return [];
    return [...tbody.querySelectorAll(row_selector)]
      .filter(tr => !is_header_row(tr) && !tr.classList.contains('drop-zone'))
      .map(tr => tr.getAttribute(row_id_attr))
      .filter(Boolean);
  }

  // >>> NEU: ans Ende bedeutet "vor Spacer", falls vorhanden
  function append_before_spacer(tbody, row) {
    const spacer = tbody.querySelector('tr.table-spacer');
    if (spacer) tbody.insertBefore(row, spacer);
    else tbody.appendChild(row);
  }

  function insert_dragged_into_tbody(tbody, insertBeforeRow) {
    if (!dragged_tr) return;

    if (insertBeforeRow == null) {
      // ans Ende (unter letzte Datenzeile) => aber vor Spacer, falls vorhanden
      append_before_spacer(tbody, dragged_tr);
    } else {
      tbody.insertBefore(dragged_tr, insertBeforeRow);
    }
  }

  // Drop-Zones beim Start aktivieren
  function activate_drop_zones() {
    for (const tbody of tbodies) {
      add_drop_zones_to_tbody(tbody, {
        row_selector,
        is_header_row,
        col_count,
        on_zone_dragover: (target_tbody, insertBeforeRow, e) => {
          if (!dragged_tr) return;
          insert_dragged_into_tbody(target_tbody, insertBeforeRow);
        }
      });
    }
  }

  function deactivate_drop_zones() {
    for (const tbody of tbodies) {
      remove_drop_zones_from_tbody(tbody);
    }
  }

  // Rows draggable machen
  for (const tbody of tbodies) {
    for (const tr of tbody.querySelectorAll(row_selector)) {
      if (!can_drag_row(tr)) continue;

      tr.draggable = true;

      tr.addEventListener('dragstart', (e) => {
        dragged_tr = tr;
        from_tbody = tr.closest('tbody');
        set_dragging(tr, true);

        // Drop-Zones global aktivieren
        activate_drop_zones();

        // Firefox benötigt Daten im dataTransfer
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tr.getAttribute(row_id_attr) || '');
        }
      });

      tr.addEventListener('dragend', () => {
        if (!dragged_tr) return;

        set_dragging(dragged_tr, false);

        // Drop-Zones entfernen
        deactivate_drop_zones();

        const row_id = dragged_tr.getAttribute(row_id_attr) || '';
        const to_tbody = dragged_tr.closest('tbody');

        const from_table = get_table_id(from_tbody);
        const to_table = get_table_id(to_tbody);

        const from_order = get_order_ids(from_tbody);
        const to_order = get_order_ids(to_tbody);

        dragged_tr = null;
        from_tbody = null;

        on_move({ row_id, from_table, to_table, from_order, to_order });
      });
    }
  }

for (const tbody of tbodies) {
  tbody.addEventListener('dragover', (e) => {
    if (!dragged_tr) return;
    e.preventDefault();

    // 1) Wenn wir über dem Spacer sind: vor Spacer einfügen (Preview korrekt)
    const spacer_tr = e.target.closest ? e.target.closest('tr.table-spacer') : null;
    if (spacer_tr) {
      tbody.insertBefore(dragged_tr, spacer_tr);
      return;
    }

    // 2) Wenn wir über dem Header sind: vor die erste Datenzeile einfügen
    const header_tr = e.target.closest ? e.target.closest('tr') : null;
    const isHeader = header_tr && header_tr.querySelector && header_tr.querySelector('th');
    if (isHeader) {
      const first_data = tbody.querySelector(`tr[${row_id_attr}]:not(.drop-zone)`);
      if (first_data) {
        tbody.insertBefore(dragged_tr, first_data);
      } else {
        // keine Datenzeile vorhanden -> vor Spacer falls vorhanden, sonst ans Ende
        const spacer = tbody.querySelector('tr.table-spacer');
        if (spacer) tbody.insertBefore(dragged_tr, spacer);
        else tbody.appendChild(dragged_tr);
      }
      return;
    }

    // 3) Optional: Wenn über einer Datenzeile, nahe oben -> davor einfügen
    // (macht "oben" noch leichter zu treffen, ohne Drop-Zones zu vergrößern)
    const data_tr = e.target.closest ? e.target.closest(`tr[${row_id_attr}]`) : null;
    if (data_tr && data_tr !== dragged_tr) {
      const box = data_tr.getBoundingClientRect();
      const before = e.clientY < (box.top + box.height / 2);
      if (before) tbody.insertBefore(dragged_tr, data_tr);
      else tbody.insertBefore(dragged_tr, data_tr.nextSibling);
      return;
    }

    // sonst nichts tun: Drop-Zones übernehmen die Präzision
  });

  tbody.addEventListener('drop', (e) => {
    if (!dragged_tr) return;
    e.preventDefault();
  });
}
}


/* ============================================================
 * DEINE TABELLE (pro Feld) - gibt TBODY zurück
 * ============================================================ */

function render_officials_by_timestamp(main, {
  title = null,
  officials,
  timestamp_field,
  min_height_px = 240
}) {
  if (title) {
    uiu.el(main, 'h2', 'edit', title);
  }

  const rows = officials
    .filter(o => o[timestamp_field] !== null)
    .sort((a, b) => a[timestamp_field] - b[timestamp_field]);

  const table = uiu.el(main, 'table', 'officials_table');
  const tbody = uiu.el(table, 'tbody', { 'data-table-id': timestamp_field });

  /* ---------- Header ---------- */
  const trHead = uiu.el(tbody, 'tr');
  uiu.el(trHead, 'th', {}, 'Name');

  const thUmpire = uiu.el(trHead, 'th', {});
  uiu.el(thUmpire, 'div', { class: 'umpire' });

  const thService = uiu.el(trHead, 'th', {});
  uiu.el(thService, 'div', { class: 'service_judge' });

  /* ---------- Data rows ---------- */
  for (const o of rows) {
    const tr = uiu.el(tbody, 'tr', { 'data-official-id': o._id });

    uiu.el(tr, 'td', {}, o.name || `${o.firstname} ${o.surname}`.trim());

    const umpire_td = uiu.el(tr, 'td', {});
    const umpire_cb = create_simple_checkbox(
      umpire_td,
      { name: 'umpire_cb', 'data-official-id': o._id },
      !!o.is_umpire
    );
    umpire_cb.addEventListener('change', (e) => {
      send_with_live_status({
        type: 'official_edit',
        tournament_key: o.tournament_key,
        official_id: o._id,
        field: 'is_umpire',
        value: e.target.checked
      }, err => { if (err) return cerror.net(err); });
    });

    const service_td = uiu.el(tr, 'td', {});
    const service_cb = create_simple_checkbox(
      service_td,
      { name: 'service_judge_cb', 'data-official-id': o._id },
      !!o.is_service_judge
    );
    service_cb.addEventListener('change', (e) => {
      send_with_live_status({
        type: 'official_edit',
        tournament_key: o.tournament_key,
        official_id: o._id,
        field: 'is_service_judge',
        value: e.target.checked
      }, err => { if (err) return cerror.net(err); });
    });
  }

  /* ---------- Mindesthöhe per Spacer ---------- */
  function ensure_min_table_height() {
    const old = tbody.querySelector('tr.table-spacer');
    if (old) old.remove();

    if (!document.body.contains(table)) return;

    requestAnimationFrame(() => {
      if (!document.body.contains(table)) return;

      const current = table.getBoundingClientRect().height;
      const missing = Math.max(0, min_height_px - current);
      if (missing <= 0) return;

      const spacer_tr = document.createElement('tr');
      spacer_tr.className = 'table-spacer';

      const spacer_td = document.createElement('td');
      spacer_td.colSpan = trHead.children.length;
      spacer_td.style.height = `${Math.ceil(missing)}px`;

      spacer_tr.appendChild(spacer_td);
      tbody.appendChild(spacer_tr);
    });
  }

  ensure_min_table_height();

  // für globalen Resize-Recalc
  table._ensureMinHeight = ensure_min_table_height;

  return { table, tbody };
}

function enable_min_height_resize_recalc(tables) {
  window._officialMinHeightTables = tables;

  if (window._officialMinHeightResizeHandlerInstalled) return;
  window._officialMinHeightResizeHandlerInstalled = true;

  window.addEventListener('resize', () => {
    const list = window._officialMinHeightTables || [];
    for (const t of list) {
      if (t && t._ensureMinHeight) t._ensureMinHeight();
    }
  });
}

function update_official_tables(officials_host) {
  // officials_host: DOM-Element, in das die gesamte Officials-UI gerendert wird
  // curt.umpires ist hier verfügbar (wie von dir beschrieben)

  // alles neu bauen
  officials_host.innerHTML = '';

  const tbodies = [];
  const tables = [];

  const officials_div = uiu.el(officials_host, 'div', 'settings');
  uiu.el(officials_div, 'h2', 'edit', ci18n('Umpire:'));

  uiu.el(officials_div, 'h3', 'edit', ci18n('Waiting for the next game:'));
  const waiting_officials_div = uiu.el(officials_div, 'div', 'paralel');

  {
    const r = render_officials_by_timestamp(waiting_officials_div, {
      officials: curt.umpires,
      timestamp_field: 'umpire_wait'
    });
    tbodies.push(r.tbody);
    tables.push(r.table);
  }

  uiu.el(waiting_officials_div, 'div', 'space');

  {
    const r = render_officials_by_timestamp(waiting_officials_div, {
      officials: curt.umpires,
      timestamp_field: 'service_judge_wait'
    });
    tbodies.push(r.tbody);
    tables.push(r.table);
  }

  uiu.el(officials_div, 'h3', 'edit', ci18n('Currently on break:'));
  const paused_officials_div = uiu.el(officials_div, 'div', 'paralel');

  {
    const r = render_officials_by_timestamp(paused_officials_div, {
      officials: curt.umpires,
      timestamp_field: 'umpire_pause'
    });
    tbodies.push(r.tbody);
    tables.push(r.table);
  }

  uiu.el(paused_officials_div, 'div', 'space');

  {
    const r = render_officials_by_timestamp(paused_officials_div, {
      officials: curt.umpires,
      timestamp_field: 'service_judge_pause'
    });
    tbodies.push(r.tbody);
    tables.push(r.table);
  }

  uiu.el(officials_div, 'h3', 'edit', ci18n('Not available:'));
  {
    const r = render_officials_by_timestamp(officials_div, {
      officials: curt.umpires,
      timestamp_field: 'inactive_list'
    });
    tbodies.push(r.tbody);
    tables.push(r.table);
  }

  // Map neu aufbauen (wichtig, weil curt.umpires aktualisiert ist)
  const officialById = new Map();
  for (const o of curt.umpires) {
    officialById.set(o._id, o);
  }

  // Drag & Drop (jedes Render neu aktivieren)
  enable_multitable_row_dragdrop(tbodies, {
    col_count: 3,
    is_header_row: (tr) => !!tr.querySelector('th'),
    on_move: ({ row_id, from_table, to_table, from_order, to_order }) => {

      // Mindesthöhe nach DOM-Move neu setzen
      for (const t of tables) {
        if (t && t._ensureMinHeight) t._ensureMinHeight();
      }

      // prev/next aus der Ziel-Reihenfolge
      const idx = to_order.indexOf(row_id);
      const prev_id = idx > 0 ? to_order[idx - 1] : null;
      const next_id = (idx >= 0 && idx < to_order.length - 1) ? to_order[idx + 1] : null;

      const prev_btp_id = prev_id ? officialById.get(prev_id)?.btp_id : null;
      const next_btp_id = next_id ? officialById.get(next_id)?.btp_id : null;

      send_with_live_status({
        type: 'official_list_move',
        tournament_key: curt.key,
        official_id: row_id,
        from_list: from_table,
        to_list: to_table,
        prev_btp_id,
        next_btp_id
      }, (err) => {
        if (err) return cerror.net(err);
      });
    }
  });

  // Mindesthöhe bei Resize neu berechnen (globaler Handler)
  enable_min_height_resize_recalc(tables);

  // Optional: direkt nach Render einmal neu setzen (falls Fonts/Layout verzögert)
  for (const t of tables) {
    if (t && t._ensureMinHeight) t._ensureMinHeight();
  }
}

function update_officials() {
	if(current_view === 'edit') {
		update_official_tables(document.getElementById('officials_host'));
	}
	return;
}


	function render_courts(main) {
		uiu.el(main, 'h2', 'edit', ci18n('tournament:edit:courts'));

		const courts_table = uiu.el(main, 'table', 'courts_table');
		const courts_tbody = uiu.el(courts_table, 'tbody');
		const tr = uiu.el(courts_tbody, 'tr');
		uiu.el(tr, 'th', {}, 'Spielort');
		uiu.el(tr, 'th', {}, 'Nummer');
		//uiu.el(tr, 'th', {}, 'Name');
		uiu.el(tr, 'th', {}, 'Aktiv');
		uiu.el(tr, 'th', {}, 'Schiedsrichter');
		uiu.el(tr, 'th', {}, 'Aufschlagrichter');
		uiu.el(tr, 'th', {}, '');
		
		var l = {_id : ''};

		for (const c of curt.courts) {
			const tr = uiu.el(courts_tbody, 'tr');
			if(l._id != c.location_id) {
				l = utils.find(curt.locations, l => l._id === c.location_id);
			}

			uiu.el(tr, 'th', {}, l.name);
			uiu.el(tr, 'th', {}, c.num);
			//uiu.el(tr, 'td', {}, c.name || '');
			const active_td = uiu.el(tr, 'td', {});
			const active_cb = create_simple_checkbox(active_td, {'name' : 'active_cb', 'data-court-id': c._id,}, c.is_active);
			active_cb.addEventListener('change', (e) => {
				const court_id = e.target.getAttribute('data-court-id');
				send_with_live_status({
					type: 'court_edit',
					tournament_key: curt.key,
					is_active: e.target.checked,
					court_id: court_id,
				}, err => {
					if (err) {
						return cerror.net(err);
					}
				});
			});
			const umpire_td = uiu.el(tr, 'td', {});
			const umpire_cb = create_simple_checkbox(umpire_td, {'name' : 'umpire_cb', 'data-court-id': c._id, 'disabled': true,}, true);
			const service_judge_td = uiu.el(tr, 'td', {});
			const service_judge_cb = create_simple_checkbox(service_judge_td, {'name' : 'service_judge_cb', 'data-court-id': c._id, 'disabled': true,}, true);
			const actions_td = uiu.el(tr, 'td', {});
			const del_btn = uiu.el(actions_td, 'button', {
				'data-court-id': c._id,
			}, 'Delete');
			del_btn.addEventListener('click', function (e) {
				const del_btn = e.target;
				const court_id = del_btn.getAttribute('data-court-id');
				if (confirm('Do you really want to delete ' + court_id + '? (Will not do anything yet!)')) {
					debug.log('TODO: would now delete court');
				}
			});
		}

		const nums = curt.courts.map(c => parseInt(c.num));
		const maxnum = Math.max(0, Math.max.apply(null, nums));
	}

	function create_simple_checkbox(parant_el, attrs, is_checked) {
		attrs.type = 'checkbox';
		if(is_checked){
			attrs.checked = 'checked';
		}
		const result = uiu.el(parant_el, 'input', attrs);
		return result;
	}

	function update_court(court) {
		switch (get_admin_subpage()){
			case 'edit':
				const courts_table = uiu.qs('.courts_table');
				const checkbox = courts_table.querySelector(`[name="active_cb"][data-court-id="${court._id}"]`);
				checkbox.checked = court.is_active;
				break;
			default:
				cmatch.update_court(court);
				break;
		} 
	}

	function create_checkbox(curt, parent_el, filed_id) {
		const label = uiu.el(parent_el, 'label');
		const attrs = {
			type: 'checkbox',
			name: filed_id,
		};
		if (curt[filed_id]) {
			attrs.checked = 'checked';
		}
			const result = uiu.el(label, 'input', attrs);
			uiu.el(label, 'span', {}, ci18n('tournament:edit:' + filed_id));
			bind_live_prop(result, filed_id);
			return result;
		}

	function create_input(curt, type, parent_el, filed_id) {
		const text_input = uiu.el(parent_el, 'label');
		uiu.el(text_input, 'span', {}, ci18n('tournament:edit:' + filed_id));
			const result = uiu.el(text_input, 'input', {
				type: type,
				name: filed_id,
				value: curt[filed_id] || '',
			});
			bind_live_prop(result, filed_id, {
				event_name: (type === 'text') ? 'blur' : 'change',
				get_value: type === 'number' ? input_el => Number(input_el.value) : undefined,
			});
			return result;
		}

	function create_undecorated_input(type, parent_el, filed_id) {
		return (
			uiu.el(parent_el, 'input', {
				type: type,
				name: filed_id,
				id: filed_id,
				value: '',
			})
		);
	}

	function create_textarea_input(type, parent_el, filed_id) {
		return (
			uiu.el(parent_el, 'textarea', {
				type: type,
				name: filed_id,
				id: filed_id,
				value: '',
			})
		);
	}

	function create_numeric_input(curt, parent_el, filed_id, min_value, max_value, default_value, step_value) {
		const text_input = uiu.el(parent_el, 'label');
		uiu.el(text_input, 'span', {}, ci18n('tournament:edit:' + filed_id));
			const result = uiu.el(text_input, 'input', {
				type: "number",
				name: filed_id,
				value: curt[filed_id] || default_value,
				min: min_value,
				max: max_value,
				step: step_value
			});
			bind_live_prop(result, filed_id, {
				get_value: input_el => Number(input_el.value),
			});
			return result;
		}

	function createCourtSelectBox(parentEl, parent_id, court_id) {
		const court_select_box = uiu.el(parentEl, 'select', {
			name: 'court_' + parent_id,
		});

		const empty_id = "--";
		const attrs = {
			'data-display-setting-id': court_id,
			value: empty_id,
		}

		if (!court_id || empty_id === court_id) {
			attrs.selected = 'selected';
		}
		uiu.el(court_select_box, 'option', attrs, empty_id);

		for (const court of curt.courts) {
			const attrs = {
				'data-display-setting-id': court_id,
				value: court._id,
			}

			if ((court_id === court._id)) {
				attrs.selected = 'selected';
			}
			uiu.el(court_select_box, 'option', attrs, court.num);
		}


		court_select_box.addEventListener('change', (e) => {
			const select_box = e.target;
			const display_setting_id = select_box.name.split("_")[1];
			send_with_live_status({
				type: 'relocate_display',
				tournament_key: curt.key,
				new_court_id: e.srcElement.value,
				display_setting_id: display_setting_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function createDisplaySettingsSelectBox(parentEl, parent_id, displaysettings_id) {
		const displaysettings_select_box = uiu.el(parentEl, 'select', {
			name: 'displaysettings_' + parent_id,
		});

		createSelectBoxContent(displaysettings_select_box, curt.displaysettings, displaysettings_id);

		displaysettings_select_box.addEventListener('change', (e) => {
			const select_box = e.target;
			const display_setting_id = select_box.name.split("_")[1];
			send_with_live_status({
				type: 'change_display_mode',
				tournament_key: curt.key,
				new_displaysettings_id: e.srcElement.value,
				display_setting_id: display_setting_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function createGeneralDisplaySettingsSelectBox(parentEl, displaysettings_id) {
		const displaysettings_select_box = uiu.el(parentEl, 'select', {
			name: 'displaysettings_general'
		});
		createSelectBoxContent(displaysettings_select_box, curt.displaysettings, displaysettings_id);
		return displaysettings_select_box;	
	}
	function createSelectBoxContent(select_box, content, selected_id) {
		for (const item of content) {
			const attrs = {
				'data-display-setting-id': selected_id,
				value: item.id,
				label: item.description,
			}
			if ((selected_id === item.id)) {
				attrs.selected = 'selected';
			}
			uiu.el(select_box, 'option', attrs, item.id);
		}
	}

	function render_upcoming(container) {
		cmatch.prepare_render(curt);
		const courts_container = uiu.el(container, 'div', 'courts_container');
		cmatch.render_courts(courts_container, 'public');
		const upcoming_container = uiu.el(container, 'div', 'upcoming_container');
		cmatch.render_upcoming_matches(upcoming_container);
	}

	function render_current_matches(container) {
		cmatch.prepare_render(curt);
		const courts_container = uiu.el(container, 'div', 'courts_container');
		cmatch.render_courts(courts_container, 'public');
	}

	function render_next_matches(container) {
		cmatch.prepare_render(curt);
		const upcoming_container = uiu.el(container, 'div', 'upcoming_container');
		cmatch.render_upcoming_matches(upcoming_container);
	}

	function rerender_public_match_views(old_section, new_section) {
		const affects_courts = (
			old_section.startsWith('court_') ||
			new_section.startsWith('court_')
		);
		const affects_upcoming = (
			old_section === 'unassigned' ||
			new_section === 'unassigned'
		);

		if ((current_view === 'upcoming' || current_view === 'current_matches') && affects_courts) {
			uiu.qsEach('.courts_container', (courts_container) => {
				cmatch.render_courts(courts_container, 'public');
			});
		}

		if ((current_view === 'upcoming' || current_view === 'next_matches') && affects_upcoming) {
			uiu.qsEach('.upcoming_container', (upcoming_container) => {
				cmatch.render_upcoming_matches(upcoming_container);
			});
		}
	}

	function ui_upcoming() {
		current_view = 'upcoming';
		const main = ui_match_screens('t/:key/upcoming');
		render_upcoming(main);
	}

	function ui_current_matches() {
		current_view = 'current_matches';
		const main = ui_match_screens('t/:key/current_matches');
		render_current_matches(main);
	}

	function ui_next_matches() {
		current_view = 'next_matches';
		const main = ui_match_screens('t/:key/next_matches');
		render_next_matches(main);
	}

	function ui_match_screens(route) {
		crouting.set(route, { key: curt.key });
		toprow.hide();
		const main = uiu.qs('.main');
		uiu.empty(main);
		main.classList.add('main_upcoming');
		main.onclick = () => fullscreen.toggle();
		return main;
	}

	_route_single(/t\/([a-z0-9]+)\/upcoming/, ui_upcoming, change.default_handler(_update_all_ui_elements_upcoming, {
		score: update_score,
		court_current_match: update_upcoming_current_match,
		match_edit: update_upcoming_match,
		update_player_status: update_player_status, 
	}));

	_route_single(/t\/([a-z0-9]+)\/current_matches/, ui_current_matches, change.default_handler(_update_all_ui_elements_current_matches, {
		score: update_score,
		court_current_match: update_upcoming_current_match,
		match_edit: update_upcoming_match,
		update_player_status: update_player_status,
	}));
	_route_single(/t\/([a-z0-9]+)\/next_matches/, ui_next_matches, change.default_handler(_update_all_ui_elements_next_matches, {
		score: update_score,
		court_current_match: update_upcoming_current_match,
		match_edit: update_upcoming_match,
		update_player_status: update_player_status,
	}));


	function init() {
		send({
			type: 'tournament_list',
		}, function (err, response) {
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
			zip } = task;

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

		scoresheet.load_sheet(scoresheet.sheet_name(setup), function (xml) {
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
			setTimeout(function () {
				_render_scoresheet(task, pos + 1, cb);
			}, 0);
		}, '/bupdev/');
	}

	function get_admin_subpage() {
		const path = window.location.pathname;
		const parts = path.split('/').filter(Boolean); // Entfernt leere Einträge (z. B. durch führendes '/')
	
		// Erwartet: ['admin', 't', 'TurnierName', 'subpage?']
		if (parts.length < 3 || parts[0] !== 'admin' || parts[1] !== 't') {
			return null; // Nicht im erwarteten Admin-Pfad
		}
	
		const subpage = parts[3]; // Kann undefined sein
	
		switch (subpage) {
			case undefined:
				return 'tournament-control';
			default:
				return subpage;
		}
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

			_render_scoresheet(task, 0, function () {
				uiu.text(status, 'Generiere Zip.');
				const zip_fn = curt.name + ' Schiedsrichterzettel.zip';
				zip.generateAsync({ type: 'blob' }).then(function (blob) {
					uiu.text(status, 'Starte  Download.');

					save_file(blob, zip_fn);
					uiu.text(status, 'Fertig.');
				}).catch(function (error) {
					uiu.text(status, 'Fehler: ' + error.stack);
				});
			});
		});

		const cancel_btn = uiu.el(dialog, 'div', 'vlink', 'Zurück');
		cancel_btn.addEventListener('click', _cancel_ui_allscoresheets);
	}
	crouting.register(/t\/([a-z0-9]+)\/allscoresheets$/, function (m) {
		ctournament.switch_tournament(m[1], function () {
			ui_allscoresheets();
		});
	}, change.default_handler(ui_allscoresheets));


	return {
		init,
		// For other modules
		switch_tournament,
		ui_show,
		ui_list,
		add_match,
		update_match,
		update_officials,
		update_upcoming_match,
		update_logo,
		update_display,
		update_location,
		update_location_logo,
		update_court,
		update_emergency_btn,
		update_scoring_formats,
		update_stages_scoring_formats,
		btp_status_changed,
		ticker_status_changed,
		bts_status_changed,
		remove_normalization,
		add_normalization,
		remove_advertisement,
		add_advertisement,
			update_general_displaysettings,
			update_metadata_settings,
			update_edit_dependencies,
			update_btp_settings_ui,
			update_show_tabletoperators,
			close_scoring_format_dialog_if_open,
			refresh_current_view,
			delete_display,
		};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var calc = require('../bup/js/calc');
	var displaymode = require('../bup/js/displaymode');
	var cbts_utils = require('./cbts_utils');
	var ccsvexport = require('./ccsvexport');
	var cerror = require('./cerror');
	var change = require('./change');
	var ci18n = require('./ci18n');
	var cmatch = require('./cmatch');
	var crouting = require('./crouting');
	var cumpires = require('./cumpires');
	var ctabletoperator = require('./ctabletoperator');
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
	var timezones = require('./timezones.js');

	var JSZip = null; // External library

	module.exports = ctournament;
}
/*/@DEV*/
