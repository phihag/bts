'use strict';

var curt; // current tournament

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

		cmatch.update_players(m);
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
		ctabletoperator.render_unassigned(uiu.qs('.unassigned_tableoperators_container'));
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

	function render_announcement_formular(target) {
		const announcements = uiu.el(target, 'div', 'announcements_container');
		const heading = uiu.el(announcements, 'h3', {}, 'Freie Ansage');
		const form = uiu.el(announcements, 'form');
		uiu.el(form, 'textarea', {
			type: 'textarea',
			id: 'custom_announcement',
			name: 'custom_announcement',
			cols: '50',
			rows: '4',
			maxlength: '175'
		});
		const btp_fetch_btn = uiu.el(form, 'button', {
			'class': 'match_save_button',
			role: 'submit',
		}, 'Ansage abspielen');
		form_utils.onsubmit(form, function (d) {
			//announce([d.custom_announcement]);
			send({
				type: 'free_announce',
				tournament_key: curt.key,
				text: d.custom_announcement,
			}, function (err) {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}

	function render_enable_announcement(target) {
		const announcements = uiu.el(target, 'div', 'enable_announcements_container');
		const heading = uiu.el(announcements, 'h3', {}, 'Ansagen auf diesem Gerät');
		const form = uiu.el(announcements, 'form');
		const enable_announcements = uiu.el(form, 'input', {
			type: 'checkbox',
			id: 'enable_announcements',
			name: 'enable_announcements'
		});

		enable_announcements.checked = (window.localStorage.getItem('enable_announcements') === 'true');
		uiu.el(form, 'label', { for: 'enable_announcements' }, 'aktiv');
		enable_announcements.addEventListener('change', change_announcements);
	}

	function change_announcements(e) {
		let enable_announcements = document.getElementById('enable_announcements');
		window.localStorage.setItem('enable_announcements', enable_announcements.checked);
	}

	function ui_show() {
		crouting.set('t/:key/', { key: curt.key });
		const bup_lang = ((curt.language && curt.language !== 'auto') ? '&lang=' + encodeURIComponent(curt.language) : '');
		const bup_dm_style = '&dm_style=' + encodeURIComponent(curt.dm_style || 'international');
		toprow.set([{
			label: ci18n('Tournaments'),
			func: ui_list,
		}, {
			label: curt.name || curt.key,
			func: ui_show,
			'class': 'ct_name',
		}], [{
			label: ci18n('Scoreboard'),
			href: '/bup/#btsh_e=' + encodeURIComponent(curt.key) + '&display' + bup_dm_style + bup_lang,
		}, {
			label: ci18n('Umpire Panel'),
			href: '/bup/#btsh_e=' + encodeURIComponent(curt.key) + bup_lang,
		}, {
			label: ci18n('Matchoverview'),
			href: '/admin/t/' + encodeURIComponent(curt.key) + '/upcoming',
		}, {
			label: ci18n('Current Matches'),
			href: '/admin/t/' + encodeURIComponent(curt.key) + '/current_matches',
		}, {
			label: ci18n('Next Matches'),
			href: '/admin/t/' + encodeURIComponent(curt.key) + '/next_matches',
		}]);

		const main = uiu.qs('.main');
		uiu.empty(main);

		const meta_div = uiu.el(main, 'div', 'metadata_container');

		uiu.el(meta_div, 'div', 'unassigned_tableoperators_container');
		uiu.el(meta_div, 'div', 'umpire_container');
		render_announcement_formular(meta_div);

		const meta_right_div = uiu.el(meta_div, 'div', 'metadata_right_container');

		render_enable_announcement(meta_right_div);

		render_settings(meta_right_div);
		
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

		uiu.el(settings_div, 'div', 'errors');
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
			send({
				type: 'tournament_upload_logo',
				tournament_key: curt.key,
				data_url: reader.result,
			}, (err) => {
				if (err) {
					return cerror.net(err);
				}
				input.closest('form').reset();
			});
		};
		reader.onerror = (e) => {
			alert('Failed to upload: ' + e);
		};
	}

	function ui_edit() {
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


			const name_tguid = uiu.el(tournament_div, 'label');
			uiu.el(name_tguid, 'span', {}, ci18n('tournament:edit:tguid'));
			input.tguid = uiu.el(name_tguid, 'input', {
				type: 'text',
				name: 'tguid',
				value: curt.tguid ? curt.tguid : "",
				'class': 'ct_tguid',
			});

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

			const btp_ip_label = uiu.el(btp_fieldset, 'label');
			uiu.el(btp_ip_label, 'span', {}, ci18n('tournament:edit:btp:ip'));
			input.btp_ip = uiu.el(btp_ip_label, 'input', {
				type: 'text',
				name: 'btp_ip',
				value: (curt.btp_ip || ''),
			});

			const btp_password_label = uiu.el(btp_fieldset, 'label');
			uiu.el(btp_password_label, 'span', {}, ci18n('tournament:edit:btp:password'));
			input.btp_password = uiu.el(btp_password_label, 'input', {
				type: 'text',
				name: 'btp_password',
				value: (curt.btp_password || ''),
			});

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
		
		
		// devices-div##################################################################################
		{
			const devices_div = uiu.el(form, 'div', 'settings');
			uiu.el(devices_div, 'h2', 'edit', ci18n('tournament:edit:devices'));
			
			uiu.el(devices_div, 'h3', 'edit', ci18n('tournament:edit:logo'));
			const logo_preview_container = uiu.el(devices_div, 'div', {
				style: (
					'position:relative;text-align:center;' +
					'height: 432px; width: 768px; font-size: 70px;' +
					'background:' + (curt.logo_background_color || '#000000') + ';' +
					'color:' + (curt.logo_foreground_color || '#aaaaaa') + ';'
				),
			});
			if (curt.logo_id) {
				uiu.el(logo_preview_container, 'img', {
					style: 'height: 320px;',
					src: '/h/' + encodeURIComponent(curt.key) + '/logo/' + curt.logo_id,
				});
				uiu.el(logo_preview_container, 'div', {}, 'Court 42');
			}

			const logo_form = uiu.el(devices_div, 'form');
			const logo_button = uiu.el(logo_form, 'input', {
				type: 'file',
				accept: 'image/*',
			});
			logo_button.addEventListener('change', _upload_logo);
			const logo_colors_container = uiu.el(logo_form, 'div', { style: 'display: block' });
			const bg_col_label = uiu.el(logo_colors_container, 'label', {}, ci18n('tournament:edit:logo:background'));
			const logo_background_color_input = uiu.el(bg_col_label, 'input', {
				type: 'color',
				name: 'logo_background_color',
				value: curt.logo_background_color || '#000000',
			});
			logo_background_color_input.addEventListener('change', (e) => {
				send({
					type: 'tournament_edit_props',
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
			fg_col_input.addEventListener('change', (e) => {
				send({
					type: 'tournament_edit_props',
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

			const displaysettings_style_label = uiu.el(default_display_fieldset, 'label');
			uiu.el(displaysettings_style_label, 'span', {}, ci18n('tournament:edit:displaysettings_general'));

			input.displaysettings_general = createGeneralDisplaySettingsSelectBox(displaysettings_style_label, curt.displaysettings_general ? curt.displaysettings_general : "default");

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
			uiu.el(location_div, 'h2', 'edit', ci18n('tournament:edit:location'));
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
	
			const ticker_url_label = uiu.el(ticker_fieldset, 'label');
			uiu.el(ticker_url_label, 'span', {}, ci18n('tournament:edit:ticker_url'));
			input.ticker_url = uiu.el(ticker_url_label, 'input', {
				type: 'text',
				name: 'ticker_url',
				value: (curt.ticker_url || ''),
			});
	
			const ticker_password_label = uiu.el(ticker_fieldset, 'label');
			uiu.el(ticker_password_label, 'span', {}, ci18n('tournament:edit:ticker_password'));
			input.ticker_password = uiu.el(ticker_password_label, 'input', {
				type: 'text',
				name: 'ticker_password',
				value: (curt.ticker_password || ''),
			});
		}

		// save-div##################################################################################
		{
			const save_div = uiu.el(form, 'div', 'settings');
			uiu.el(save_div, 'h2', 'edit', ci18n('tournament:edit'));

			const save_btn = uiu.el(save_div, 'button', {
				role: 'button',
			}, ci18n('tournament:edit:save'));
			save_btn.addEventListener('click', () => {
				send_props(input, (err) => {
					if (err) {
						cerror.net(err); // Fehlerbehandlung
					}
				});
			});

			const save_and_back_btn = uiu.el(save_div, 'button', {
				role: 'button',
			}, ci18n('tournament:edit:save_and_back'));
			save_and_back_btn.addEventListener('click', () => {
				send_props(input, (err) => {
					if (err) {
						cerror.net(err); // Fehlerbehandlung
					}

					ui_show();
				});
			});
			
				
				
			/*	
				() => {
				const props = {
					name : input.name.value,
					tguid: input.tguid.value,
					language: input.language.value,
					is_team: input.is_team.checked,
					is_nation_competition: input.is_nation_competition.checked,
					btp_enabled: input.btp_enabled.checked,
					btp_autofetch_enabled: input.btp_autofetch_enabled.checked,
					btp_readonly: input.btp_readonly.checked,
					btp_ip: input.btp_ip.value,
					btp_password: input.btp_password.value,
					btp_timezone: input.btp_timezone.value,
					btp_autofetch_timeout_intervall: input.btp_autofetch_timeout_intervall.value,
					dm_style: input.dm_style.value,
					displaysettings_general: input.displaysettings_general.value,
					warmup: input.warmup.value,
					warmup_ready: input.warmup_ready.value,
					warmup_start: input.warmup_start.value,
					ticker_enabled: input.ticker_enabled.checked,
					ticker_url: input.ticker_url.value,
					ticker_password: input.ticker_password.value,
					tabletoperator_enabled: input.tabletoperator_enabled.checked,
					tabletoperator_with_umpire_enabled: input.tabletoperator_with_umpire_enabled.checked,
					tabletoperator_winner_of_quaterfinals_enabled: input.tabletoperator_winner_of_quaterfinals_enabled.checked,
					tabletoperator_split_doubles: input.tabletoperator_split_doubles.checked,
					tabletoperator_with_state_enabled: input.tabletoperator_with_state_enabled.checked,
					tabletoperator_with_state_from_match_enabled: input.tabletoperator_with_state_from_match_enabled.checked,
					tabletoperator_set_break_after_tabletservice: input.tabletoperator_set_break_after_tabletservice.checked,
					tabletoperator_use_manual_counting_boards_enabled: input.tabletoperator_use_manual_counting_boards_enabled.checked,
					tabletoperator_break_seconds: input.tabletoperator_break_seconds.value,
					annoncement_include_event: input.annoncement_include_event.checked,
					annoncement_include_round: input.annoncement_include_round.checked,
					annoncement_include_matchnumber: input.annoncement_include_matchnumber.checkt,
					announcement_speed: input.announcement_speed.value,
					announcement_pause_time_ms: input.announcement_pause_time_ms.value,
					preparation_meetingpoint_enabled: input.preparation_meetingpoint_enabled.checked,
					preparation_tabletoperator_setup_enabled: input.preparation_tabletoperator_setup_enabled.checked,
					call_preparation_matches_automatically_enabled: input.call_preparation_matches_automatically_enabled.checked,
					call_next_possible_scheduled_match_in_preparation: input.call_next_possible_scheduled_match_in_preparation.checked
				}

				send({
					type: 'tournament_edit_props',
					key: curt.key,
					props: props,
				}, function (err) {
					if (err) {
						return cerror.net(err);
					}
					ui_show();
				});

			});
			*/
		}		
	}
	_route_single(/t\/([a-z0-9]+)\/edit$/, ui_edit, change.default_handler(_update_all_ui_elements_edit, {
		update_general_displaysettings: update_general_displaysettings,
	}));

	function send_props(input, callback) {
		console.log("send_props()");
		
		const props = {
			name : input.name.value,
			tguid: input.tguid.value,
			language: input.language.value,
			is_team: input.is_team.checked,
			is_nation_competition: input.is_nation_competition.checked,
			btp_enabled: input.btp_enabled.checked,
			btp_autofetch_enabled: input.btp_autofetch_enabled.checked,
			btp_autofetch_timeout_intervall: input.btp_autofetch_timeout_intervall.value,
			btp_readonly: input.btp_readonly.checked,
			btp_ip: input.btp_ip.value,
			btp_password: input.btp_password.value,
			btp_timezone: input.btp_timezone.value,
			dm_style: input.dm_style.value,
			displaysettings_general: input.displaysettings_general.value,
			warmup: input.warmup.value,
			warmup_ready: input.warmup_ready.value,
			warmup_start: input.warmup_start.value,
			ticker_enabled: input.ticker_enabled.checked,
			ticker_url: input.ticker_url.value,
			ticker_password: input.ticker_password.value,
			upcoming_matches_animation_speed: input.upcoming_animation_speed.value,
			upcoming_matches_max_count: input.upcoming_matches_max_count.value,
			upcoming_matches_animation_pause: input.upcoming_animation_pause.value,
			tabletoperator_enabled: input.tabletoperator_enabled.checked,
			tabletoperator_with_umpire_enabled: input.tabletoperator_with_umpire_enabled.checked,
			tabletoperator_winner_of_quaterfinals_enabled: input.tabletoperator_winner_of_quaterfinals_enabled.checked,
			tabletoperator_split_doubles: input.tabletoperator_split_doubles.checked,
			tabletoperator_with_state_enabled: input.tabletoperator_with_state_enabled.checked,
			tabletoperator_with_state_from_match_enabled: input.tabletoperator_with_state_from_match_enabled.checked,
			tabletoperator_set_break_after_tabletservice: input.tabletoperator_set_break_after_tabletservice.checked,
			tabletoperator_use_manual_counting_boards_enabled: input.tabletoperator_use_manual_counting_boards_enabled.checked,
			tabletoperator_break_seconds: input.tabletoperator_break_seconds.value,
			annoncement_include_event: input.annoncement_include_event.checked,
			annoncement_include_round: input.annoncement_include_round.checked,
			annoncement_include_matchnumber: input.annoncement_include_matchnumber.checkt,
			announcement_speed: input.announcement_speed.value,
			announcement_pause_time_ms: input.announcement_pause_time_ms.value,
			preparation_meetingpoint_enabled: input.preparation_meetingpoint_enabled.checked,
			preparation_tabletoperator_setup_enabled: input.preparation_tabletoperator_setup_enabled.checked,
			call_preparation_matches_automatically_enabled: input.call_preparation_matches_automatically_enabled.checked,
			call_next_possible_scheduled_match_in_preparation: input.call_next_possible_scheduled_match_in_preparation.checked,
		}

		send({
			type: 'tournament_edit_props',
			key: curt.key,
			props: props,
		}, (err) => {
			return callback(err);
		});
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
		create_undecorated_input("text", uiu.el(tr_input, 'td', {}), 'normalizations_language');
		const actions_td = uiu.el(tr_input, 'td', {});
		const add_btn = uiu.el(actions_td, 'button', {}, ci18n('tournament:edit:add'));
		add_btn.addEventListener('click', function (e) {

			var new_normalization = {}
			new_normalization.origin = document.getElementById('normalizations_origin').value;
			new_normalization.replace = document.getElementById('normalizations_replace').value;
			new_normalization.language = document.getElementById('normalizations_language').value;

			send({
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
				send({
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
			send({
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
				send({
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

	function render_general_displaysettings(main) {
		uiu.el(main, 'h3',  'edit', ci18n('tournament:edit:general_displaysettings'));
		const display_settings_table = uiu.el(main, 'table');
		const display_settings_tbody = uiu.el(display_settings_table, 'tbody');
		const tr = uiu.el(display_settings_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:setting'));
		uiu.el(tr, 'td', {}, ci18n('tournament:edit:displays:description'));

		for (const s of curt.displaysettings) {
			const tr = uiu.el(display_settings_tbody, 'tr');
			uiu.el(tr, 'th', {}, s.description ||s.id);
			const description_td = uiu.el(tr, 'td', {}, s.devicemode + (s.devicemode == 'display' ? ' (' + s.displaymode_style + ')' : ''));
			const actions_td = uiu.el(tr, 'td', {});
			const edit_btn = uiu.el(actions_td, 'button', {
				'data-display_setting_id': s.id,
			}, 'Edit');

			edit_btn.addEventListener('click', (e) => {				
				on_edit_display_setting_button_click(e);
			});


			const delete_btn = uiu.el(actions_td, 'button', {
				'data-display-setting-id': s.id,
			}, 'Delete');



			delete_btn.addEventListener('click', (e) => {
				const del_btn = e.target;
				const setting_id = del_btn.getAttribute('data-display-setting-id');

				send({
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
	}

	function _cancel_ui_edit_display_setting() {
		const dlg = document.querySelector('.display_setting_edit_dialog');
		if (!dlg) {
			return; // Already cancelled
		}
		cbts_utils.esc_stack_pop();
		uiu.remove(dlg);
	
		crouting.set('t/:key/edit/', { key: curt.key });
	}

	function on_edit_display_setting_button_click(e) {
		const btn = e.target;
		const display_setting_id = btn.getAttribute('data-display_setting_id');
		console.log(display_setting_id);
		ui_edit_display_setting(display_setting_id);
	}

	function ui_edit_display_setting(display_setting_id) {
		console.log(display_setting_id);
		console.log(curt);
		const display_setting = structuredClone(utils.find(curt.displaysettings, d => d.id === display_setting_id));
		console.log(display_setting);

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
			console.log(d);
			const displaysetting = create_displaysettings_object(d);
			console.log(displaysetting);

			send({
				type: 'edit_display_setting',
				tournament_key: curt.key,
				displaysetting: displaysetting,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
				console.log("call _cancel_ui_edit_display_setting()");
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
		render_drop_down(edit_display_setting_container, ci18n('display_setting:devicemode'), 'devicemode', ALL_DEVICE_MODES, display_setting.devicemode || '');
		render_drop_down(edit_display_setting_container, ci18n('display_setting:style'), 'displaymode_style', displaymode.ALL_STYLES, display_setting.displaymode_style || '');
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_pause'), 'd_show_pause', display_setting.d_show_pause);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_court_number'), 'd_show_court_number', display_setting.d_show_court_number);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_competition'), 'd_show_competition', display_setting.d_show_competition);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_round'), 'd_show_round', display_setting.d_show_round);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_middle_name'), 'd_show_middle_name', display_setting.d_show_middle_name);
		render_check_box(edit_display_setting_container, ci18n('display_setting:show_doubles_receiving'), 'd_show_doubles_receiving', display_setting.d_show_doubles_receiving);
		
		const select_color_div = uiu.el(edit_display_setting_container, 'div', { style: 'display: block' });
		const select_color_label = uiu.el(select_color_div, 'label', {}, ci18n('display_setting:colors'));
		render_select_color(select_color_label, 'd_c0', display_setting.d_c0);
		render_select_color(select_color_label, 'd_c1', display_setting.d_c1);
		render_select_color(select_color_label, 'd_cb0', display_setting.d_cb0);
		render_select_color(select_color_label, 'd_cb1', display_setting.d_cb1);
		render_select_color(select_color_label, 'd_cbg', display_setting.d_cbg);
		render_select_color(select_color_label, 'd_cbg2', display_setting.d_cbg2);
		render_select_color(select_color_label, 'd_cbg3', display_setting.d_cbg3);
		render_select_color(select_color_label, 'd_cbg4', display_setting.d_cbg4);
		render_select_color(select_color_label, 'd_cfg', display_setting.d_cfg);
		render_select_color(select_color_label, 'd_cfg2', display_setting.d_cfg2);
		render_select_color(select_color_label, 'd_cfg3', display_setting.d_cfg3);
		render_select_color(select_color_label, 'd_cfg4', display_setting.d_cfg4);
		render_select_color(select_color_label, 'd_cfgdark', display_setting.d_cfgdark);
		render_select_color(select_color_label, 'd_cexpt', display_setting.d_cexpt);
		render_select_color(select_color_label, 'd_ct', display_setting.d_ct);
		render_select_color(select_color_label, 'd_cborder', display_setting.d_cborder);
		render_select_color(select_color_label, 'd_cserv', display_setting.d_cserv);
		render_select_color(select_color_label, 'd_cserv2', display_setting.d_cserv2);
		render_select_color(select_color_label, 'd_crecv', display_setting.d_crecv);
		render_select_color(select_color_label, 'd_ctim_blue', display_setting.d_ctim_blue);
		render_select_color(select_color_label, 'd_ctim_active', display_setting.d_ctim_active);
		render_check_box(edit_display_setting_container, ci18n('display_setting:use_team_colors'), 'd_team_colors', display_setting.d_team_colors);
		render_select_number(edit_display_setting_container, ci18n('display_setting:scale'), 'd_scale', display_setting.d_scale, 20, 500);

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

		render_drop_down(edit_display_setting_container, ci18n('display_setting:language'), 'language', SHORT_BUP_LANGUAGES, display_setting.language, ALL_BUP_LANGUAGES);


		const ALL_ASK_FULLSCREAN_MODES = [
			'always',
			'auto',
			'never',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:fullscreen_ask'), 'fullscreen_ask', ALL_ASK_FULLSCREAN_MODES, display_setting.fullscreen_ask || '');


		const ALL_ANNOUNCEMENT_MODES = [
			'none',
			'all',
			'except-first',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:show_announcements'), 'show_announcements', ALL_ANNOUNCEMENT_MODES, display_setting.show_announcements || '');

		render_select_number(edit_display_setting_container, ci18n('display_setting:scale'), 'd_scale', display_setting.d_scale, 20, 500);
		render_select_number(edit_display_setting_container, ci18n('display_setting:button_block_timeout'), 'button_block_timeout', display_setting.button_block_timeout, 0, 5000);
		
		render_check_box(edit_display_setting_container, ci18n('display_setting:negative_timers'), 'negative_timers', display_setting.negative_timers);
		render_check_box(edit_display_setting_container, ci18n('display_setting:shuttle_counter'), 'shuttle_counter', display_setting.shuttle_counter);
		render_check_box(edit_display_setting_container, ci18n('display_setting:editmode_doubleclick'), 'editmode_doubleclick', display_setting.editmode_doubleclick);

		const ALL_CLICK_MODES = [
			'auto',
			'click',
			'touchstart',
			'touchend',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:click_mode'), 'click_mode', ALL_CLICK_MODES, display_setting.click_mode || '');
		
		const ALL_STYLE_MODES = [
			'default',
			'complete',
			'clean',
			'focus',
			'hidden',
		];
		render_drop_down(edit_display_setting_container, ci18n('display_setting:settings_style'), 'style', ALL_STYLE_MODES, display_setting.settings_style || '');
		render_select_number(edit_display_setting_container, ci18n('display_setting:network_timeout'), 'network_timeout', display_setting.network_timeout, 1, 600000);
		render_select_number(edit_display_setting_container, ci18n('display_setting:network_update_interval'), 'network_update_interval', display_setting.network_update_interval, 1, 600000);
	}

	function render_drop_down(container, label_text, select_name, values, curval, labels) {
		if(!labels) {
			labels = values;
		}
		
		const div = uiu.el(container, 'div');
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
	}

	function render_check_box(container, label_text, checkbox_name, is_checked) {
		const div = uiu.el(container, 'div');
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
	}

	function render_select_color(container, field_name, value) {
		const input = uiu.el(container, 'input', {
			type: 'color',
			name: field_name,
			value: value || '#000000',
		});
	}

	function render_select_number(container, label_text, input_name, value, min_value, max_value) {
		const div = uiu.el(container, 'div');
		const label = uiu.el(div, 'span', 'label', label_text);
		uiu.el(label, 'input', {
			type: 'number',
			name: input_name,
			min: min_value || 0,
			max: max_value || 0,
			value: value || 0,
		});
	} 

	function create_displaysettings_object(d) {
		const displaysetting  = {
			id: d.display_setting_id,
			description: d.display_setting_description || '',
			devicemode: d.devicemode || 'display',
			displaymode_style: d.displaymode_style || 'tournamentcourt',
			d_show_pause: d.d_show_pause == 'on' ? true : false,
			d_show_court_number: d.d_show_court_number == 'on' ? true : false,
			d_show_competition: d.d_show_competition == 'on' ? true : false,
			d_show_round: d.d_show_round == 'on' ? true : false,
			d_show_middle_name: d.d_show_middle_name == 'on' ? true : false,
			d_show_doubles_receiving: d.d_show_doubles_receiving == 'on' ? true : false,
			d_c0: d.d_c0 || '#50e87d',
			d_c1: d.d_c1 || '#f76a23',
			d_cb0: d.d_cb0 || '#000000',
			d_cb1: d.d_cb1 || '#000000',
			d_cbg: d.d_cbg || '#000000',
			d_cbg2: d.d_cbg2 || '#d9d9d9',
			d_cbg3: d.d_cbg3 || '#252525',
			d_cbg4: d.d_cbg4 || '#404040',
			d_cfg: d.d_cfg || '#ffffff',
			d_cfg2: d.d_cfg2 || '#aaaaaa',
			d_cfg3: d.d_cfg3 || '#cccccc',
			d_cfg4: d.d_cfg4 || '#000000',
			d_cfgdark: d.d_cfgdark || '#000000',
			d_cexpt: d.d_cexpt || '#000000',
			d_ct: d.d_ct || '#80ff00',
			d_cborder: d.d_cborder || '#444444',
			d_cserv: d.d_cserv || '#fff200',
			d_cserv2: d.d_cserv2 || '#dba766',
			d_crecv: d.d_crecv || '#707676',
			d_ctim_blue: d.d_ctim_blue || '#0070c0',
			d_ctim_active: d.d_ctim_active || '#ffc000',
			d_team_colors: d.d_team_colors == 'on' ? true : false,
			d_scale: d.d_scale || '100',
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

	function update_general_displaysettings(c)
	{
		//const general_displaysettings_div = uiu.qs('.general_displaysettings');
		const general_displaysettings_div = document.querySelector(".general_displaysettings");
		if(general_displaysettings_div) {
			general_displaysettings_div.innerHTML = '';
			console.log(general_displaysettings_div);
			render_general_displaysettings(general_displaysettings_div);
		}
	}

	function render_displaysettings(general_displaysettings_div) {
		uiu.el(general_displaysettings_div, 'h3', 'edit', ci18n('tournament:edit:displays'));

		const display_table = uiu.el(general_displaysettings_div, 'table');
		const display_tbody = uiu.el(display_table, 'tbody');
		const tr = uiu.el(display_tbody, 'tr');
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:num'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:hostname'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:batterylevel')); 
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:court'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:setting'));
		uiu.el(tr, 'th', {}, ci18n('tournament:edit:displays:onlinestatus'));
		

		for (const display of curt.displays) {
			const tr = uiu.el(display_tbody, 'tr', { 'data-display_id': display.client_id });
			render_display(tr, display);
		}
	}

	function update_display(display) {
		uiu.qsEach('[data-display_id=' + JSON.stringify(display.client_id) + ']', function (display_tr) {
			display_tr.innerHTML = '';
			render_display(display_tr, display);
		});
	}

	function render_display(tr, display) {
		uiu.el(tr, 'th', {}, display.client_id);
		uiu.el(tr, 'th', {}, display.hostname);
		var battery_node = uiu.el(tr, 'td', {}, 'N/A');
		set_battery_state(display.battery, battery_node);
		createCourtSelectBox(uiu.el(tr, 'td', {}, ''), display.client_id, display.court_id);
		createDisplaySettingsSelectBox(uiu.el(tr, 'td', {}, ''), display.client_id, display.displaysetting_id);
		uiu.el(tr, 'td', {}, (!display.online) ? 'offline' : 'online');
		const actions_td = uiu.el(tr, 'td', {});
		const reset_btn = uiu.el(actions_td, 'button', {
			'data-display-setting-id': display.client_id,
		}, 'Restart');

		if (!display.online) {
			reset_btn.setAttribute('disabled', 'disabled');
		}
		reset_btn.addEventListener('click', function (e) {
			const del_btn = e.target;
			const display_setting_id = del_btn.getAttribute('data-display-setting-id');
			send({
				type: 'reset_display',
				tournament_key: curt.key,
				display_setting_id: display_setting_id,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		});
	}
	function render_courts(main) {
		uiu.el(main, 'h2', 'edit', ci18n('tournament:edit:courts'));

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
		form_utils.onsubmit(courts_add_form, function (data) {
			courts_add_button.setAttribute('disabled', 'disabled');
			const court_count = parseInt(data.count);
			const nums = [];
			for (let court_num = maxnum + 1; court_num <= maxnum + court_count; court_num++) {
				nums.push(court_num);
			}

			send({
				type: 'courts_add',
				tournament_key: curt.key,
				nums,
			}, function (err, response) {
				if (err) {
					courts_add_button.removeAttribute('disabled');
					return cerror.net(err);
				}
				Array.prototype.push.apply(curt.courts, response.added_courts);
				ui_edit();
			});
		});
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
		return result;
	}

	function create_undecorated_input(type, parent_el, filed_id) {
		uiu.el(parent_el, 'input', {
			type: type,
			name: filed_id,
			id: filed_id,
			value: '',
		});
	}

	function create_numeric_input(curt, parent_el, filed_id, min_value, max_value, default_value, step_value) {
		const text_input = uiu.el(parent_el, 'label');
		uiu.el(text_input, 'span', {}, ci18n('tournament:edit:' + filed_id));
		return uiu.el(text_input, 'input', {
			type: "number",
			name: filed_id,
			value: curt[filed_id] || default_value,
			min: min_value,
			max: max_value,
			step: step_value
		});
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
			send({
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
			send({
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

	function ui_upcoming() {
		const main = ui_match_screens('t/:key/upcoming');
		render_upcoming(main);
	}

	function ui_current_matches() {
		const main = ui_match_screens('t/:key/current_matches');
		render_current_matches(main);
	}

	function ui_next_matches() {
		const main = ui_match_screens('t/:key/next_matches');
		render_next_matches(main);
	}

	function ui_match_screens(route) {
		crouting.set(route, { key: curt.key });
		toprow.hide();
		const main = uiu.qs('.main');
		uiu.empty(main);
		main.classList.add('main_upcoming');
		main.addEventListener('click', () => {
			fullscreen.toggle();
		});
		return main;
	}

	_route_single(/t\/([a-z0-9]+)\/upcoming/, ui_upcoming, change.default_handler(_update_all_ui_elements_upcoming, {
		score: update_score,
		court_current_match: update_upcoming_current_match,
		match_edit: update_upcoming_match,
		update_player_status: update_player_status, 
	}));

	_route_single(/t\/([a-z0-9]+)\/current_matches/, ui_current_matches, change.default_handler(_update_all_ui_elements_upcoming, {
		score: update_score,
		court_current_match: update_upcoming_current_match,
		match_edit: update_upcoming_match,
		update_player_status: update_player_status,
	}));
	_route_single(/t\/([a-z0-9]+)\/next_matches/, ui_next_matches, change.default_handler(_update_all_ui_elements_upcoming, {
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
		update_upcoming_match,
		update_display,
		btp_status_changed,
		ticker_status_changed,
		bts_status_changed,
		remove_normalization,
		add_normalization,
		remove_advertisement,
		add_advertisement,
		update_general_displaysettings,
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
	var displaymode = require('../bup/js/displaymode');

	var JSZip = null; // External library

	module.exports = ctournament;
}
/*/@DEV*/
