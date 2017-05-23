'use strict';

const fs = require('fs');
const path = require('path');

const utils = require('../bts/utils');
const serror = require('../bts/serror');

const mustache = require('../static/libs/mustache.min.js');

function render_html(app, cb) {
	const data = {
		courts_with_matches: app.courts_with_matches,
	};
	fs.readFile(path.join(utils.root_dir(), 'static', 'ticker', 'courts.mustache'), 'utf8', (err, template) => {
		if (err) return cb(err);

		const html = mustache.render(template, data);
		return cb(null, html);
	});
}


function main_handler(req, res, next) {
	render_html(req.app, (err, courts_html) => {
		if (err) return next(err);

		fs.readFile(path.join(utils.root_dir(), 'static', 'ticker', 'root.html'), 'utf8', function(err, html) {
			if (err) return next(err);
			res.set('Content-Type', 'text/html');
			res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');

			html = html.replace(/{{error_reporting}}/g, JSON.stringify(serror.active(req.app.config)));
			html = html.replace(/{{tournament_name_html}}/g, utils.encode_html(req.app.config.tournament_name));
			html = html.replace(/{{note_html}}/g, req.app.config.note_html);
			html = html.replace(/{{courts_html}}/g, courts_html);
			html = html.replace(/{{static_path}}/g, '/static/');
			html = html.replace(/{{root_path}}/g, '/');
			res.send(html);
		});
	});
}

function qjson_handler(req, res, next) {
	render_html(req.app, (err, courts_html) => {
		if (err) return next(err);

		const d = {
			courts_html,
		};

		res.set('Content-Type', 'text/plain');
		res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		res.set('X-Content-Type-Options', 'nosniff');

		res.send(JSON.stringify(d));
	});
}

module.exports = {
	main_handler,
	qjson_handler,
};
