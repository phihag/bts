'use strict';

const net = require('net');

const btp_proto = require('./btp_proto');


class BTPConn {
	constructor(app, ip, tkey) {
		this.app = app;
		this.last_status = 'Aktiviert';
		this.ip = ip;
		this.tkey = tkey;
		this.terminated = false;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.report_status('Verbindung wird hergestellt ...');
		this.client = net.connect({host: this.ip, port: 9901, timeout: 5000}, () => this.on_connect());
		this.client.on('error', (e) => {
			this.report_status('Verbindungsfehler: ' + e.message);
			this.schedule_reconnect();
		});
		this.client.on('data', (data) => {
			console.log('got data from btp', data, data.toString());
		});
		this.client.on('end', () => this.on_end()  );
	}

	terminate() {
		this.terminated = true;
		this.report_status('Beendet.');
		if (this.client) {
			this.client.destroy();
		}
	}

	on_connect() {
		this.report_status('Verbunden, starte Login.');
		this.send(btp_proto.login_request());
	}

	send(xml_doc) {
		const whole_req = btp_proto.encode(xml_doc);
		// TODO proper error handling here
		if (this.client) {
			this.client.write(whole_req);
		}
	}

	schedule_reconnect() {
		if (this.terminated) {
			return;
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
		console.log('Status: ', msg)
		admin.notify_change(this.app, this.tkey, 'btp_status', msg);
	}
}

module.exports = {
	BTPConn,
};