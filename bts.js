'use strict';

const fs = require('fs');
const url = require('url');

const ws_module = require('ws');
const express = require('express');

const database = require('./database');
const wshandler = require('./wshandler');
const admin = require('./admin');
const bupws = require('./bupws');

function main() {
	fs.readFile('config.json', 'utf8', (err, config_json) => {
		if (err) throw err;

		const config = JSON.parse(config_json);

		database.init(db => run_server(config, db));
	});
}

function run_server(config, db) {
	const server = require('http').createServer();
	const app = express();
	const wss = new ws_module.Server({server: server});

	app.config = config;
	app.db = db;
	app.wss = wss;
	app.use('/bup', express.static('static/bup', {index: 'bup.html'}));
	app.use('/', express.static('static/', {index: 'index.html'}));

	wss.on('connection', function connection(ws) {
		const location = url.parse(ws.upgradeReq.url, true);
		if (location.path === '/ws/admin') {
			return wshandler.handle(admin, app, ws);
		} else if (location.path === '/ws/bup') {
			return wshandler.handle(bupws, app, ws);
		} else {
			ws.send(JSON.stringify({
				type: 'error',
				message: 'Unsupported location ' + location.path,
			}));
			ws.close();
		}
	});

	server.on('request', app);
	server.listen(config.port, function () {
		// console.log('Listening on ' + server.address().port);
	});
}

main();
