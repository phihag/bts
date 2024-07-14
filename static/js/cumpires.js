'use strict';

var cumpires = (function() {


	function _ui_render_table(container, umpires) {
		const table = uiu.el(container, 'table');
		const tbody = uiu.el(table, 'tbody');
		for (const u of umpires) {
		
			const tr = uiu.el(tbody, 'tr');
			if (curt.is_nation_competition) {
				const flag_td = uiu.el(tr, 'td');
				cflags.render_flag_el(flag_td, u.nationality);
			}
			uiu.el(tr, 'td', {
				class: 'umpires_firstname',
				title: ci18n('umpires:btp_id', { btp_id: u.btp_id }),
			}, u.firstName);
			uiu.el(tr, 'td', {
				class: 'umpires_name',
				title: ci18n('umpires:btp_id', {btp_id: u.btp_id}),
			}, u.surname);
			if (u.status === 'oncourt') {
				const td = uiu.el(tr, 'td', 'umpires_since', '');
				let parts = u.court_id.split("_");
				let court_number = parts[parts.length - 1];
				uiu.el(td, 'div', 'court', court_number)
			} else if (u.status === 'standby') {
				uiu.el(tr, 'td', 'umpires_since', 'In Vorbereitung');
			} else { 
				var timer_state = _extract_umpire_timer_state(u);
				var timer = cmatch.create_timer(timer_state, uiu.el(tr, 'td', 'umpires_since', ''), "#ffffff", "#ffffff");
			}
		}
	}


	function ui_status(container) {
		uiu.empty(container);
		var umpires = curt.umpires;
		if (umpires.length > 0) {
			container.style.display = "block";
			umpires = umpires.sort((a, b) => {


				if (a.status === b.status) {

					if (!b.last_time_on_court_ts) {
						return 1;
					} else if (!a.last_time_on_court_ts) {
						return -1;
					} else {
						return a.last_time_on_court_ts - b.last_time_on_court_ts;
					}
				} else {
					if (a.status === "oncourt") {
						return 1;
					}
					if (a.status === "ready") {
						return -1;
					}
					return 0;
				}
			});
			uiu.el(container, 'h3', {}, ci18n('Umpire:'));
			const tableoperator_content = uiu.el(container, 'div', 'umpire_container_content');
			_ui_render_table(tableoperator_content, umpires, 'ready');
		} else {
			container.style.display = "none";
		}

	}

	function _extract_umpire_timer_state(umpire) {
		let s = {};
		s.settings = {};
		s.settings.negative_timers = false;
		s.lang = "de";
		s.timer = {};
		s.timer.duration = curt.btp_settings.pause_duration_ms;
		s.timer.start = (umpire.last_time_on_court_ts ? umpire.last_time_on_court_ts : false);
		s.timer.upwards = false;
		s.timer.exigent = false;
		s.bgColor = "#FF0000";
		return s;
	}


	return {
		ui_status,
	};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cflags = require('./cflags');
	var ci18n = require('./ci18n.js');
	var change = require('./change.js');
	var cmatch = require('./cmatch.js');
	var crouting = require('./crouting.js');
	var ctournament = require('./ctournament.js');
	var toprow = require('./toprow.js');
	var uiu = require('../bup/js/uiu.js');
	var utils = require('../bup/js/utils.js');

	module.exports = cumpires;
}
/*/@DEV*/
