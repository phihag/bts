'use strict';

const net = require('net');

const btp_proto = require('./btp_proto');

const CONNECT_TIMEOUT = 5000;


function send_request(ip, xml_req, callback) {
	var encoded_req;
	try {
		encoded_req = btp_proto.encode(xml_req);
	} catch(e) {
		return callback(e);
	}
	const client = net.connect({host: ip, port: 9901, timeout: CONNECT_TIMEOUT}, () => {
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
	constructor(app, ip, password, tkey) {
		this.app = app;
		this.last_status = 'Aktiviert';
		this.ip = ip;
		this.password = password;
		this.tkey = tkey;
		this.terminated = false;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.send(btp_proto.login_request(this.password), response => {
			if (!response.Action || (response.Action.ID !== 'REPLY')) {
				this.report_status('Ungültige Antwort auf Login-Anfrage');
				this.schedule_reconnect();
				return;
			}

			if (response.Action.Result !== 1) {
				this.report_status('Falsches Passwort');
				this.schedule_reconnect();
				return;
			}

			this.report_status('Eingeloggt.');
		});
		this.report_status('Verbindung wird hergestellt ...');
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