'use strict';

const assert = require('assert');

const btp_conn = require('./btp_conn');
const serror = require('./serror');


const conns_by_tkey = new Map();

function reconfigure(app, t) {
	const cur_conn = conns_by_tkey.get(t.key);
	if (cur_conn) {
		cur_conn.terminate();
	}

	if (! t.btp_enabled) {
		return;
	}

	const conn = new btp_conn.BTPConn(
		app,
		t.btp_ip, t.btp_password, t.key,
		t.btp_autofetch_enabled, t.btp_readonly,
		t.is_team, t.btp_timezone, t.btp_autofetch_timeout_intervall);
	conns_by_tkey.set(t.key, conn);
}

function fetch(tkey) {
	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		serror.silent('fetch requested for tournament ' + tkey + ' without a conn');
		return;
	}

	conn.sync_data();
}

function update_score(app, match) {
	assert(match);
	const tkey = match.tournament_key;
	assert(tkey);

	if (! match.btp_match_ids) {
		return; // Match is not coming from BTP
	}

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if BTP support gets disabled
		return;
	}

	conn.update_score(match);
}

function update_players(app, tkey, players) {
	assert(tkey);

	if (!players || players.length < 1) {
		return;
	}

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if BTP support gets disabled
		return;
	}

	conn.update_players(players);
}

function update_courts(app, tkey, courts) {
	assert(tkey);

	if (!courts || courts.length < 1) {
		return;
	}

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if BTP support gets disabled
		return;
	}
	
	conn.update_courts(courts);
}

function update_highlight(app, match) {	
	assert(match);
	const tkey = match.tournament_key;
	assert(tkey);

	if (!match) {
		return;
	}

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if BTP support gets disabled
		return;
	}

	conn.update_highlight(match);
}


function init(app, cb) {
	app.db.tournaments.find({}, (err, tournaments) => {
		if (err) return cb(err);

		for (const t of tournaments) {
			reconfigure(app, t);
		}
		cb();
	});
}

function get_status(tkey) {
	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		return { status: 'deactivated', message: '' };
	}

	return conn.last_status;
}

module.exports = {
	fetch,
	get_status,
	init,
	reconfigure,
	update_score,
	update_players,
	update_courts,
	update_highlight,
};