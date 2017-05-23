'use strict';

const fs = require('fs');
const path = require('path');
const url = require('url');

const async = require('async');
const ws_module = require('ws');
const express = require('express');
const favicon = require('serve-favicon');

const serror = require('../bts/serror');
const utils = require('../bts/utils');
const wshandler = require('../bts/wshandler');

const tdata = require('./tdata');
const tdatabase = require('./tdatabase');
const tget = require('./tget');
const tupdate = require('./tupdate');
const tweb = require('./tweb');

function read_config(callback, autocreate) {
	fs.readFile('ticker_config.json', 'utf8', (err, config_json) => {
		if (autocreate && err && (err.code === 'ENOENT')) {
			fs.readFile('ticker_config.json.default', 'utf8', (err, config_json) => {
				if (err) return callback(err);

				const config = JSON.parse(config_json);
				config.password = utils.gen_token();

				fs.writeFile('ticker_config.json', JSON.stringify(config, null, '\t'), 'utf8', (err) => {
					if (err) return callback(err);

					console.log('Created default configuration in ' + path.resolve('ticker_config.json'));  // eslint-disable-line no-console
					read_config(callback, false);
				});
			});
			return;
		}
		if (err) return callback(err);

		const config = JSON.parse(config_json);
		callback(err, config);
	});
}

function main() {
	async.waterfall([
		cb => read_config(cb, true),
		function(config, cb) {
			serror.setup(config);

			tdatabase.init((err, db) => cb(err, config, db));
		},
		function (config, db, cb) {
			const app = create_app(config, db);

			cb(null, app);
		},
		(app, cb) => tdata.recalc(app, cb),
	], function(err) {
		if (err) throw err;
	});
}


function create_app(config, db) {
	const server = require('http').createServer();
	const app = express();
	const wss = new ws_module.Server({server: server});

	app.config = config;
	app.db = db;
	app.wss = wss;

	app.use('/bupdev/', express.static(path.join(utils.root_dir(), 'static/bup/dev/')));
	app.use('/static/', express.static('static/', {}));
	app.get('/', tweb.main_handler);
	app.use(favicon(utils.root_dir() + '/static/icons/favicon.ico'));
	app.get('/qjson', tweb.qjson_handler);

	wss.on('connection', function connection(ws) {
		const location = url.parse(ws.upgradeReq.url, true);
		if (location.path === '/ws/ticker') {
			return wshandler.handle(tget, app, ws);
		} else if (/^\/ws\/update/.test(location.path)) {
			const password = location.query.password;
			if (password && (password !== app.config.password)) {
				try {
					ws.send(JSON.stringify({
						type: 'error',
						message: 'Incorrect password',
					}));
				} catch(e) {
					serror.silent('failed to send password failure');
				}
				return;
			}

			return wshandler.handle(tupdate, app, ws);
		} else {
			ws.send(JSON.stringify({
				type: 'error',
				message: 'Unsupported location ' + location.path,
			}));
			ws.close();
		}
	});

	server.on('request', app);
	server.listen(config.port, function () {});
	return app;
}

main();
