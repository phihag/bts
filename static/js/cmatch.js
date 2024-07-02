'use strict';

var cmatch = (function() {

const OVERRIDE_COLORS_KEYS = ['', 'bg'];

function calc_score_str(match) {
	const netscore = match.network_score;
	if (!netscore) {
		return '';
	}
	return netscore.map(game => game[0] + ':' + game[1]).join(' ');
}

function calc_section(m) {
	if (typeof m.team1_won === 'boolean') {
		return 'finished';
	}
	if (m.setup.court_id && m.setup.now_on_court) {
		return 'court_' + m.setup.court_id;
	}
	return 'unassigned';
}

function render_match_table_header(table) {
	const thead = uiu.el(table, 'thead');
	const title_tr = uiu.el(thead, 'tr');
	uiu.el(title_tr, 'th');
	uiu.el(title_tr, 'th', {}, ci18n('Court'));
	uiu.el(title_tr, 'th', {}, '#');
	uiu.el(title_tr, 'th', {}, ci18n('Match'));
	uiu.el(title_tr, 'th', {
		colspan: 3,
	}, ci18n('Players'));
	uiu.el(title_tr, 'th', {}, ci18n('Umpire'));
	uiu.el(title_tr, 'th', {}, '');
	uiu.el(title_tr, 'th', {}, '');
}

function render_match_row(tr, match, court, style, show_player_status, show_add_tabletoperator) {
	if(!match.setup.is_match) {
		return;
	}
	
	if (!court && match.setup.court_id) {
		court = curt.courts_by_id[match.setup.court_id];
	}

	const waitForMatchStart = 	match.setup.called_timestamp && 
							(	match.network_score == undefined ||
								( 	match.network_score[0] && 
									(match.network_score[0][0] + match.network_score[0][1] < 1)
								)
							);
	const activeMatch = court && match.btp_winner != undefined;
	const setup = match.setup;
	if (style === 'default' || style === 'plain') {
		const actions_td = uiu.el(tr, 'td');
		create_match_button(actions_td, 'vlink match_edit_button', 'match:edit', on_edit_button_click, match._id);
		create_match_button(actions_td, 'vlink match_scoresheet_button', 'match:scoresheet', on_scoresheet_button_click, match._id);
		uiu.el(actions_td, 'a', {
			'class': 'match_rawinfo',
			'title': ci18n('match:rawinfo'),
			'href': '/h/' + encodeURIComponent(curt.key) + '/m/' + encodeURIComponent(match._id) + '/info',
		});
	}

	if (style === 'default') {
		uiu.el(tr, 'td', court ? 'court_history' : '', court ? court.num : '');
	}

	if (style === 'default' || style === 'plain') {
		const match_str = (setup.scheduled_time_str ? (setup.scheduled_time_str + ' ') : '') + (setup.match_name ? (setup.match_name + ' ') : '') + setup.event_name;
		uiu.el(tr, 'td', 'match_num', setup.match_num);
		uiu.el(tr, 'td', {}, match_str);
	} else if (style === 'upcoming') {
		uiu.el(tr, 'td', {
			style: 'min-width: 0.8em;'
		}, court ? court.num : '');
		uiu.el(tr, 'td', {
			style: 'color: #aaa;',
		}, `#${setup.match_num}`);
		uiu.el(tr, 'td', {
			style: 'color: #aaa;',
		}, setup.scheduled_time_str || '');
		uiu.el(tr, 'td', {
			style: 'color: #aaa;',
		}, setup.event_name);
	}
	const players0 = uiu.el(tr, 'td', {
		'class': ((match.team1_won === true) ? 'match_team_won' : ''),
		style: 'text-align: right;',
	});
	if (style === 'default' || style === 'plain') {
		if (show_add_tabletoperator) {
			if (setup.teams[0].players.length > 0) {
				create_match_button(players0, 'vlink tabletoperator_add_button', 'tabletoperator:add', on_add_to_tabletoperators_team_one_button_click, match._id);
			}
		} else {
			create_match_button(players0, 'vlink match_second_call_button', 'match:secondcallteamone', on_second_call_team_one_button_click, match._id);
		}
	}
	
	render_players_el(players0, setup, 0, match, show_player_status);
	uiu.el(tr, 'td', 'match_vs', 'v');
	const players1 = uiu.el(tr, 'td', ((match.team1_won === false) ? 'match_team_won ' : '') + 'match_team2');
	render_players_el(players1, setup, 1, match, show_player_status);
	if (style === 'default' || style === 'plain') {
		if (show_add_tabletoperator) {
			if (setup.teams[1].players.length > 0) { 
				create_match_button(players1, 'vlink tabletoperator_add_button', 'tabletoperator:add', on_add_to_tabletoperators_team_two_button_click, match._id);
			}
		} else { 
			create_match_button(players1, 'vlink match_second_call_button', 'match:secondcallteamtwo', on_second_call_team_two_button_click, match._id);
		}
	}

	
		
	const to_td = uiu.el(tr, 'td');
	if (style === 'default' || style === 'plain') {
		if (setup.umpire_name) {
			uiu.el(to_td, 'div', 'umpire', '');
			uiu.el(to_td, 'span', {}, setup.umpire_name);
			if (style === 'default' || style === 'plain') {
				create_match_button(to_td, 'vlink match_second_call_button', 'match:secondcallumpire', on_second_call_umpire_button_click, match._id);
			}
			if (setup.service_judge_name) {
				uiu.el(to_td, 'div', 'service_judge', '');
				uiu.el(to_td, 'span', {}, setup.service_judge_name);
				if (style === 'default' || style === 'plain') {
					create_match_button(to_td, 'vlink match_second_call_button', 'match:secondcallservicejudge', on_second_call_servicejudge_button_click, match._id);
				}
			}
		}
		if (setup.tabletoperators && setup.tabletoperators.length > 0) {
			uiu.el(to_td, 'div', 'tablet', '');
			uiu.el(to_td, 'span', 'match_no_umpire', setup.tabletoperators[0].name );
			if (setup.tabletoperators.length > 1) {
				uiu.el(to_td, 'span', 'match_no_umpire', ' \u200B/ ');
				uiu.el(to_td, 'span', 'match_no_umpire', setup.tabletoperators[1].name );
			}
			if (style === 'default' || style === 'plain') {
				create_match_button(to_td, 'vlink match_second_call_button', 'match:secondcaltabletoperator', on_second_call_tabletoperator_button_click, match._id);
			}
		}

		if (!setup.umpire_name && (!setup.tabletoperators || setup.tabletoperators.length == 0)) {
			uiu.el(to_td, 'div', 'no_umpire', '');
			uiu.el(to_td, 'span', 'match_no_umpire', ci18n('No umpire'));
		
		}
	} else if(style === 'upcoming' && setup.highlight == 6) {
		uiu.el(to_td, 'span', 'preperation', 'Spiel in Vorbereitung!');
	}
	
		

	const score_td = uiu.el(tr, 'td');
	if (court && (court.match_id !== match._id) && (typeof match.team1_won !== 'boolean') && setup.umpire_name) {
		const ready_text = (style === 'public') ? ci18n('Ready') : ci18n(' Ready to start ');
		uiu.el(score_td, 'span', {}, ready_text);
	}
	const score_span = uiu.el(score_td, 'span', {
		'class': ('match_score' + ((match.setup.now_on_court === true) ? ' match_score_current' : '')),
		'data-match_id': match._id,
	}, calc_score_str(match));

	if(style === 'public' && calc_score_str(match) === '') {
		if (setup.umpire_name) {
			uiu.el(score_span, 'div', 'umpire', '');
			uiu.el(score_span, 'span', {}, setup.umpire_name);
			if (setup.service_judge_name) {
				uiu.el(score_span, 'span', {}, ' \u200B+ ');
				uiu.el(score_span, 'span', {}, setup.service_judge_name);
			}
		} else if (setup.tabletoperators && setup.tabletoperators.length > 0){
			uiu.el(score_span, 'div', 'tablet', '');
			uiu.el(score_span, 'span', 'match_no_umpire', setup.tabletoperators[0].name );
			if (setup.tabletoperators.length > 1) {
				uiu.el(score_span, 'span', 'match_no_umpire', ' \u200B/ ');
				uiu.el(score_span, 'span', 'match_no_umpire', setup.tabletoperators[1].name );
			}
		}
	}

	if ((style === 'default' || style === 'plain') && match.setup.now_on_court != undefined) {
		const shuttle_td = uiu.el(tr, 'td', 'match_shuttle_count');
		uiu.el(shuttle_td, 'span', {
			'class': (
				'match_shuttle_count_display' +
				(match.shuttle_count ? ' match_shuttle_count_display_active' : '')
			),
			'data-match_id': match._id,
		}, match.shuttle_count || '');
	}

	if (style === 'default' || style === 'plain') {
		const timer_td = uiu.el(tr, 'td', {'class': 'match_timer', 'data-match_id': match._id});

		var timer_state = _extract_match_timer_state(match);
		var timer = create_timer(timer_state, timer_td, "#cccccc", "#ff0000");
		if (timer) {
			active_timers.matches[match._id] = timer;
		}
	}

	if (style === 'default' || style === 'plain') {
		const call_td = uiu.el(tr, 'td', 'call_td');

		if (!court) {
			create_match_button(call_td, 'vlink match_preparation_call_button', 'match:preparationcall', on_announce_preparation_matchbutton_click, match._id);

		} else {
			create_match_button(call_td, 'vlink match_manual_call_button', 'match:manualcall', on_announce_match_manually_button_click, match._id);
			create_match_button(call_td, 'vlink match_begin_to_play_button', 'match:begintoplay', on_begin_to_play_button_click, match._id);
		}
	}

	if(!waitForMatchStart) {
		uiu.qsEach('.match_second_call_button[data-match_id=' + JSON.stringify(match._id) + ']', (button_el) => {
			if(match.setup.now_on_court) {
				button_el.style.visibility = 'hidden';
			} else {
				uiu.hide(button_el);
			}
		});
		uiu.qsEach('.match_begin_to_play_button[data-match_id=' + JSON.stringify(match._id) + ']', (button_el) => {
			if(match.setup.now_on_court) {
				button_el.style.visibility = 'hidden';
			} else {
				uiu.hide(button_el);
			}
		});
		uiu.qsEach('.match_manual_call_button[data-match_id=' + JSON.stringify(match._id) + ']', (button_el) => {
			if (match.setup.now_on_court) {
				button_el.style.visibility = 'hidden';
			} else {
				uiu.hide(button_el);
			}
		});
	}
}
function create_match_button(targetEl, cssClass, title, listener, matchId,) {
	const btn = uiu.el(targetEl, 'div', {
		'class': cssClass,
		'title': ci18n(title),
		'data-match_id': matchId,
	});
	btn.addEventListener('click', listener);
}
function update_match_score(m) {
	console.log('In Matchscore update');
	uiu.qsEach('.match_score[data-match_id=' + JSON.stringify(m._id) + ']', function(score_el) {
		uiu.text(score_el, calc_score_str(m));
	});

	uiu.qsEach('.match_timer[data-match_id=' + JSON.stringify(m._id) + ']', (timer_td) => {
		while (timer_td.firstChild) {
			timer_td.removeChild(timer_td.lastChild);
		}

		var timer_state = _extract_match_timer_state(m);
		var timer = create_timer(timer_state, timer_td, "#cccccc", "#ff0000");
		if (timer) {
			active_timers.matches[m._id] = timer;
		}
	});
	
	if(	m.network_score && m.network_score.length > 0 && 
		m.network_score[0].length > 1 && 
		(m.network_score[0][0] > 0 || m.network_score[0][1] > 0) ) {
		uiu.qsEach('.match_second_call_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'hidden';
		});
		uiu.qsEach('.match_begin_to_play_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'hidden';
		});
		uiu.qsEach('.match_manual_call_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'hidden';
		});
	} else {
		uiu.qsEach('.match_second_call_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'visible';
		});
		uiu.qsEach('.match_begin_to_play_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'visible';
		});
		uiu.qsEach('.match_manual_call_button[data-match_id=' + JSON.stringify(m._id) + ']', (button_el) => {
			button_el.style.visibility = 'visible';
		});
	}
	

	uiu.qsEach('.match_shuttle_count_display[data-match_id=' + JSON.stringify(m._id) + ']', function(el) {
		uiu.text(el, m.shuttle_count || '');
		uiu.setClass(el, 'match_shuttle_count_display_active', !!m.shuttle_count);
	});
}

