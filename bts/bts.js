'use strict';

const fs = require('fs');
const path = require('path');
const url = require('url');

const async = require('async');
const body_parser = require('body-parser');
const ws_module = require('ws');
const express = require('express');
const favicon = require('serve-favicon');

const admin = require('./admin');
const btp_manager = require('./btp_manager');
const bupws = require('./bupws');
const database = require('./database');
const http_api = require('./http_api');
const serror = require('./serror');
const shortcuts = require('./shortcuts');
const ticker_manager = require('./ticker_manager');
const utils = require('./utils');
const wshandler = require('./wshandler');

function read_config(callback, autocreate) {
	fs.readFile('config.json', 'utf8', (err, config_json) => {
		if (autocreate && err && (err.code === 'ENOENT')) {
			utils.copy_file('config.json.default', 'config.json', function(err) {
				if (err) return callback(err);

				console.log('Created default configuration in ' + path.resolve('config.json'));  // eslint-disable-line no-console
				read_config(callback, false);
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

			database.init((err, db) => cb(err, config, db));
		},
		function (config, db, cb) {
			const app = create_app(config, db);

			btp_manager.init(app, (err) => cb(err, app));
		}, function(app, cb) {
			ticker_manager.init(app, cb);
		},
	], function(err) {
		if (err) throw err;
	});
}

function cadmin_router() {
	const router = express.Router();
	router.use(function(req, res, next) {
		fs.readFile(path.join(utils.root_dir(), 'static', 'cbts.html'), 'utf8', function(err, html) {
			if (err) return next(err);
			res.set('Content-Type', 'text/html');
			res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');

			html = html.replace(/{{error_reporting}}/g, JSON.stringify(serror.active(req.app.config)));
			html = html.replace(/{{static_path}}/g, '/static/');
			html = html.replace(/{{root_path}}/g, '/');
			html = html.replace(/{{app_root}}/g, '/admin/');
			res.send(html);
		});
	});
	return router;
}

function create_app(config, db) {
	
	const app = express();
	app.config = config;
	app.db = db;
	app.use('/bup/', express.static(config.bup_location, {index: config.bup_index}));
	app.use('/bupdev/', express.static(path.join(utils.root_dir(), 'static/bup/dev/')));
	app.use('/static/', express.static('static/', {}));
	app.use('/admin/', cadmin_router());
	app.get('/', function(req, res) {
		res.redirect('/admin/');
	});
	app.use(favicon(utils.root_dir() + '/static/icons/favicon.ico'));
	app.use('/d(:courtnum)?', shortcuts.display_handler);
	app.use('/u(:courtnum)?', shortcuts.umpire_handler);

	app.use(body_parser.json());
	app.get('/h/:tournament_key/logo/:logo_id', http_api.logo_handler);

	var server = null;
	if (config.enable_https) {
		const options = {
			key: fs.readFileSync(config.https_key),
			cert: fs.readFileSync(config.https_cert)
		}
		server = require('https').createServer(options, app);
	} else {
		server = require('http').createServer(app);
	}
	
	const wss = new ws_module.Server({ server: server });
	app.wss = wss;
	wss.on('connection', function connection(ws, req) {
		const location = url.parse(req.url, true);
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

	if (config.enable_https) {
		server.listen(config.https_port, function () {
			console.log("HTTPS server listening on port " + config.https_port);
		});
		const httpApp = express();
		httpApp.get("*", function (req, res, next) {
			var host = req.headers.host.split(":")[0]
			if (config.https_port != 443) {
				host = host + ":" + config.https_port
			}
			res.redirect("https://" + host + req.path);
		});

		require('http').createServer(httpApp).listen(config.port, function () {
			console.log("HTTP server listening on port " + config.port+" ==> permanently redirected to https.");
		});
	} else {
		server.listen(config.port, function () {
			console.log("HTTP server listening on port " + config.port);
		});
	}
	return app;
}

main();
