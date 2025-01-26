'use strict';

const assert = require('assert');
const net = require('net');

const async = require('async');

const btp_proto = require('./btp_proto');
const btp_sync = require('./btp_sync');
const update_queue = require('./update_queue');
const serror = require('./serror');

const AUTOFETCH_TIMEOUT = 30000;
const CONNECT_TIMEOUT = 5000;
const WAIT_TIMEOUT = 10000;
const BTP_PORT = 9901;
const BLP_PORT = 9911;


function send_raw_request(ip, port, raw_req, callback) {
	assert(callback);
	if (!ip) {
		return callback(new Error('No IP address specified'));
	}
	const client = net.connect({host: ip, port, timeout: CONNECT_TIMEOUT}, () => {
		client.setTimeout(WAIT_TIMEOUT);
		client.write(raw_req);
	});

	const got = [];
	let called = false;
	client.on('error', (err) => {
		if (called) return;
		called = true;
		callback(err);
	});
	client.on('timeout', () => {
		if (called) return;
		called = true;
		callback(new Error(`Connection to ${ip}:${port} timed out after ${WAIT_TIMEOUT}ms`));
	});
	client.on('data', (data) => {
		got.push(data);
	});
	client.on('end', () => {
		if (called) return;
		called = true;

		callback(null, Buffer.concat(got));
	});
}

function send_request(ip, port, xml_req, timeZone, callback) {
	assert(callback);
	let encoded_req;
	try {
		encoded_req = btp_proto.encode(xml_req, timeZone);
	} catch(e) {
		serror.silent('Error while encoding for BTP:' + e.message);
		return callback(e);
	}
	send_raw_request(ip, port, encoded_req, (err, raw_response) => {
		if (err) return callback(err);
		btp_proto.decode(raw_response, (err, decoded) => {
			if (err) return callback(err);

			return callback(err, decoded);
		});
	});
} 


class BTPConn {
	constructor(app, ip, password, tkey, enabled_autofetch, readonly, is_team, timeZone, autofetch_timeout_intervall) {
		this.app = app;
		this.last_status = 'Activated';
		this.ip = ip;
		this.password = password;
		this.tkey = tkey;
		this.timeZone = timeZone;
		this.terminated = false;
		this.enabled_autofetch = enabled_autofetch;
		this.autofetch_timeout = null;
		this.readonly = readonly;
		this.is_team = is_team;
		this.autofetch_timeout_intervall = autofetch_timeout_intervall ? autofetch_timeout_intervall : AUTOFETCH_TIMEOUT;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.report_status('connecting','Try to establish connection to BTP.');
		this.send(btp_proto.login_request(this.password), response => {
			if (!response || response == null || !response.Action || !response.Action[0] || !response.Action[0].ID[0] || (response.Action[0].ID[0] !== 'REPLY')) {
				this.report_status('error','Invalid reply to login request');
				return;
			}

			if (response.Action[0].Result[0] !== 1) {
				this.report_status('error', 'Invalid password');
				return;
			}

			this.report_status('connected','Logged in.');
			this.key_unicode = response.Action[0].Unicode[0];

			this.pushall();
			if (this.enabled_autofetch) {
				update_queue.instance().execute(this.fetch, this,true);
			}
		});
	}

	sync_data() {
		update_queue.instance().execute(this.fetch, this, false);
	}

	async fetch(connection, reschedule_fetch ) {
		return new Promise((resolve, reject) => {
			try {			
				const ir = btp_proto.get_info_request(connection.password);
				connection.send(ir, async (response) => {
					try {
						if (response && response != null) {
							const value = await btp_sync.sync_btp_data(connection.app, connection.tkey, response);
							if (reschedule_fetch == true) {
								connection.schedule_fetch();
							}
							resolve(value);
						} else {
							resolve(null);
						}
					} catch (innerError) {
						reject(innerError);
					}
				});
			} catch (e) {
				reject(e);
			}
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
			update_queue.instance().execute(this.fetch,this,true);
		}, this.autofetch_timeout_intervall);
	}

	terminate() {
		this.terminated = true;
		this.report_status('deactivated','Terminated.');
	}