function render_players_el(parentNode, setup, team_id, match, show_player_status) {
	const team = setup.teams[team_id];

	const nat0 = team.players[0] && team.players[0].nationality;
	if (curt.is_nation_competition && nat0) {
		cflags.render_flag_el(parentNode, nat0);
	}

	if (team.players.length > 0) {
		render_player_el(parentNode, team.players[0], match._id, setup.now_on_court, show_player_status);
	} else {

		let dependency = '???';
		if(team_id == 0 && match.setup.links.from1_link) {
			dependency = match.setup.links.from1_link;
		}
		else if(team_id == 1 && match.setup.links.from2_link) {
			dependency = match.setup.links.from2_link;
		}
		else {
			let match_before = curt.matches.filter(m => {

				return (m.setup.event_name === match.setup.event_name &&
						(	
							m.btp_match_ids[0].planning == match.setup.links.from1 ||
							m.btp_match_ids[0].planning == match.setup.links.from2
						));
			});

			let resolved_match = [];

			match_before.forEach(t => {
				if(t.setup.is_match){
					resolved_match.push(t);
				}
				else {
					const result = curt.matches.find(m => {
						return (m.setup.event_name === t.setup.event_name &&
								m.setup.is_match &&
								m.setup.links &&
								t.setup.links &&
								(	
									m.setup.links.from1 == t.setup.links.from1 ||
									m.setup.links.from2 == t.setup.links.from2 
								));
					});
					resolved_match.push(result);
				}
			});

			const index = Math.min(resolved_match.length - 1, team_id);
			
			if(resolved_match.length >= index && resolved_match[index] && resolved_match[index].setup && resolved_match[index].setup.links) {
				
				if(resolved_match[index].setup.links.winner_to && resolved_match[index].setup.links.winner_to == match.btp_match_ids[0].planning) {
					dependency = ci18n('Winner') + " #" + resolved_match[index].setup.match_num + " - " + resolved_match[index].setup.scheduled_date + " " + resolved_match[index].setup.scheduled_time_str;
				}
				else {
					dependency = ci18n('Loser') + " #" + resolved_match[index].setup.match_num + " - " + resolved_match[index].setup.scheduled_date + " " + resolved_match[index].setup.scheduled_time_str;
				}
			}
		}
		
		uiu.el(parentNode, 'span', {}, dependency);

	}

	if (team.players.length > 1) {
		uiu.el(parentNode, 'span', {}, ' / ');

		const nat1 = team.players[1] && team.players[1].nationality;
		const p1_el = uiu.el(parentNode, 'span', {
			'style': 'white-space: pre',
		});
		if (curt.is_nation_competition && nat1 && (nat1 !== nat0)) {
			cflags.render_flag_el(p1_el, nat1);
		}

		render_player_el(parentNode, team.players[1], match._id, setup.now_on_court, show_player_status);	
	}
}

