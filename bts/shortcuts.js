'use strict';

const fs = require('fs');
const path = require('path');

const serror = require('./serror');

function _error(res, err) {
	serror.silent('Internal error: ' + err.message);
	res.sendStatus(500);
}

function display_handler(req, res) {
	req.app.db.tournaments.findOne({}, (err, t) => {
		if (err) return _error(res, err);

		if (!t) {
			const html_fn = path.join(__dirname, '..', 'static', 'd_404.html');
			fs.readFile(html_fn, 'utf8', (err, html) => {
				if (err) return _error(res, err);
				res.status(404).send(html);
			});
			return;
		}

		res.redirect('/bup/#btsh_e=' + encodeURIComponent(t.key) + '&display&dm_style=oncourt');
	});
}

module.exports = {
	display_handler,
};
