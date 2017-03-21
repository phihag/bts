'use strict';

const assert = require('assert');

const btp_conn = require('./btp_conn');
const error_reporting = require('./error_reporting');

const conns_by_tkey = new Map();

function reconfigure(app, t) {
	const cur_conn = conns_by_tkey.get(t.key);
	if (cur_conn) {
		cur_conn.terminate();
	}

	if (! t.btp_enabled) {
		return;
	}

	const conn = new btp_conn.BTPConn(app, t.btp_ip, t.btp_password, t.key);
	conns_by_tkey.set(t.key, conn);
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

	if (typeof match.team1_won !== 'boolean') {
		return; // Match not finished yet
	}

	conn.update_score(match);
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
		return 'Deaktiviert.';
	}

	return conn.last_status;
}

module.exports = {
	get_status,
	init,
	reconfigure,
	update_score,
};