'use strict';

const assert = require('assert');

const ws_module = require('ws');

const utils = require('./utils');
const serror = require('./serror');
const fs = require('fs').promises;
const path = require('path');

const RECONNECT_TIMEOUT = 1000;

function craft_court(c) {
	return utils.pluck(c, ['num', 'match_id', '_id']);
}

function craft_match(m) {
	const res = utils.pluck(m, ['_id']);
	res.s = m.network_score;
	res.c = m.setup.counting;
	res.n = m.setup.event_name + ' ' + m.setup.match_name;
	m.setup.teams.forEach((t, tidx) => {
		res['p' + tidx] = t.players.map(p => p.name);
	});
	return res;
}

class TickerConn {
	constructor(app, url, password, tournament_key) {
		assert(tournament_key);
		this.app = app;
		this.last_status = 'Active';
		this.url = url;
		this.password = password;
		this.tournament_key = tournament_key;
		this.terminated = false;
		this.ws = null;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.report_status('connecting','Verbindung wird hergestellt ...');
		if (!/^wss?:\/\/.*\/update/.test(this.url)) {
			this.report_status('error','Ungültige Ticker-URL: ' + JSON.stringify(this.url));
			return;
		}
		const ws_url = this.url + '?password=' + encodeURIComponent(this.password);
		const ws = new ws_module(ws_url);
		const tc = this;
		tc.ws = ws;
		ws.on('open', function() {
			tc.report_status('connected','');
			tc.pushall();
		});
		ws.on('message', function(data) {
			let msg;
			try {
				msg = JSON.parse(data);
			} catch (e) {
				tc.report_status('error', 'Failed to receive ticker message: ' + e.message);
				return;
			}
			if ((msg.type === 'error') || ((msg.type === 'dmsg') && (msg.dtype === 'error'))) {
				tc.report_status('error', msg.message);
			}
		});
		ws.on('error', function() {
			if (tc.ws !== ws) { // Terminated intentionally or as a race?
				return;
			}

			tc.on_end();
		});
		ws.on('close', function() {
			if (tc.ws !== ws) { // Terminated intentionally or as a race?
				return;
			}

			tc.on_end();
		});
	}

	terminate() {
		if (this.ws) {
			const ws = this.ws;
			this.ws = null;
			ws.close();
		}
		this.terminated = true;
		this.report_status('deactivated');
	}

	schedule_reconnect() {
		if (this.terminated) {
			return;
		}
		setTimeout(() => this.connect(), RECONNECT_TIMEOUT);
	}

	pushall() {
		this._craft_event((err, event) => {
			if (err) {
				serror.silent('Failed to craft event: ' + err.message + ' ' + err.stack);
				this.report_status('error','Failed to craft data');
				return;
			}

			this.sendmsg({
				type: 'tset',
				event,
			});
		});
	}

	update_score(match) {
		this.sendmsg({
			type: 'tupdate_match',
			match: {
				_id: match._id,
				s: match.network_score,
			},
		});
	}

	sendmsg(msg) {
		if (!this.ws) {
			return;
		}

		try {
			this.ws.send(JSON.stringify(msg));
		} catch(e) {
			serror.silent('Failed to send ticker data: ' + e.message);
		}
	}

	on_end() {
		this.ws = null;
		this.report_status('error','Verbindung verloren, versuche erneut ...');
		this.schedule_reconnect();
	}

	report_status(status, message) {
		const msg = {
			status: status,
			message: message
		}
		this.last_status = msg;
		const admin = require('./admin');
		admin.notify_change(this.app, this.tournament_key, 'ticker_status', msg);
	}

	// Create the event version to send to the ticker
	_craft_event(cb) {
		const tournament_key = this.tournament_key;

		this.app.db.fetch_all([{
			collection: 'courts',
			query: {tournament_key},
		}, {
			collection: 'matches',
			query: {tournament_key},
		}, {
			collection: 'tournaments',
			query: { key: tournament_key},
		}], (err, db_courts, db_matches, db_tournaments) => {
			if (err) return cb(err);

			const interesting_ids = utils.filter_map(db_courts, c => c.match_id);
			const interesting_matches = db_matches.filter(m => interesting_ids.includes(m._id));

			const matches_by_id = new Map();
			for (const m of interesting_matches) {
				matches_by_id.set(m._id, m);
			}

			// Hide old matches
			const now = Date.now();
			for (const c of db_courts) {
				const m = matches_by_id.get(c.match_id);
				if (!m) continue;
				if (!m.end_ts) continue;

				if (m.end_ts < now - 15 * 60 * 1000) {
					c.match_id = null;
				}
			}

			if (db_tournaments && db_tournaments.length == 1) {
				const tournament = db_tournaments[0];
				const tname = tournament.name;
				const turl = "https://" + ((tournament.btp_settings && tournament.btp_settings.tournament_urn) ? tournament.btp_settings.tournament_urn : "www.turnier.de") + "/tournament" + (tournament.tguid ? "/" + tournament.tguid + "/matches" : "s/");
				if (tournament.logo_id && tournament.logo_id != null) {
					const file_path = path.join(utils.root_dir(), 'data', 'logos', tournament.logo_id);
					fs.readFile(file_path)
						.then((file_buffer) => {
							const base64_image = file_buffer.toString('base64');
							const filetype = tournament.logo_id.split(".")[1];
							const mime = {
								gif: 'image/gif',
								png: 'image/png',
								jpg: 'image/jpeg',
								jpeg: 'image/jpeg',
								svg: 'image/svg+xml',
								webp: 'image/webp',
							}[filetype];

							return cb(null, {
								courts: db_courts.map(craft_court),
								matches: interesting_matches.map(craft_match),
								tournament_name: tname,
								tournament_url: turl,
								tournament_logo: base64_image,
								tournament_logo_mime: mime,
								tournament_logo_background_color: tournament.logo_background_color
							});
						})
						.catch((error) => {
							return cb(null, {
								courts: db_courts.map(craft_court),
								matches: interesting_matches.map(craft_match),
								tournament_name: tname,
								tournament_url: turl
							});
						});
				} else {
					return cb(null, {
						courts: db_courts.map(craft_court),
						matches: interesting_matches.map(craft_match),
						tournament_name: tname,
						tournament_url: turl
					});
				}
			} else {
				return cb(null, {
					courts: db_courts.map(craft_court),
					matches: interesting_matches.map(craft_match),
					tournament_name: "",
					tournament_url: ""
				});
			}
		});
	}

}

module.exports = {
	TickerConn,
};
