'use strict';

const net = require('net');

const btp_proto = require('./btp_proto');
const btp_sync = require('./btp_sync');
const serror = require('./serror');

const AUTOFETCH_TIMEOUT = 45000;
const CONNECT_TIMEOUT = 5000;
const PORT = 9901; // 9901 for true BTP, 9002 for win7 machine


function send_request(ip, xml_req, callback) {
	var encoded_req;
	try {
		encoded_req = btp_proto.encode(xml_req);
	} catch(e) {
		serror.silent('Error while encoding for BTP:' + e.message);
		return callback(e);
	}
	const client = net.connect({host: ip, port: PORT, timeout: CONNECT_TIMEOUT}, () => {
		client.write(encoded_req);
	});

	const got = [];
	var called = false;
	client.on('error', (err) => {
		if (called) return;
		called = true;
		callback(err);
	});
	client.on('data', (data) => {
		got.push(data);
	});
	client.on('end', () => {
		if (called) return;
		called = true;

		btp_proto.decode(Buffer.concat(got), callback);
	});
} 


class BTPConn {
	constructor(app, ip, password, tkey, enabled_autofetch, readonly) {
		this.app = app;
		this.last_status = 'Aktiviert';
		this.ip = ip;
		this.password = password;
		this.tkey = tkey;
		this.terminated = false;
		this.enabled_autofetch = enabled_autofetch;
		this.autofetch_timeout = null;
		this.readonly = readonly;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.report_status('Verbindung wird hergestellt ...');
		this.send(btp_proto.login_request(this.password), response => {
			if (!response.Action || !response.Action[0] || !response.Action[0].ID[0] || (response.Action[0].ID[0] !== 'REPLY')) {
				this.report_status('Ungültige Antwort auf Login-Anfrage');
				this.schedule_reconnect();
				return;
			}

			if (response.Action[0].Result[0] !== 1) {
				this.report_status('Falsches Passwort');
				this.schedule_reconnect();
				return;
			}

			this.report_status('Eingeloggt.');
			this.key_unicode = response.Action[0].Unicode[0];

			this.pushall();
			this.fetch();
			this.schedule_fetch();
		});
	}

	fetch() {
		const ir = btp_proto.get_info_request(this.password);
		this.send(ir, response => {
			btp_sync.fetch(this.app, this.tkey, response, (err) => {
				if (err) {
					this.report_status('Synchronisations-Fehler: ' + err.message);
				}
			});
		});
	}

	schedule_fetch() {
		if (this.terminated) {
			return;
		}
		if (!this.enabled_autofetch) {
			return;
		}

		this.autofetch_timeout = setTimeout(() => {
			this.fetch();
			this.schedule_fetch();
		}, AUTOFETCH_TIMEOUT);
	}

	terminate() {
		this.terminated = true;
		this.report_status('Beendet.');
	}

	send(xml_req, success_cb) {
		if (this.terminated) return;

		send_request(this.ip, xml_req, (err, response) => {
			if (err) {
				this.report_status('Verbindungsfehler: ' + err.message);
				this.schedule_reconnect();
				return;
			}

			success_cb(response);
		});
	}

	// Push the changes from all changed matches
	pushall() {
		this.app.db.matches.find(
			{btp_needsync: true},

			(err, matches) => {
				if (err) {
					serror.silent('Failed to query needsynced: ' + err.message);
					return;
				}

				for (const m of matches) {
					if (typeof m.team1_won !== 'boolean') {
						serror.silent('match ' + m._id + ' has needsync but is not finished');
						continue;
					}

					this.update_score(m);
				}
			}
		);
	}

	schedule_reconnect() {
		if (this.terminated) {
			return;
		}
		if (this.autofetch_timeout) {
			clearTimeout(this.autofetch_timeout);
			this.autofetch_timeout = null;
		}
		setTimeout(() => this.connect(), 500);
	}

	on_end() {
		this.report_status('Verbindung verloren, versuche erneut ...');
		this.schedule_reconnect();
	}

	report_status(msg) {
		this.last_status = msg;
		const admin = require('./admin');
		admin.notify_change(this.app, this.tkey, 'btp_status', msg);
	}

	update_score(match) {
		if (this.readonly) {
			return;
		}

		const req = btp_proto.update_request(match, this.key_unicode, this.password);

		this.send(req, response => {
			const results = response.Action[0].Result;
			const rescode = results ? results[0] : 'no-result';
			if (rescode === 1) {
				this.app.db.matches.update({_id: match._id}, {$set: {btp_needsync: false}}, {}, (err) => {
					if (err) {
						serror.silent('Failed to mark match as synced: ' + err.message);
					}
				});
			} else {
				serror.silent('Score update for ' + match.btp_id + ' failed with error code ' + rescode);
			}
		});
	}
}

module.exports = {
	BTPConn,
};