	send(xml_req, success_cb) {
		if (this.terminated) return success_cb(null);
		const port = this.is_team ? BLP_PORT : BTP_PORT;
		send_request(this.ip, port, xml_req, this.timeZone, (err, response) => {
			if (err) {
				this.report_status('error', 'Connection error: ' + err.message);
				this.schedule_reconnect();
				return success_cb(null);
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
						// serror.silent('match ' + m._id + ' has needsync but is not finished');
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
		this.report_status('error', 'Verbindung verloren, versuche erneut ...');
		this.schedule_reconnect();
	}

	report_status(status, message) {
		const msg = {
			status: status,
			message: message
		}
		this.last_status = msg;
		const admin = require('./admin');
		admin.notify_change(this.app, this.tkey, 'btp_status', msg);
	}

	update_score(match) {
		if (this.readonly) {
			return;
		}

		async.waterfall([
			(cb) => {
				if (!match.setup || !match.setup.umpire || !match.setup.umpire.name) {
					return cb(null, null, null);
				}

				this.app.db.umpires.findOne({
					name: match.setup.umpire.name,
					tournament_key: this.tkey,
				}, (err, umpire) => {
					if (err) {
						return cb(err);
					}

					const umpire_btp_id = umpire ? umpire.btp_id : null;
					if (!match.setup.service_judge || !match.setup.service_judge.name) {
						return cb(null, umpire_btp_id, null);
					}

					this.app.db.umpires.findOne({
						name: match.setup.service_judge.name,
						tournament_key: this.tkey,
					}, (err, service_judge) => {
						if (err) {
							return cb(err);
						}

						const service_judge_btp_id = service_judge ? service_judge.btp_id : null;
						return cb(null, umpire_btp_id, service_judge_btp_id);
					});
				});
			},
			(umpire_btp_id, service_judge_btp_id, cb) => {
				if (!match.setup || !match.setup.court_id) {
					return cb(null, umpire_btp_id, service_judge_btp_id, null);
				}

				this.app.db.courts.findOne({
					tournament_key: this.tkey,
					_id: match.setup.court_id,
				}, (err, court) => {
					if (err) {
						return cb(err);
					}

					return cb(null, umpire_btp_id, service_judge_btp_id, court ? court.btp_id : null);
				});
			},
		], (err, umpire_btp_id, service_judge_btp_id, court_btp_id) => {
			if (err) {
				serror.silent('Error while fetching court/umpire: ' + err.message + '. Skipping sync of match ' + match._id);
				return;
			}

			if (!match.btp_match_ids) {
				// TODO: assert here?
				return;
			}

			if (! this.key_unicode) {
				//serror.silent('Trying to send match data, but never logged in. Must retry later');
				return;
			}

			const req = btp_proto.update_request(
				match, this.key_unicode, this.password, umpire_btp_id, service_judge_btp_id, court_btp_id);
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

		});
	}

	update_highlight(match) {
		this.update_score(match);
	}

	update_players(players) {
		if (this.readonly) {
			return;
		}

		if (!players || players.length < 1) {
			return;
		}

		if (! this.key_unicode) {
			//serror.silent('Trying to update player data, but never logged in. Must retry later');
			return;
		}

		const req = btp_proto.update_players_request(players, this.key_unicode, this.password);
		this.send(req, response => {
			const results = response.Action[0].Result;
			const rescode = results ? results[0] : 'no-result';
			if (rescode === 1) {

			} else {
				serror.silent('Update Player failed with error code ' + rescode);
			}
		});
	}

	update_courts(courts) {
		if (this.readonly) {
			return;
		}

		if (!courts || courts.length < 1) {
			return;
		}

		if (! this.key_unicode) {
			//serror.silent('Trying to update court data, but never logged in. Must retry later');
			return;
		}

		const req = btp_proto.update_courts_request(courts, this.key_unicode, this.password);
		this.send(req, response => {
			const results = response.Action[0].Result;
			const rescode = results ? results[0] : 'no-result';
			if (rescode === 1) {

			} else {
				serror.silent('Update Courts failed with error code ' + rescode);
			}
		});
	}
}

module.exports = {
	BTPConn,
	send_raw_request,
	BTP_PORT,
	BLP_PORT,
};
