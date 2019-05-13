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

function display_handler(req, res) {
	req.app.db.tournaments.findOne({}, (err, t) => {
		if (err) return _error(res, err);
		if (!t) return serve_404(res);

		const bup_lang = ((t.language && t.language !== 'auto') ? '&lang=' + encodeURIComponent(t.language) : '');
		const bup_dm_style = '&dm_style=' + encodeURIComponent(t.dm_style || 'international');
		let redir_url = '/bup/#btsh_e=' + encodeURIComponent(t.key) + '&display' + bup_dm_style + bup_lang;
		if (/^[0-9]+$/.test(req.params.courtnum)) {
			redir_url += '&court=' + encodeURIComponent(t.key + '_' + req.params.courtnum);
		}

		res.redirect(redir_url);
	});
}

function umpire_handler(req, res) {
	req.app.db.tournaments.findOne({}, (err, t) => {
		if (err) return _error(res, err);
		if (!t) return serve_404(res);

		const bup_lang = ((t.language && t.language !== 'auto') ? '&lang=' + encodeURIComponent(t.language) : '');
		let redir_url = '/bup/#btsh_e=' + encodeURIComponent(t.key) + bup_lang;
		if (/^[0-9]+$/.test(req.params.courtnum)) {
			redir_url += '&court=' + encodeURIComponent(t.key + '_' + req.params.courtnum);
		}

		res.redirect(redir_url);
	});
}

module.exports = {
	display_handler,
	umpire_handler,
};