function render_player_el(parentNode, player, match_id, now_on_court, show_player_status) {
	let player_status = get_player_status(player, now_on_court, show_player_status);
	let player_element = uiu.el(parentNode, 'span', {
		'class' : 'player ' + player_status,
		'data-btp_id' : player.btp_id, 
		'data-match_id': match_id,
	}, player.name.replace(' ', '\xa0'));
	if (player.now_playing_on_court && player_status != "now_on_court") {
		let parts = player.now_playing_on_court.split("_");
		let court_number = parts[parts.length - 1];
		uiu.el(player_element, 'div', 'court', court_number);
	}

	if(player.now_tablet_on_court) {
		let parts = player.now_tablet_on_court.split("_");
		let court_number = parts[parts.length - 1];
		uiu.el(player_element, 'div', 'tablet_inline', court_number);
	}

	if(show_player_status && player_status != "now_on_court") {
		var timer_state = _extract_player_timer_state(player);
		var timer = create_timer(timer_state, player_element, "#ffffff", "#ffffff");
	}
}

function get_player_status(player, now_on_court, show_player_status) {
	let player_status = "";
	if (!show_player_status || now_on_court) {
		player_status = "now_on_court";
	} else if (player.now_playing_on_court) {
		player_status = "now_playing";
	} else if (player.checked_in) {
		player_status = "checked_in";
	} else {
		player_status = "not_checked_in";
	}

	return player_status;
}

function update_players(m) {
	if(m.setup.teams) {
		m.setup.teams.forEach((team) => {
			if(team.players) {
				team.players.forEach((player) => {
					update_player(m._id, player, m.setup.now_on_court, m.btp_winner === undefined);
				});
			}
		});
	}

}

function update_player(match_id, player, now_on_court, show_player_status) {
	uiu.qsEach('.player[data-match_id=' + JSON.stringify(match_id) + '][data-btp_id="' + JSON.stringify(player.btp_id) + '"]' , function(player_el) {
		let player_status = get_player_status(player, now_on_court, show_player_status);

		player_el.classList.remove("now_on_court", "now_playing", "checked_in", "not_checked_in");
		player_el.classList.add(player_status);

		//The only Child should be the now_playing_on_court icon or the now_tablet_on_court icon
		while (player_el.firstElementChild) {
			player_el.removeChild(player_el.lastElementChild);
		}

		if (player.now_playing_on_court && player_status != "now_on_court") {
			let parts = player.now_playing_on_court.split("_");
			let court_number = parts[parts.length - 1];
			uiu.el(player_el, 'div', 'court', court_number);
		}
	
		if(player.now_tablet_on_court) {
			let parts = player.now_tablet_on_court.split("_");
			let court_number = parts[parts.length - 1];
			uiu.el(player_el, 'div', 'tablet_inline', court_number);
		}

		if(show_player_status && player_status != "now_on_court") {
			var timer_state = _extract_player_timer_state(player);
			var timer = create_timer(timer_state, player_el, "#ffffff", "#ffffff");
		}

	});
}

	function remove_match_from_gui(m, old_section) {
		switch (old_section) {
			case 'finished':
			case 'unassigned':
				uiu.qsEach('.match[data-match_id=' + JSON.stringify(m._id) + ']', (match_row_el) => {
					match_row_el.remove();
				});
				break;
			default:
				uiu.qsEach('.court_row[data-court_id=' + JSON.stringify(m.setup.court_id) + ']', (match_row_el) => {
					while (match_row_el.childElementCount > 1) {
						match_row_el.removeChild(match_row_el.lastChild);
					}
				});
				break;
		}
	}
