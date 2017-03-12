'use strict';

const btp_conn = require('./btp_conn');

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
	reconfigure,
	get_status,
	init,
};