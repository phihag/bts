var change = (function() {

function default_handler(rerender, special_funcs) {
	return function(c) {
		default_handler_func(rerender, special_funcs, c);
	};
}

	function _apply_tournament_field_change(field, value) {
		curt[field] = value;

		if (field === 'name') {
			uiu.qsEach('.ct_name', function(el) {
				if (el.tagName.toUpperCase() === 'INPUT') {
					el.value = value || '';
				} else {
					uiu.text(el, value || '');
				}
			});
		}

		uiu.qsEach('input[name="' + field + '"]', function(el) {
			if (el.type === 'checkbox') {
				el.checked = !!value;
			} else {
				el.value = value ?? '';
			}
		});
		uiu.qsEach('select[name="' + field + '"]', function(el) {
			el.value = value ?? (field === 'btp_timezone' ? 'system' : '');
		});
	}

	function _after_tournament_field_change(field, value, change_obj) {
		if (current_view === 'edit') {
			ctournament.update_edit_dependencies();
		}
		if (field === 'displaysettings_general') {
			ctournament.update_general_displaysettings(change_obj);
		}
		if (field === 'language') {
			if (value && value !== 'auto') {
				ci18n.switch_language(value);
			}
			ctournament.refresh_current_view();
		}
		if (field === 'tabletoperator_enabled') {
			ctournament.refresh_current_view();
		}
		if (['btp_enabled', 'ticker_enabled'].includes(field)) {
			if (current_view === 'show') {
				ctournament.update_metadata_settings();
			}
		}
	}

	function change_score(cval) {
		const match_id = cval.match_id;

		// Find the match
		const m = utils.find(curt.matches, m => m._id === match_id);
		if (!m) {
			cerror.silent('Cannot find match to update score, ID: ' + JSON.stringify(match_id));
			return;
		}

		m.network_score = cval.network_score;
		m.presses = cval.presses;
		m.team1_won = cval.team1_won;
	}

	function default_handler_func(rerender, special_funcs, c) {
		if (special_funcs && special_funcs[c.ctype]) {
			special_funcs[c.ctype](c);
			return;
		}

		switch (c.ctype) {
		case 'free_announce':
			announce([c.val.text]);
			break;
		case 'emergency_announce':
			curt.enable_emergency = c.val;
			emergency_announce(c.val);
			if (current_view === 'show'){
				ctournament.update_emergency_btn()
			}
			if(curt.enable_emergency) {
				cerror.silent('Evakuierungsdurchsage wird gestartet!');
			} else {
				cerror.silent('Evakuierungsdurchsage wurde gestoppt');
			}
			break;
			case 'props': {
				for (const [field, value] of Object.entries(c.val)) {
					_apply_tournament_field_change(field, value);
				}

				if (c.val.scoring_formats) {
					ctournament.close_scoring_format_dialog_if_open(undefined, 'tournament:edit:scoring_formats:dialog_closed_external_change');
					ctournament.update_scoring_formats();
					ctournament.update_stages_scoring_formats();
				}
				for (const [field, value] of Object.entries(c.val)) {
					_after_tournament_field_change(field, value, c);
				}
				break;
			}
			case 'prop_changed': {
				const field = c.val.field;
				_apply_tournament_field_change(field, c.val.value);
				_after_tournament_field_change(field, c.val.value, c);
				break;
			}
			case 'logo_changed':
			if(c.val.logo_background_color != undefined) {
				curt.logo_background_color = c.val.logo_background_color;
			}
			if(c.val.logo_foreground_color != undefined) {
				curt.logo_foreground_color = c.val.logo_foreground_color;
			}
			if(c.val.logo_id != undefined) {
				curt.logo_id = c.val.logo_id;
			}
			if(c.val.logo_name != undefined) {
				curt.logo_name = c.val.logo_name;
			}
			ctournament.update_logo();
			break;
		case 'court_current_match':
			//nothing to do here
			break;
		case 'tabletoperator_add':
			//nothing to do here
			break;
		case 'tabletoperator_moved_up':
			//nothing todo here
			break;
		case 'tabletoperator_moved_down':
			//nothing todo here
			break;
		case 'tabletoperator_removed':
			//nothing todo here
			break;
		case 'match_edit':
			ctournament.update_match(c);
			break;
		case 'match_add':
			const match_id = c.val.match__id;
			// Find the match
			const m = utils.find(curt.matches, m => m._id === match_id);
			if (!m) {
				ctournament.add_match(c);
				curt.matches.push(c.val.match);
				curt.matches = curt.matches.sort( (a, b) => cmatch.cmp_match_order(a, b));
			} else {
				ctournament.add_match(c);
			}
			break;
		case 'match_delete':
			{
			const match_id = c.val.match__id;
			const deleted = utils.remove_cb(curt.matches, m => m._id === match_id);
			if (!deleted) {
				cerror.silent('Cannot find deleted match ' + match_id);
			}
			rerender();
			}
			break;
		case 'courts_changed':
			curt.courts = c.val.all_courts;
			rerender();
			break;
		case 'court_changed':
			const court = utils.find(curt.courts, court => court._id === c.val.court_id);
			if(court) {
				court.is_active = c.val.is_active;
			}
			ctournament.update_court(court);
			break;
		case 'locations_changed':
			curt.locations = c.val.all_locations;
			rerender();
			break; 
		case 'location_changed':
			const l = utils.find(curt.locations, l => l._id === c.val.location_id);
			if(l) {
				l.highlight = c.val.highlight;
				l.preparation_addition = c.val.preparation_addition;
				l.meetingpoint_announcement = c.val.meetingpoint_announcement;
			}
			ctournament.update_location(c.val.location_id, c.val.highlight, c.val.preparation_addition, c.val.meetingpoint_announcement);
			break;
		case 'location_highlight_changed':
			const old_location_highlight = c.val.old_location_highlight;
			const new_location_highlight = c.val.new_location_highlight;

			curt.matches.forEach((match) => {
				if(match.setup.highlight == old_location_highlight && match.setup.state === 'preparation'){
					match.setup.highlight = new_location_highlight;
					c.val = { match__id: match._id, match}
					ctournament.update_match(c);
					ctournament.update_upcoming_match(c);
				}
			});
			break;
		case 'location_logo_changed':
			const loc = utils.find(curt.locations, loc => loc._id === c.val.location_id);
			if(loc) {
				loc.logo_name = c.val.logo_name;
				loc.logo_id = c.val.logo_id;
			}
			ctournament.update_location_logo(c.val.location_id, loc.logo_id, loc.logo_name);
			break;
		case 'match_preparation_call':
			announcePreparationMatch(c.val.match.setup);
			curt.matches.forEach((match) => {
				match.setup.location_id = c.val.location_id;
			});
			ctournament.update_match(c);
			ctournament.update_upcoming_match(c);
			break;
		case 'match_called_on_court':
			announceNewMatch(c.val.setup);
			break;
		case 'begin_to_play_call':
			announceBeginnToPlay(c.val.setup);
			break;
		case 'second_call_tabletoperator':
			announceSecondCallTabletoperator(c.val.setup);
			break;
		case 'second_call_umpire':
			announceSecondCallUmpire(c.val.setup);
			break;
		case 'second_call_servicejudge':
			announceSecondCallServiceJudge(c.val.setup);
			break;
		case 'second_call_team_one':
			announceSecondCallTeamOne(c.val.setup);
			break;
		case 'second_call_team_two':
			announceSecondCallTeamTwo(c.val.setup);
			break;		
		case 'second_preparation_call_tabletoperator':
			announceSecondPreparationCallTabletoperator(c.val.setup);
			break;
		case 'second_preparation_call_umpire':
			announceSecondPreparationCallUmpire(c.val.setup);
			break;
		case 'second_preparation_call_servicejudge':
			announceSecondPreparationCallServiceJudge(c.val.setup);
			break;
		case 'second_preparation_call_team_one':
			announceSecondPreparationCallTeamOne(c.val.setup);
			break;
		case 'second_preparation_call_team_two':
			announceSecondPreparationCallTeamTwo(c.val.setup);
			break;
		case 'btp_status':
			ctournament.btp_status_changed(c);
			break;
		case 'ticker_status':
			ctournament.ticker_status_changed(c);
			break;
		case 'bts_status':
			ctournament.bts_status_changed(c);
			break;
		case 'normalization_add':
			ctournament.add_normalization(c);
			break;
		case 'normalization_removed':
			ctournament.remove_normalization(c);
			break;
		case 'advertisement_add':
			ctournament.add_advertisement(c);
			break;
		case 'advertisement_removed':
			ctournament.remove_advertisement(c);
			break;
		//case 'update_player_status':  {
		//	const cval = c.val;
		//	const id = cval.match__id;
//
		//	// Find the match
		//	const m = utils.find(curt.matches, m => m._id === id);
		//	if (!m) {
		//		cerror.silent('Cannot find match to update player status, ID: ' + JSON.stringify(id));
		//		return;
		//	}
		//	m.btp_winner = cval.btp_winner;
		//	m.setup = cval.setup;}
		//	break;	
		case 'umpires_changed':
			curt.umpires = c.val.all_umpires;
			uiu.qsEach('select[name="umpire_name"]', function(select) {
				cmatch.render_umpire_options(select, select.value);
			});
			break;
		case 'umpire_updated':
			const umpire = c.val;
			const u = utils.find(curt.umpires, m => m._id === umpire._id);
			if (u) {
				u.last_time_on_court_ts = umpire.last_time_on_court_ts;
				u.firstname = umpire.firstname;
				u.surname = umpire.surname;
				u.name = umpire.name;
				u.country = umpire.country;
				u.status = umpire.status;
				u.court_id = umpire.court_id;
				u.is_umpire = umpire.is_umpire;
				u.is_service_judge = umpire.is_service_judge;
				u.is_planed_as_umpire = umpire.is_planed_as_umpire;
				u.is_planed_as_service_judge = umpire.is_planed_as_service_judge;
				u.umpire_on_court = umpire.umpire_on_court;
				u.service_judge_on_court = umpire.service_judge_on_court;
				u.umpire_wait = umpire.umpire_wait;
				u.service_judge_wait = umpire.service_judge_wait;
				u.umpire_pause = umpire.umpire_pause;
				u.service_judge_pause = umpire.service_judge_pause;
				u.inactive_list = umpire.inactive_list;
			}
			if(current_view === 'show') {
				cumpires.ui_status(uiu.qs('.umpire_container'));
			}
			ctournament.update_officials();
			break;
		case 'umpire_add':
			const added_umpire = c.val.umpire;
			curt.umpires.push(added_umpire);
			if(current_view === 'show') {
				cumpires.ui_status(uiu.qs('.umpire_container'));
			}
			ctournament.update_officials();
				break;
		case 'umpire_removed':
			const removed_umpire = c.val.umpire;
			const ru = utils.find(curt.umpires, m => m._id === removed_umpire._id);
			curt.umpires.splice(curt.umpires.indexOf(ru), 1);
			if(current_view === 'show') {
				cumpires.ui_status(uiu.qs('.umpire_container'));
			}
			ctournament.update_officials();
			break;
		case 'official_list_move':
			const official = utils.find(curt.umpires, u => u._id === c.val.official_id);
			official[c.val.inactive_list] = null;
			official[c.val.service_judge_pause] = null;
			official[c.val.umpire_pause] = null;
			official[c.val.service_judge_wait] = null;
			official[c.val.umpire_wait] = null;
			official[c.val.service_judge_on_court] = null;
			official[c.val.umpire_on_court] = null;
			official[c.val.is_planed_as_service_judge] = false;
			official[c.val.is_planed_as_umpirefrom_list] = false;
			official[c.val.to_list] = c.val.new_ts;
			ctournament.update_officials();
			break;
		case 'official_edit':
			const official_edit = utils.find(curt.umpires, u => u._id === c.val.official_id);
			official_edit[c.val.field] = c.val.value;
			ctournament.update_officials();
			break;
		case 'score':
			change_score(c.val);
			// Most dialogs don't show any matches, so do not rerender
			break;
			case 'update_btp_settings':
				if(!curt.btp_settings) {
					curt.btp_settings = {};
				}
				const btp_settings = c.val.btp_settings;
				for (const [key, value] of Object.entries(btp_settings)) {
					curt.btp_settings[key] = value;
				}
				ctournament.update_btp_settings_ui();
				break;
			case 'update_btp_scoring_formats':
				if(!curt.scoring_formats) {
					curt.scoring_formats = {};
				}
				const scoring_formats = c.val.scoring_formats;
				for (const [key, value] of Object.entries(scoring_formats)) {
					curt.scoring_formats[key] = value;
				}
				ctournament.close_scoring_format_dialog_if_open(undefined, 'tournament:edit:scoring_formats:dialog_closed_btp_sync');
				ctournament.update_scoring_formats();
				break;
			case 'scoring_format_changed':
				if (!curt.scoring_formats) {
					curt.scoring_formats = { formats: [], default_id: null };
				}
				if (!Array.isArray(curt.scoring_formats.formats)) {
					curt.scoring_formats.formats = [];
				}
				const changed_scoring_format = c.val.scoring_format;
				const changed_index = curt.scoring_formats.formats.findIndex(f => Number(f.id) === Number(changed_scoring_format.id));
				if (changed_index === -1) {
					curt.scoring_formats.formats.push(changed_scoring_format);
				} else {
					curt.scoring_formats.formats[changed_index] = changed_scoring_format;
				}
				ctournament.close_scoring_format_dialog_if_open(changed_scoring_format.id, 'tournament:edit:scoring_formats:dialog_closed_external_change');
				ctournament.update_scoring_formats();
				ctournament.update_stages_scoring_formats();
				break;
			case 'update_btp_events':
			if(!curt.events) {
				curt.events = {};
			}
			const events = c.val.events;
			for (const [key, value] of Object.entries(events)) {
				curt.events[key] = value;
			}
			ctournament.update_stages_scoring_formats();
			break;
		case 'update_display_setting':
			const updated_setting = c.val.setting;
			const index = curt.displaysettings.findIndex(m => m.id === updated_setting.id);
			if (index === -1) {
				curt.displaysettings.push(updated_setting);
				curt.displaysettings.sort(utils.cmp_key('id'));
			} else {
				curt.displaysettings[index] = updated_setting;
			}
			ctournament.update_general_displaysettings(c);
			break;
		case 'delete_display_setting':
			const removed_setting_id = c.val.setting_id;
			const rs = utils.find(curt.displaysettings, m => m.id === removed_setting_id);
			curt.displaysettings.splice(curt.displaysettings.indexOf(rs), 1);
			ctournament.update_general_displaysettings(c);
			break;
		case 'display_status_changed':
			const display_setting = c.val.display_court_displaysetting;
			var d = utils.find(curt.displays, m => m.client_id === display_setting.client_id);
			const last_d = {...d};
			if (!d) {
				curt.displays[curt.displays.length] = display_setting;
				curt.displays.sort(utils.cmp_key('client_id'));
				return;
			} else {
				d.court_id = display_setting.court_id;
				d.displaysetting_id = display_setting.displaysetting_id;
				d.online = display_setting.online;
				if(display_setting.battery){
					d.battery = display_setting.battery;
				}
				
				if(d.displaysetting_id != last_d.displaysetting_id){
					ctournament.update_general_displaysettings(c);
				}
			}
			if (last_d.online != d.online) {
				cerror.silent('Display ' + display_setting.client_id + ' is ' + (display_setting.online ? 'online' : 'offline'));
			}
			if(!utils.deep_equal(d, last_d)){		
				ctournament.update_display(d);
			}
			break;
		case 'delete_display':
			const client_id = c.val.client_id;
			const display = utils.find(curt.displays, m => m.client_id === client_id);
			utils.remove(curt.displays, display);
			ctournament.delete_display(c);
			break;
		case 'display_wait_for_done':
			var d = utils.find(curt.displays, m => m.client_id === c.val.client_id);
			d.wait_for_ctype = c.val.ctype;
			if(!d.wait_for_done) {
				d.wait_for_done = true;
				ctournament.update_display(d);
			}
			break;
		case 'display_is_done':
			var d = utils.find(curt.displays, m => m.client_id === c.val.client_id);
			if(d.wait_for_done && d.wait_for_ctype == c.val.ctype) {
				d.wait_for_done = false;
				ctournament.update_display(d);
			}
			break;
		default:
			cerror.silent('Unsupported change type ' + c.ctype);
		}
	}

	return {
		default_handler
	};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var cmatch = require('./cmatch');
	var ctournament = require('./ctournament');
	var uiu = require('../bup/js/uiu');
	var utils = require('./utils');
	var cumpires = require('./cumpires');
    module.exports = change;
}
/*/@DEV*/