function update_match(m, old_section, new_section) {	
	if(old_section != new_section) {
		remove_match_from_gui(m, old_section);
		switch (new_section) {
			case 'finished':
				uiu.qsEach('.finished_container', (finished_container) => {
					let tbody = finished_container.querySelector('.match_table > tbody');
					uiu.el(tbody, 'tr', {'class' : 'match highlight_' + m.setup.highlight , 'data-match_id': m._id});
				});
			case 'unassigned':
				uiu.qsEach('.unassigned_container', (unassigned_container) => {
					let tbody = unassigned_container.querySelector('.match_table > tbody');
					uiu.el(tbody, 'tr', {'class' : 'match highlight_' + m.setup.highlight , 'data-match_id': m._id});
				});
				break;
			default:
				break;
		}
	} else {
		switch (old_section) {
			case 'finished':
			case 'unassigned':
				uiu.qsEach('.match[data-match_id=' + JSON.stringify(m._id) + ']', (match_row_el) => {
					match_row_el.innerHTML = '';
				});
				break;
			default:
				uiu.qsEach('.court_row[data-court_id=' + JSON.stringify(m.setup.court_id) + ']', (match_row_el) => {
					while(match_row_el.childElementCount > 1){
						match_row_el.removeChild(match_row_el.lastChild);
					}
				});
				break;
		}
	}

	switch (new_section) {
		case 'finished':
			uiu.qsEach('.finished_container > table > tbody > .match[data-match_id=' + JSON.stringify(m._id) + ']', (match_row_el) => {	
				render_match_row(match_row_el, m, null, 'default', false, true);
			});
			break;
		case 'unassigned':
			uiu.qsEach( '.unassigned_container > table > tbody > .match[data-match_id=' + JSON.stringify(m._id) + ']', (match_row_el) => {	
				match_row_el.setAttribute('class', 'match highlight_' + (m.setup.highlight ? m.setup.highlight : 0));
				render_match_row(match_row_el, m, null, 'default', true, true);
			});
			break;
		default:
			uiu.qsEach('.court_row[data-court_id=' + JSON.stringify(m.setup.court_id) + ']', (match_row_el) => {
				const closest = match_row_el.closest('.main_upcoming');
				if(Boolean(closest)) {
					render_match_row(match_row_el, m, null, 'public');
				} else {
					render_match_row(match_row_el, m, null, 'plain', false, false);
				}
			});
			break;
	}
}

var active_timers = {'matches': {}, 'players' : {}};

function create_timer(timer_state, parent, default_color, exigent_color) {
	
	if (!timer_state) {
		return;
	}

	var tv = timer.calc(timer_state);
		
	if(!tv || !tv.visible){
		return;
	}


	var bgColor = timer_state.bgColor;
	let el = uiu.el(parent, 'div', { class: 'timer', style: ('background-color:' + bgColor +'; color:' + default_color +';')}, tv.str);
	
	var tobj = {}

	var update = function() {
		var tv = timer.calc(timer_state);
		var visible = tv.visible;

		uiu.text (el, tv.str);
		if(tv.exigent && exigent_color){
			el.style.color = exigent_color;
		}

		if (visible && tv.next) {
			tobj.timeout = setTimeout(update, tv.next);
			el.style.display = "inline-block";
		} else {
			tobj.timeout = null;
			el.style.display = "none";
		}
	};

	update();

	return tobj;
}

function _extract_player_timer_state(player) {
	let s = {};
	s.settings = {};
	s.settings.negative_timers = false;
	s.lang = "de";
	s.timer = {};
	s.timer.duration = curt.btp_settings.pause_duration_ms;
	s.timer.start = (player.last_time_on_court_ts ? player.last_time_on_court_ts : false);
	s.timer.upwards = false;
	s.timer.exigent = false;

	if (player.tablet_break_active) {
		s.bgColor = "#0000ff";
	} else {
		s.bgColor = "#ff0000";
	}
	
	return s;
}

function _extract_match_timer_state(match) {
	var presses = match.presses;

	let s = {};
	s.settings = {};
	s.settings.negative_timers = true;
	s.lang = "de"; //TODO: Use the language of the BTS Settings

	var rs = calc.remote_state(s, match.setup, presses);
	return rs;
}

function prepare_render(t) {
	t.matches.sort(function(m1, m2) {
		const time_str1 = m1.setup.scheduled_time_str;
		const time_str2 = m2.setup.scheduled_time_str;

		if (time_str1 && !time_str2) {
			return -1;
		} else if (time_str2 && !time_str1) {
			return 1;
		}

		const cmp1 = cbts_utils.cmp(m1.setup.scheduled_date, m2.setup.scheduled_date);
		if (cmp1 != 0) return cmp1;

		if (time_str1 === '00:00' && time_str2 !== '00:00') {
			return 1;
		} else if (time_str2 === '00:00' && time_str1 !== '00:00') {
			return -1;
		}

		const cmp2 = cbts_utils.cmp(time_str1, time_str2);
		if (cmp2 != 0) return cmp2;

		if ((m1.match_order !== undefined) && (m2.match_order !== undefined)) {
			const cmp_result = cbts_utils.cmp(m1.match_order, m2.match_order);
			if (cmp_result != 0) return cmp_result;
		}

		return cbts_utils.cmp(m1.setup.match_num, m2.setup.match_num);
	});

	t.courts_by_id = {};
	for (const c of t.courts) {
		t.courts_by_id[c._id] = c;
	}
}

function on_edit_button_click(e) {
	const btn = e.target;
	const match_id = btn.getAttribute('data-match_id');
	ui_edit(match_id);
}

function on_scoresheet_button_click(e) {
	const btn = e.target;
	const match_id = btn.getAttribute('data-match_id');
	ui_scoresheet(match_id);
}
function on_announce_preparation_matchbutton_click(e) {
	const match = fetchMatchFromEvent(e);
	if (match != null) {
		match.setup.highlight = 6; //its magenta

		send({
			type: 'match_preparation_call',
			id: match._id,
			tournament_key: match.tournament_key,
			setup: match.setup,
		}, function (err) {
			if (err) {
				return cerror.net(err);
			}
		});
	}
}
function on_add_to_tabletoperators_team_one_button_click(e) {
	const match = fetchMatchFromEvent(e);
	ctabletoperator.add_to_tabletoperator(match, 0)
}
function on_add_to_tabletoperators_team_two_button_click(e) {
	const match = fetchMatchFromEvent(e);
	ctabletoperator.add_to_tabletoperator(match,1)
}


