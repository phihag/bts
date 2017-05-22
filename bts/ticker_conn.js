'use strict';

const net = require('net');

const btp_proto = require('./btp_proto');
const btp_sync = require('./btp_sync');
const serror = require('./serror');

const CONNECT_TIMEOUT = 5000;
const RECONNECT_TIMEOUT = 1000;


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


class TickerConn {
	constructor(app, url, password) {
		this.app = app;
		this.last_status = 'Aktiviert';
		this.url = url;
		this.password = password;
		this.terminated = false;
		this.connect();
	}

	connect() {
		if (this.terminated) {
			return;
		}

		this.report_status('Verbindung wird hergestellt ...');
		// TODO Login
	}

	terminate() {
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
		this.report_status('Verbindung verloren, versuche erneut ...');
		this.schedule_reconnect();
	}

	report_status(msg) {
		this.last_status = msg;
		const admin = require('./admin');
		admin.notify_change(this.app, this.tkey, 'ticker_status', msg);
	}
}

module.exports = {
	TickerConn,
};
