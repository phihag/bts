'use strict';

const assert = require('assert');

const ticker_conn = require('./ticker_conn');


const conns_by_tkey = new Map();

function reconfigure(app, t) {
	const cur_conn = conns_by_tkey.get(t.key);
	if (cur_conn) {
		cur_conn.terminate();
	}

	if (! t.ticker_enabled) {
		return;
	}

	const conn = new ticker_conn.TickerConn(app, t.ticker_url, t.ticker_password, t.key);
	conns_by_tkey.set(t.key, conn);
}

function pushall(app, tkey) {
	assert(tkey);

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if ticker support gets disabled
		return;
	}

	conn.pushall();
}

function reset(app, tkey) {
	assert(tkey);

	app.db.tournaments.findOne({key: tkey}, (err, tournament) => {
		if (err) return; // silent error? tournament already deleted

		reconfigure(app, tournament);
	});
}

function update_score(app, match) {
	assert(match);
	const tkey = match.tournament_key;
	assert(tkey);

	const conn = conns_by_tkey.get(tkey);
	if (!conn) {
		// Do not output an error; this happens if ticker support gets disabled
		return;
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
		return 'deactivated.';
	}

	return conn.last_status;
}

module.exports = {
	get_status,
	init,
	reconfigure,
	pushall,
	update_score,
	reset,
};