function on_second_call_team_one_button_click(e) {
	const match = fetchMatchFromEvent(e);
	if (match != null) {
		send({
			type: 'second_call_team_one',
			tournament_key: curt.key,
			setup: match.setup,
		}, err => {
			if (err) {
				return cerror.net(err);
			}
		});
	}
}
function on_second_call_team_two_button_click(e) {
	const match = fetchMatchFromEvent(e);
	if (match != null) {
		send({
			type: 'second_call_team_two',
			tournament_key: curt.key,
			setup: match.setup,
		}, err => {
			if (err) {
				return cerror.net(err);
			}
		});
	}
}
	function on_second_call_tabletoperator_button_click(e) {
		const match = fetchMatchFromEvent(e);
		if (match != null) {
			send({
				type: 'second_call_tabletoperator',
				tournament_key: curt.key,
				setup: match.setup,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		}
	}
	function on_second_call_umpire_button_click(e) {
		const match = fetchMatchFromEvent(e);
		if (match != null) {
			send({
				type: 'second_call_umpire',
				tournament_key: curt.key,
				setup: match.setup,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		}
	}

	function on_second_call_servicejudge_button_click(e) {
		const match = fetchMatchFromEvent(e);
		if (match != null) {
			send({
				type: 'second_call_servicejudge',
				tournament_key: curt.key,
				setup: match.setup,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		}
	}
	

	function on_begin_to_play_button_click(e) {
		const match = fetchMatchFromEvent(e);
		if (match != null) {
			send({
				type: 'begin_to_play_call',
				tournament_key: curt.key,
				setup: match.setup,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		}
	}

	function on_announce_match_manually_button_click(e) {
		const match = fetchMatchFromEvent(e);
		if (match != null) {
			send({
				type: 'announce_match_manually',
				tournament_key: curt.key,
				match: match,
			}, err => {
				if (err) {
					return cerror.net(err);
				}
			});
		}
	}
function fetchMatchFromEvent(e) {
	const btn = e.target;
	const match_id = btn.getAttribute('data-match_id');
	const match = utils.find(curt.matches, m => m._id === match_id);
	if (!match) {
		cerror.silent('Match ' + match_id + ' konnte nicht gefunden werden');
		return null;
	} else {
		return match;
	}
}
function _nation_team_name(nat0, nat1) {
	if (nat1 && nat0 && (nat0 != nat1)) {
		return countries.lookup(nat0) + ' / ' + countries.lookup(nat1);
	}
	if (nat0) {
		return countries.lookup(nat0);
	}
	return '';
}

function _make_setup(d) {
	const is_doubles = !! d.team0player1lastname;
	const teams = [_make_team(d, 0), _make_team(d, 1)];
	if (d.team0name) {
		teams[0].name = d.team0name;
	} else if (curt.is_nation_competition) {
		teams[0].name = _nation_team_name(d.team0player0nationality, d.team0player1nationality);
	}
	if (d.team1name) {
		teams[1].name = d.team1name;
	} else if (curt.is_nation_competition) {
		teams[1].name = _nation_team_name(d.team1player0nationality, d.team1player1nationality);
	}
	const player_count = is_doubles ? 2 : 1;
	const incomplete = !teams.every(team => (team.players.length === player_count));

	let override_colors = undefined;
	if (d.override_colors_checkbox) {
		override_colors = {};
		for (let team_id = 0;team_id < 2;team_id++) {
			const team_override_colors = {};
			for (const key of OVERRIDE_COLORS_KEYS) {
				override_colors[key + team_id] = d[`override_colors_${team_id}_${key}`];
			}
		}
	}

	return {
		court_id: d.court_id,
		now_on_court: !! d.now_on_court,
		match_num: parseInt(d.match_num),
		match_name: d.match_name,
		scheduled_time_str: d.scheduled_time_str,
		event_name: d.event_name,
		umpire_name: d.umpire_name,
		service_judge_name: d.service_judge_name,
		override_colors,
		teams,
		is_doubles,
		incomplete,
	};
}

function _cancel_ui_edit() {
	const dlg = document.querySelector('.match_edit_dialog');
	if (!dlg) {
		return; // Already cancelled
	}
	cbts_utils.esc_stack_pop();
	uiu.remove(dlg);
	ctournament.ui_show();
}

function _delete_match_btn_click(e) {
	const match_id = e.target.getAttribute('data-match_id');
	if (! confirm(ci18n('match:delete:really', {match_id}))) return;

	send({
		type: 'match_delete',
		id: match_id,
		tournament_key: curt.key,
	}, function (err) {
		if (err) {
			return cerror.net(err);
		}
		_cancel_ui_edit();
	});
}

function ui_edit(match_id) {
	const match = utils.find(curt.matches, m => m._id === match_id);
	if (!match) {
		cerror.silent('Match ' + match_id + ' konnte nicht gefunden werden');
		return;
	}
	crouting.set('t/' + curt.key + '/m/' + match_id + '/edit', {}, _cancel_ui_edit);

	cbts_utils.esc_stack_push(_cancel_ui_edit);

	const body = uiu.qs('body');
	const dialog_bg = uiu.el(body, 'div', 'dialog_bg match_edit_dialog', {
		'data-match_id': match_id,
	});
	const dialog = uiu.el(dialog_bg, 'div', 'dialog');
	
	uiu.el(dialog, 'h3', {}, ci18n('Edit match'));

	const form = uiu.el(dialog, 'form');
	uiu.el(form, 'input', {
		type: 'hidden',
		name: 'match_id',
		value: match_id,
	});
	render_edit(form, match);

	const buttons = uiu.el(form, 'div', {
		style: 'margin-top: 2em;',
	});
	if (curt.btp_enabled) {
		const sendbtp_label = uiu.el(buttons, 'label', {
			style: 'margin: 0 1em 0 0;',
		});

		uiu.el(sendbtp_label, 'input', {
			type: 'checkbox',
			name: 'btp_update',
		});
		sendbtp_label.appendChild(document.createTextNode('auch in BTP ändern'));
	}

	const btn = uiu.el(buttons, 'button', {
		'class': 'match_save_button',
		role: 'submit',
	}, ci18n('Change'));

	form_utils.onsubmit(form, function(d) {
		const setup = _make_setup(d);
		btn.setAttribute('disabled', 'disabled');
		send({
			type: 'match_edit',
			id: d.match_id,
			setup,
			tournament_key: curt.key,
			btp_update: (curt.btp_enabled && !! d.btp_update),
		}, function match_edit_callback(err) {
			btn.removeAttribute('disabled');
			if (err) {
				return cerror.net(err);
			}
			_cancel_ui_edit();
		});
	});

	const delete_btn = uiu.el(buttons, 'button', {
		style: 'margin-left: 3em; margin-right: 1em;',
		'data-match_id': match_id,
	}, ci18n('match:edit:delete'));
	delete_btn.addEventListener('click', _delete_match_btn_click);
	const cancel_btn = uiu.el(buttons, 'span', 'match_cancel_link vlink', ci18n('Cancel'));
	cancel_btn.addEventListener('click', _cancel_ui_edit);
}
crouting.register(/t\/([a-z0-9]+)\/m\/([-a-zA-Z0-9_ ]+)\/edit$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_edit(m[2]);
	});
}, change.default_handler(() => {
	const dlg = uiu.qs('.match_edit_dialog');
	const match_id = dlg.getAttribute('data-match_id');
	ui_edit(match_id);
}));


function _cancel_ui_scoresheet() {
	const dlg = document.querySelector('.match_scoresheet_dialog');
	if (!dlg) {
		return; // Already cancelled
	}
	cbts_utils.esc_stack_pop();
	uiu.remove(dlg);
	uiu.show_qs('.main');
	ctournament.ui_show();
}

function ui_scoresheet(match_id) {
	const match = utils.find(curt.matches, m => m._id === match_id);
	if (!match) {
		cerror.silent('Match ' + match_id + ' konnte nicht gefunden werden');
		return;
	}
	crouting.set('t/' + curt.key + '/m/' + match_id + '/scoresheet', {}, _cancel_ui_scoresheet);

	cbts_utils.esc_stack_push(_cancel_ui_scoresheet);

	uiu.hide_qs('.main');
	const body = uiu.qs('body');
	const dialog = uiu.el(body, 'div', {
		'class': 'match_scoresheet_dialog',
		'data-match_id': match_id,
	});

	const container = uiu.el(dialog, 'div');
	const lang = ci18n.get_lang();
	const pseudo_state = {
		settings: {
			shuttle_counter: true,
		},
		lang,
	};
	i18n.update_state(pseudo_state, lang);
	i18n.register_lang(i18n_de);
	i18n.register_lang(i18n_en);
	const setup = utils.deep_copy(match.setup);
	setup.tournament_name = curt.name;
	const s = calc.remote_state(pseudo_state, setup, match.presses);
	s.ui = {};

	printing.set_orientation('landscape');
	scoresheet.load_sheet(scoresheet.sheet_name(s.setup), function(xml) {
		var svg = scoresheet.make_sheet_node(s, xml);
		svg.setAttribute('class', 'scoresheet single_scoresheet');
		// Usually we'd call importNode here to import the document here, but IE/Edge then ignores the styles
		container.appendChild(svg);
		scoresheet.sheet_render(s, svg);
	}, '/bupdev/');

	const scoresheet_buttons = uiu.el(dialog, 'div', 'match_scoresheet_buttons');

	const cancel_btn = uiu.el(scoresheet_buttons, 'div', 'vlink', ci18n('Back'));
	cancel_btn.addEventListener('click', _cancel_ui_scoresheet);	

	const pdf_btn = uiu.el(scoresheet_buttons, 'button', {}, ci18n('PDF'));
	pdf_btn.addEventListener('click', function() {
		const svg_nodes = document.querySelectorAll('.single_scoresheet');
		scoresheet.save_pdf(s, svg_nodes);
	});

	const print_btn = uiu.el(scoresheet_buttons, 'button', {}, ci18n('Print'));
	print_btn.addEventListener('click', function() {
		window.print();
	});
}
crouting.register(/t\/([a-z0-9]+)\/m\/([-a-zA-Z0-9_ ]+)\/scoresheet$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_scoresheet(m[2]);
	});
}, change.default_handler(() => {
	const dlg = uiu.qs('.match_scoresheet_dialog');
	const match_id = dlg.getAttribute('data-match_id');
	ui_scoresheet(match_id);
}));

function render_match_table(container, matches, show_player_status, show_add_tabletoperator) {
	if(!show_player_status)
	{
		show_player_status = false;
	}
	
	const table = uiu.el(container, 'table', 'match_table');
	render_match_table_header(table, true);
	const tbody = uiu.el(table, 'tbody');

	for (const m of matches) {
		if(m.setup.is_match) {
			const tr = uiu.el(tbody, 'tr', {'class' : 'match highlight_' + m.setup.highlight , 'data-match_id': m._id});
			render_match_row(tr, m, null, 'default', show_player_status, show_add_tabletoperator);
		}
	}
}

function render_unassigned(container) {
	uiu.empty(container);
	uiu.el(container, 'h3', {}, ci18n('Unassigned Matches'));

	const unassigned_matches = curt.matches.filter(m => calc_section(m) === 'unassigned');
	render_match_table(container, unassigned_matches, true, true);
}

function render_upcoming_matches(container) {
	const UPCOMING_MATCH_COUNT = 10;
	uiu.empty(container);

	uiu.el(container, 'h3', {
		style: 'text-align: center;',
	}, ci18n('Next Matches'));

	const upcoming_table = uiu.el(container, 'table', 'upcoming_table');
	const unassigned_matches = curt.matches.filter(m => calc_section(m) === 'unassigned');
	for (const match of unassigned_matches.slice(0, UPCOMING_MATCH_COUNT)) {
		const tr = uiu.el(upcoming_table, 'tr', {
			style: 'padding-top: 1em;',
		});
		render_match_row(tr, match, null, 'upcoming');
	}

	const qr = uiu.el(container, 'img', {
		type: 'img',
		id: 'main_q_code_upcoming',
		src: curt.mainQrCode,
		style: 'position: absolute; right: 20px; bottom: 20px;'
	});
}

function render_finished(container) {
	uiu.empty(container);
	uiu.el(container, 'h3', {}, ci18n('Finished Matches'));

	const matches = curt.matches.filter(m => calc_section(m) === 'finished').sort((a, b) => {return b.end_ts - a.end_ts});
	render_match_table(container, matches, false, true);
}

function render_courts(container, style) {
	style = style || 'plain';
	uiu.empty(container);
	const table = uiu.el(container, 'table', 'match_table');
	const tbody = uiu.el(table, 'tbody');
	for (const c of curt.courts) {
		const expected_section = 'court_' + c._id;
		const court_matches = curt.matches.filter(m => calc_section(m) === expected_section);

		const tr = uiu.el(tbody, 'tr', {class:"court_row", "data-court_id":c._id} );
		const rowspan = Math.max(1, court_matches.length);
		uiu.el(tr, 'th', {
			'class': 'court_num',
			rowspan,
			title: c._id,
		}, c.num);

		if (court_matches.length === 0) {
			uiu.el(tr, 'td', {colspan: 11}, '');
		} else {
			let i = 0;
			for (const cm of court_matches) {
				const my_tr = (i > 0) ? uiu.el(tbody, 'tr') : tr;
				render_match_row(my_tr, cm, c, style);
				i++;
			}
		}
	}
}

function _make_player(d, team_idx, player_idx) {
	const firstname = d['team' + team_idx + 'player' + player_idx + 'firstname'];
	const lastname = d['team' + team_idx + 'player' + player_idx + 'lastname'];
	const nationality = d['team' + team_idx + 'player' + player_idx + 'nationality'];

	if (!lastname) return null;

	return {
		firstname,
		lastname,
		nationality,
		name: firstname + ' ' + lastname,
	};
}

function _make_team(d, team_idx) {
	const players = [];
	const p1 = _make_player(d, team_idx, 0);
	if (p1) {
		players.push(p1);
	}
	const p2 = _make_player(d, team_idx, 1);
	if (p2) {
		players.push(p2);
	}
	return {players};
}

function _extract_players(setup) {
	const res = {
		team0player0: {name: '', nationality: '', firstname: '', lastname: ''},
		team0player1: {name: '', nationality: '', firstname: '', lastname: ''},
		team1player0: {name: '', nationality: '', firstname: '', lastname: ''},
		team1player1: {name: '', nationality: '', firstname: '', lastname: ''},
	};
	const teams = setup.teams || [];
	teams.forEach(function(team, team_idx) {
		if (!team) return;
		if (!team.players) return;

		team.players.forEach(function(player, player_idx) {
			if (!player) return;
			utils.annotate_lastname(player);

			res['team' + team_idx + 'player' + player_idx] = player;
		});
	});
	return res;
}

function render_edit(form, match) {
	const setup = match.setup || {};
	const player_names = _extract_players(setup);

	const edit_match_container = uiu.el(form, 'div', 'edit_match_container');
	const metadata = uiu.el(edit_match_container, 'div');
	uiu.el(metadata, 'span', 'match_label', ci18n('Number:'));
	uiu.el(metadata, 'input', {
		type: 'text',
		name: 'match_num',
		pattern: '^[0-9]+$',
		size: 3,
		required: 'required',
		value: setup.match_num || '',
		tabindex: 1,
	});

	uiu.el(metadata, 'span', 'match_label', 'Event:');
	uiu.el(metadata, 'input', {
		type: 'text',
		name: 'event_name',
		placeholder: ci18n('e.g. MX O55'),
		size: 10,
		value: setup.event_name || '',
	});

	uiu.el(metadata, 'span', 'match_label', 'Match:');
	uiu.el(metadata, 'input', {
		type: 'text',
		name: 'match_name',
		placeholder: ci18n('e.g. semi-finals'),
		size: 10,
		value: setup.match_name || '',
	});

	const start = uiu.el(edit_match_container, 'div');
	uiu.el(start, 'span', 'match_label', ci18n('match:edit:scheduled_date'));
	uiu.el(start, 'input', {
		type: 'text',
		name: 'scheduled_date',
		pattern: '^[0-9]{4,}-(?:0[0-9]|10|11|12)-(?:[012][0-9]|30|31)$',
		title: 'Date in ISO8601 format, e.g. 2020-05-30',
		size: 6,
		value: setup.scheduled_date || '',
	});

	uiu.el(start, 'span', 'match_label', ci18n('Time:'));
	uiu.el(start, 'input', {
		type: 'text',
		name: 'scheduled_time_str',
		pattern: '^[0-9]{2}:[0-9]{2}$',
		title: 'Time in 24 hour format, e.g. 09:23',
		size: 3,
		value: setup.scheduled_time_str || '',
	});

	const player_table = uiu.el(edit_match_container, 'table');
	const player_tbody = uiu.el(player_table, 'tbody');
	const tr0 = uiu.el(player_tbody, 'tr');
	const tr1 = uiu.el(player_tbody, 'tr');
	const t0p0td = uiu.el(tr0, 'td');
	uiu.el(t0p0td, 'input', {
		maxlength: 3,
		size: 3,
		name: 'team0player0nationality',
		value: player_names.team0player0.nationality || '',
	});
	uiu.el(t0p0td, 'input', {
		type: 'text',
		style: 'width: 5em;',
		name: 'team0player0firstname',
		required: 'required',
		value: player_names.team0player0.firstname,
		tabindex: 20,
	});
	uiu.el(t0p0td, 'input', {
		type: 'text',
		style: 'width: 6em;',
		name: 'team0player0lastname',
		required: 'required',
		value: player_names.team0player0.lastname,
		tabindex: 20,
	});
	const t0p1td = uiu.el(tr1, 'td');
	uiu.el(t0p1td, 'input', {
		maxlength: 3,
		size: 3,
		name: 'team0player1nationality',
		value: player_names.team0player1.nationality || '',
	});
	uiu.el(t0p1td, 'input', {
		type: 'text',
		style: 'width: 5em;',
		name: 'team0player1firstname',
		value: player_names.team0player1.firstname,
		tabindex: 21,
	});
	uiu.el(t0p1td, 'input', {
		type: 'text',
		name: 'team0player1lastname',
		style: 'width: 6em;',
		placeholder: ci18n('(Singles)'),
		value: player_names.team0player1.lastname,
		tabindex: 21,
	});

	uiu.el(tr0, 'td', {
		'class': 'match_label',
		rowspan: 2,
	}, 'vs');

	const t1p0td = uiu.el(tr0, 'td');
	uiu.el(t1p0td, 'input', {
		maxlength: 3,
		size: 3,
		name: 'team1player0nationality',
		value: player_names.team1player0.nationality  || '',
	});
	uiu.el(t1p0td, 'input', {
		type: 'text',
		style: 'width: 5em;',
		name: 'team1player0firstname',
		required: 'required',
		value: player_names.team1player0.firstname,
		tabindex: 30,
	});
	uiu.el(t1p0td, 'input', {
		type: 'text',
		style: 'width: 6em;',
		name: 'team1player0lastname',
		required: 'required',
		value: player_names.team1player0.lastname,
		tabindex: 30,
	});
	const t1p1td = uiu.el(tr1, 'td');
	uiu.el(t1p1td, 'input', {
		maxlength: 3,
		size: 3,
		name: 'team1player1nationality',
		value: player_names.team1player1.nationality || '',
	});
	uiu.el(t1p1td, 'input', {
		type: 'text',
		style: 'width: 5em;',
		name: 'team1player1firstname',
		value: player_names.team1player1.firstname,
		tabindex: 31,
	});
	uiu.el(t1p1td, 'input', {
		type: 'text',
		name: 'team1player1lastname',
		style: 'width: 6em;',
		placeholder: ci18n('(Singles)'),
		value: player_names.team1player1.lastname,
		tabindex: 31,
	});

	if (curt.is_team) {
		const team_tr = uiu.el(player_tbody, 'tr');

		uiu.el(team_tr, 'td', {
			colspan: 4,
		}, 'Teams:');
		const td_team0 = uiu.el(team_tr, 'td');
		uiu.el(td_team0, 'input', {
			type: 'text',
			name: 'team0name',
			required: 'required',
			value: (setup.teams && setup.teams[0] && setup.teams[0].name) ? setup.teams[0].name : '',
			tabindex: 22,
		});

		uiu.el(team_tr, 'td');
		const td_team1 = uiu.el(team_tr, 'td');
		uiu.el(td_team1, 'input', {
			type: 'text',
			name: 'team1name',
			required: 'required',
			value: (setup.teams && setup.teams[1] && setup.teams[1].name) ? setup.teams[1].name : '',
			tabindex: 32,
		});
	}

	const assigned = uiu.el(edit_match_container, 'div', {
		style: 'margin-top: 1em',
	});
	uiu.el(assigned, 'span', 'match_label', 'Court:');
	const court_select = uiu.el(assigned, 'select', {
		'class': 'court_selector',
		name: 'court_id',
		size: 1,
	});
	uiu.el(court_select, 'option', {
		value: '',
	}, ci18n('Not assigned'));
	if (curt) {
		for (const court of curt.courts) {
			const attrs = {
				value: court._id,
			};
			if (court._id === setup.court_id) {
				attrs.selected = 'selected';
			}
			uiu.el(court_select, 'option', attrs, court.num);
		}
	}

	// Now on court
	const now_on_court_label = uiu.el(assigned, 'label');
	const now_on_court_attrs = {
		type: 'checkbox',
		name: 'now_on_court',
	};
	if (setup.now_on_court) {
		now_on_court_attrs.checked = 'checked';
	}
	uiu.el(now_on_court_label, 'input', now_on_court_attrs);
	uiu.el(now_on_court_label, 'span', 'match_label', ci18n('match:edit:now_on_court'));

	// TO stuff
	const tos_container = uiu.el(edit_match_container, 'div', {
		style: 'margin-top: 0.5em',
	});

	// Umpire
	uiu.el(tos_container, 'span', 'match_label', ci18n('Umpire:'));
	const umpire_select = uiu.el(tos_container, 'select', {
		name: 'umpire_name',
		size: 1,
	});
	render_umpire_options(umpire_select, setup.umpire_name);

	// Service judge
	uiu.el(tos_container, 'span', {
		'class': 'match_label',
		'style': 'margin-left: 1em;',
	}, ci18n('Service judge:'));
	const service_judge_select = uiu.el(tos_container, 'select', {
		name: 'service_judge_name',
		size: 1,
	});
	render_umpire_options(service_judge_select, setup.service_judge_name, true);

	render_override_colors(edit_match_container, setup);
}

function render_override_colors(outer_container, setup) {
	let colors = setup.override_colors;
	const container = uiu.el(outer_container, 'div', {
		style: 'margin-top: 1em; margin-bottom: 1em;',
	});

	const checkbox_label = uiu.el(container, 'label');
	const cb_attrs = {
		type: 'checkbox',
		name: 'override_colors_checkbox',
	};
	if (colors) {
		cb_attrs.checked = 'checked';
	}
	const checkbox = uiu.el(checkbox_label, 'input', cb_attrs);
	checkbox.addEventListener('change', update_override_color_checkbox);
	uiu.el(checkbox_label, 'span', {
		'class': 'match_label',
		'style': 'user-select: none;',
	}, ci18n('match:override_colors'));

	if (! colors) {
		const {default_settings} = settings;
		colors = {
			'0': default_settings.d_c0,
			'bg0': default_settings.c_bg0,
			'1': default_settings.d_c1,
			'bg1': default_settings.c_bg1,
		};
	}

	const color_container = uiu.el(container, 'div', {style: 'display: inline-block; padding-left: 1em;'});
	for (let team_id = 0; team_id < 2;team_id++) {
		if (team_id === 1) {
			uiu.el(color_container, 'div', {style: 'display: inline-block; width: 1.5em'});
		}

		for (const key of OVERRIDE_COLORS_KEYS) {
			const options = {
				type: 'color',
				value: colors[key + team_id],
				name: `override_colors_${team_id}_${key}`,
				title: `${key}${team_id}`,
			};
			if (!setup.override_colors) {
				options.disabled = 'disabled';
			}

			uiu.el(color_container, 'input', options);
		}
	}
}

function update_override_color_checkbox(e) {
	const checkbox = e.target;
	for (const el of checkbox.parentNode.parentNode.querySelectorAll('input[type="color"]')) {
		el.disabled = !checkbox.checked;
	}
}

function render_umpire_options(select, curval, is_service_judge) {
	uiu.empty(select);
	uiu.el(select, 'option', {
		value: '',
		style: 'font-style: italic;',
	}, is_service_judge ? ci18n('No service judge') : ci18n('No umpire'));
	for (const u of curt.umpires) {
		const attrs = {
			value: u.name,
		};
		if (u.name === curval) {
			attrs.selected = 'selected';
		}
		uiu.el(select, 'option', attrs, u.name);
	}
}

function render_create(container) {
	/*
	uiu.empty(container);
	const form = uiu.el(container, 'form');

	render_edit(form, {});

	const btn_container = uiu.el(form, 'div', {rowspan: 2});
	const btn = uiu.el(btn_container, 'button', {
		'class': 'match_save_button',
		role: 'submit',
	}, ci18n('Add Match'));

	form_utils.onsubmit(form, function(d) {
		const setup = _make_setup(d);
		btn.setAttribute('disabled', 'disabled');
		send({
			type: 'match_add',
			setup,
			tournament_key: curt.key,
		}, function(err) {
			btn.removeAttribute('disabled');
			if (err) {
				return cerror.net(err);
			}
			uiu.empty(container);
			render_create(container);
		});
	});
	*/
}

return {
	calc_section,
	prepare_render,
	render_create,
	render_finished,
	render_unassigned,
	render_courts,
	render_umpire_options,
	render_upcoming_matches,
	update_match_score,
	update_match,
	remove_match_from_gui,
	update_players,
};

})();


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cbts_utils = require('./cbts_utils');
	var cerror = require('../bup/js/cerror');
	var cflags = require('./cflags');
	var change = require('./change');
	var ci18n = require('./ci18n');
	var countries = require('./countries');
	var crouting = require('./crouting');
	var ctournament = require('./ctournament');
	var ctabletoperator = require('./ctabletoperator');
	var form_utils = require('../bup/js/form_utils');
	var uiu = require('../bup/js/uiu');
	var utils = require('../bup/js/utils');
	var scoresheet = require('../bup/js/scoresheet');
	var calc = require('../bup/js/calc');
	var i18n = require('../bup/js/i18n');
	var i18n_de = require('../bup/js/i18n_de');
	var i18n_en = require('../bup/js/i18n_en');
	var printing = require('../bup/js/printing');
	var settings = require('../bup/js/settings');
	var timer = require('../bup/js/timer');

    module.exports = cmatch;
}
/*/@DEV*/
