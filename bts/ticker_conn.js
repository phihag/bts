'use strict';

const assert = require('assert');

const ws_module = require('ws');

const utils = require('./utils');
const serror = require('./serror');


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
		this.last_status = 'Aktiviert';
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

		this.report_status('Verbindung wird hergestellt ...');
		if (!/^wss?:\/\/.*\/update/.test(this.url)) {
			this.report_status('Ungültige Ticker-URL: ' + JSON.stringify(this.url));
			return;
		}
		const ws_url = this.url + '?password=' + encodeURIComponent(this.password);
		const ws = new ws_module(ws_url);
		const tc = this;
		tc.ws = ws;
		ws.on('open', function() {
			tc.report_status('Verbunden.');
			tc.pushall();
		});
		ws.on('message', function(data) {
			let msg;
			try {
				msg = JSON.parse(data);
			} catch (e) {
				tc.report_status('Failed to receive ticker message: ' + e.message);
				return;
			}
			if ((msg.type === 'error') || ((msg.type === 'dmsg') && (msg.dtype === 'error'))) {
				tc.report_status('Fehler: ' + msg.message);
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
		this.report_status('Beendet.');
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
				this.report_status('Konnte nicht Daten vorbereiten');
				return;
			}

			if (!this.ws) {
				return;
			}

			try {
				this.ws.send(JSON.stringify({
					type: 'tset',
					event,
				}));
			} catch(e) {
				serror.silent('Failed to send ticker data: ' + e.message);
			}
		});
	}

	on_end() {
		this.ws = null;
		this.report_status('Verbindung verloren, versuche erneut ...');
		this.schedule_reconnect();
	}

	report_status(msg) {
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
		}], (err, db_courts, db_matches) => {
			if (err) return cb(err);

			const interesting_ids = utils.filter_map(db_courts, c => c.match_id);
			const interesting_matches = db_matches.filter(m => interesting_ids.includes(m._id));

			return cb(null, {
				courts: db_courts.map(craft_court),
				matches: interesting_matches.map(craft_match),
			});
		});
	}

}

module.exports = {
	TickerConn,
};
