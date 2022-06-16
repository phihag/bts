'use strict';

const fs = require('fs');
const path = require('path');

const serror = require('./serror');

function _error(res, err) {
	serror.silent('Internal error: ' + err.message);
	res.sendStatus(500);
}

function serve_404(res) {
	const html_fn = path.join(__dirname, '..', 'static', 'd_404.html');
	fs.readFile(html_fn, 'utf8', (err, html) => {
		if (err) return _error(res, err);
		res.status(404).send(html);
	});
}

function encode_params(obj) {
	console.log(obj)
	return Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

function display_handler(req, res) {
	req.app.db.tournaments.findOne({}, (err, t) => {
		if (err) return _error(res, err);
		if (!t) return serve_404(res);

		const bup_params = {
			dm_style: (t.dm_style || 'international'),
			btsh_e: t.key,
			'nosettings': '1',
			'display': '1',
		};
		if (t.language && t.language !== 'auto') {
			bup_params.lang = t.language;
		}
		if (/^[0-9]+$/.test(req.params.courtnum)) {
			bup_params.court = t.key + '_' + req.params.courtnum;
		}

		const redir_url = '/bup/#' + encode_params({...bup_params, ...req.query});

		res.redirect(redir_url);
	});
}

function umpire_handler(req, res) {
	req.app.db.tournaments.findOne({}, (err, t) => {
		if (err) return _error(res, err);
		if (!t) return serve_404(res);

		const bup_params = {
			btsh_e: t.key,
		};
		if (t.language && t.language !== 'auto') {
			bup_params.lang = t.language;
		}
		if (/^[0-9]+$/.test(req.params.courtnum)) {
			bup_params.court = t.key + '_' + req.params.courtnum;
		}

		const redir_url = '/bup/#' + encode_params({...bup_params, ...req.query});
		res.redirect(redir_url);
	});
}

module.exports = {
	display_handler,
	umpire_handler,
};
