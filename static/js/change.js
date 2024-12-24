var change = (function() {

function default_handler(rerender, special_funcs) {
	return function(c) {
		default_handler_func(rerender, special_funcs, c);
	};
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
		case 'props': {
			curt.name = c.val.name;
			curt.is_team = c.val.is_team;
			curt.tguid = c.val.tguid;
			curt.is_nation_competition = c.val.is_nation_competition;
			curt.btp_timezone = c.val.btp_timezone;
			curt.warmup = c.val.warmup;
			curt.warmup_ready = c.val.warmup_ready;
			curt.warmup_start = c.val.warmup_start;
			curt.btp_enabled = c.val.btp_enabled;
			curt.btp_autofetch_enabled = c.val.btp_autofetch_enabled;
			curt.btp_readonly = c.val.btp_readonly;
			curt.btp_ip = c.val.btp_ip;
			curt.ticker_enabled = c.val.ticker_enabled;
			curt.ticker_url = c.val.ticker_url;
			curt.ticker_password = c.val.ticker_password;
			curt.logo_id = c.val.logo_id;

			uiu.qsEach('.ct_name', function(el) {
				if (el.tagName.toUpperCase() === 'INPUT') {
					el.value = c.val.name;
				} else {
					uiu.text(el, c.val.name);
				}
			});
			const CHECKBOXES = [
				'is_team', 'is_nation_competition',
				'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly',
				'ticker_enabled', 'tabletoperator_enabled', 'tabletoperator_with_state_enabled',
				'tabletoperator_winner_of_quaterfinals_enabled', 'tabletoperator_split_doubles',
				'tabletoperator_set_break_after_tabletservice', 'tabletoperator_break_seconds',
				'announcement_speed', 'announcement_pause_time_ms',
				'upcoming_matches_animation_speed', 'upcoming_matches_max_count', 'upcoming_matches_animation_pause',
				'tabletoperator_use_manual_counting_boards_enabled', 'tabletoperator_with_umpire_enabled',
				'annoncement_include_event', 'annoncement_include_round', 'annoncement_include_matchnumber',
				'call_preparation_matches_automatically_enabled','call_next_possible_scheduled_match_in_preparation',
				'preparation_meetingpoint_enabled','preparation_tabletoperator_setup_enabled'];
			for (const cb_name of CHECKBOXES) {
				uiu.qsEach('input[name="' + cb_name + '"]', function(el) {
					el.checked = curt[cb_name];
				});
			}
			uiu.qsEach('input[name="btp_ip"]', function(el) {
				el.value = curt.btp_ip;
			});

			uiu.qsEach('input[name="ticker_url"]', function(el) {
				el.value = curt.ticker_url;
			});
			uiu.qsEach('input[name="ticker_password"]', function(el) {
				el.value = curt.ticker_password;
			});
			break;}
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
			console.log("match_edit in change.js");
			ctournament.update_match(c);
			break;
		case 'match_add':
			const match_id = c.val.match__id;
			// Find the match
			const m = utils.find(curt.matches, m => m._id === match_id);
			if (!m) {
				ctournament.add_match(c);
				curt.matches.push(c.val.match);
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
		case 'match_preparation_call':
			announcePreparationMatch(c.val.match.setup);
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
		case 'normalization_add':
			ctournament.add_normalization(c);
			break;
		case 'normalization_removed':
			ctournament.remove_normalization(c);
			break;
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
			}
			cumpires.ui_status(uiu.qs('.umpire_container'));
			break;
		case 'umpire_add':
			const added_umpire = c.val.umpire;
			curt.umpires.push(added_umpire);
			cumpires.ui_status(uiu.qs('.umpire_container'));
				break;
		case 'umpire_removed':
			const removed_umpire = c.val.umpire;
			const ru = utils.find(curt.umpires, m => m._id === removed_umpire._id);
			curt.umpires.splice(curt.umpires.indexOf(ru), 1);
			cumpires.ui_status(uiu.qs('.umpire_container'));
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
			break;
		case 'update_display_setting':
			const updated_setting = c.val.setting;
			const s = utils.find(curt.displaysettings, m => m.id === updated_setting.id);
			if(!s) {
				curt.displaysettings.push(updated_setting);
				curt.displaysettings.sort(utils.cmp_key('id'));
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
			const d = utils.find(curt.displays, m => m.client_id === display_setting.client_id);
			var laststatus = false;
			if (!d) {
				curt.displays[curt.displays.length] = display_setting;
				curt.displays.sort(utils.cmp_key('client_id'));
				return;
			} else {
				laststatus = d.online;
				d.court_id = display_setting.court_id;
				d.displaysetting_id = display_setting.displaysetting_id;
				d.online = display_setting.online;
				d.battery = display_setting.battery;
			}
			if (laststatus != d.online) {
				cerror.silent('Display ' + display_setting.client_id + ' is ' + (display_setting.online ? 'online' : 'offline'));
			}
			ctournament.update_display(d);
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
