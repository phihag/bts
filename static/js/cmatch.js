'use strict';

var cmatch = (function() {

function render_match_table_header(table) {
	const thead = uiu.el(table, 'thead');
	const title_tr = uiu.el(thead, 'tr');
	uiu.el(title_tr, 'th', {
		colspan: 2,
	}, '#');
	uiu.el(title_tr, 'th', {}, 'Spiel');
	uiu.el(title_tr, 'th', {}, 'Spieler');
	uiu.el(title_tr, 'th', {}, 'Stand');
}

function calc_team_players_str(team) {
	return team.players.map(p => p.name).join(' / ');
}

function calc_players_str(setup) {
	const t0str = calc_team_players_str(setup.teams[0]);
	const t1str = calc_team_players_str(setup.teams[1]);
	return (
		(setup.incomplete ? '(Unvollständig!) ' : '') +
		(t0str ? t0str : '[links]') + ' vs ' +
		(t1str ? t1str : '[rechts]')
	);
}

function prepare_render(t) {
	t.matches.sort(function(m1, m2) {
		return cbts_utils.cmp(m1.setup.match_num, m2.setup.match_num);
	});
}

function render_match_row(tr, match) {
	const setup = match.setup;
	const actions_td = uiu.el(tr, 'td');
	const edit_btn = uiu.el(actions_td, 'div', 'vlink match_edit_button');
	const match_str = (setup.scheduled_time_str ? (setup.scheduled_time_str + ' ') : '') + (setup.match_name ? (setup.match_name + ' ') : '') + setup.event_name;
	uiu.el(tr, 'td', 'match_num', setup.match_num);
	uiu.el(tr, 'td', {}, match_str);
	uiu.el(tr, 'td', {}, calc_players_str(setup));
	uiu.el(tr, 'td', {}, 'TODO: match state');
}

function render_match_table(container, matches) {
	const table = uiu.el(container, 'table', 'match_table');
	render_match_table_header(table);
	const tbody = uiu.el(table, 'tbody');

	for (const m of matches) {
		const tr = uiu.el(tbody, 'tr');
		render_match_row(tr, m);
	}
}

function render_unassigned(container) {
	uiu.el(container, 'h3', {}, 'Offene Spiele');

	const unassigned_matches = curt.matches.filter(m => !m.setup.court_id);
	render_match_table(container, unassigned_matches);
}

function render_finished(container) {
	uiu.el(container, 'h3', {}, 'Abgeschlossene Spiele');

	const matches = curt.matches.filter(m => m.finished);
	render_match_table(container, matches);
}

function render_courts(container) {
	uiu.el(container, 'h3', {}, 'Zugewiesene Spiele');

	const table = uiu.el(container, 'table', 'match_table');
	const tbody = uiu.el(table, 'tbody');
	for (const c of curt.courts) {
		const court_matches = curt.matches.filter(m => (m.setup.court_id === c._id));
		const tr = uiu.el(tbody, 'tr');
		const rowspan = Math.max(1, court_matches.length);
		uiu.el(tr, 'th', {
			rowspan,
			title: c._id,
		}, c.num);
		if (court_matches.length === 0) {
			uiu.el(tr, 'td', {colspan: 5}, 'Bisher noch keine Matches auf diesem Court.');
		} else {
			for (const cm of court_matches) {
				render_match_row(tr, cm);
			}
		}
	}
}

function _make_player(d, team_idx, player_idx) {
	const name = d['team' + team_idx + 'player' + player_idx + 'name'];
	return name ? {name} : null;
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

function render_create(container) {
	uiu.empty(container);
	const form = uiu.el(container, 'form');
	const table = uiu.el(form, 'table', 'match_players_container');
	const tbody = uiu.el(table, 'tbody');

	const tr0 = uiu.el(tbody, 'tr');
	const tr1 = uiu.el(tbody, 'tr');

	uiu.el(tr0, 'td', {}, 'Nummer:');
	const num_td = uiu.el(tr0, 'td');
	uiu.el(num_td, 'input', {
		type: 'text',
		name: 'match_num',
		pattern: '^[0-9]+$',
		size: 3,
		required: 'required',
	});

	uiu.el(tr1, 'td', {}, 'Zeit:');
	const time_td = uiu.el(tr1, 'td');
	uiu.el(time_td, 'input', {
		type: 'text',
		name: 'scheduled_time_str',
		pattern: '^[0-9]{1,2}:[0-9]{1,2}$',
		title: 'Uhrzeit im 24-Stunden-Format, z.B. 12:34',
		size: 3,
	});

	uiu.el(tr0, 'td', {}, 'Event:');
	const event_td = uiu.el(tr0, 'td');
	uiu.el(event_td, 'input', {
		type: 'text',
		name: 'event_name',
		placeholder: 'z.B. MX O55',
		size: 10,
	});
	uiu.el(tr1, 'td', {}, 'Match:');
	const match_name_td = uiu.el(tr1, 'td');
	uiu.el(match_name_td, 'input', {
		type: 'text',
		name: 'match_name',
		placeholder: 'z.B. Halbfinale',
		size: 10,
	});

	const t0p0td = uiu.el(tr0, 'td');
	uiu.el(t0p0td, 'input', {
		type: 'text',
		name: 'team0player0name',
		required: 'required',
	});
	const t0p1td = uiu.el(tr1, 'td');
	uiu.el(t0p1td, 'input', {
		type: 'text',
		name: 'team0player1name',
		placeholder: '(Einzel)',
	});

	uiu.el(tr0, 'td', {
		rowspan: 2,
	}, 'vs');

	const t1p0td = uiu.el(tr0, 'td');
	uiu.el(t1p0td, 'input', {
		type: 'text',
		name: 'team1player0name',
		required: 'required',
	});
	const t1p1td = uiu.el(tr1, 'td');
	uiu.el(t1p1td, 'input', {
		type: 'text',
		name: 'team1player1name',
		placeholder: '(Einzel)',
	});

	uiu.el(tr0, 'td', {}, 'Court:');
	const court_td = uiu.el(tr0, 'td');
	const court_select = uiu.el(court_td, 'select', {
		'class': 'court_selector',
		name: 'court_id',
		size: 1,
	});
	uiu.el(court_select, 'option', {
		selected: 'selected',
		value: '',
	}, 'Nicht zugewiesen');
	if (curt) {
		for (const court of curt.courts) {
			uiu.el(court_select, 'option', {
				value: court._id,
			}, court.num);
		}
	}

	uiu.el(tr1, 'td', {}, 'Schiedsrichter:');
	const umpire_td = uiu.el(tr1, 'td');
	uiu.el(umpire_td, 'input', {
		type: 'text',
		name: 'umpire_name',
		size: 15,
	});

	const btn_td = uiu.el(tr0, 'td', {rowspan: 2});
	const btn = uiu.el(btn_td, 'button', {
		'class': 'match_add_button',
		role: 'submit',
	}, 'Match hinzufügen');

	form_utils.onsubmit(form, function(d) {
		const is_doubles = !! d.team0player1name;

		const teams = [_make_team(d, 0), _make_team(d, 1)];
		const player_count = is_doubles ? 2 : 1;
		const incomplete = !teams.every(team => (team.players.length === player_count));

		const setup = {
			court_id: d.court_id,
			match_num: parseInt(d.match_num),
			match_name: d.match_name,
			scheduled_time_str: d.scheduled_time_str,
			event_name: d.event_name,
			umpire_name: d.umpire_name,
			teams,
			is_doubles,
			incomplete,
		};	
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
}

return {
	prepare_render,
	render_create,
	render_finished,
	render_unassigned,
	render_courts,
};

})();


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cbts_utils = require('./cbts_utils');
	var cerror = require('../bup/js/cerror');
	var form_utils = require('../bup/js/form_utils');
	var uiu = require('../bup/js/uiu');

    module.exports = cmatch;
}
/*/@DEV*/
