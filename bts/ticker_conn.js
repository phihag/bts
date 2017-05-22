'use strict';

const assert = require('assert');

const ws_module = require('ws');

const RECONNECT_TIMEOUT = 1000;


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
		});
		ws.on('message', function(data) {
			let msg;
			try {
				msg = JSON.parse(data);
			} catch (e) {
				tc.report_status('Failed to receive ticker message: ' + e.message);
				return;
			}
			tc.report_status('Fehler: ' + msg.message);
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
}

module.exports = {
	TickerConn,
};
