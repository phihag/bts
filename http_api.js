'use strict';

const stournament = require('./stournament');


function courts_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	stournament.get_courts(req.app.db, tournament_key, function(err, courts) {
		const reply = (err ? {
			status: 'error',
			message: err.message,
		} : {
			status: 'ok',
			courts,
		});

		res.json(reply);
	});
}

function matches_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	const search = {tournament_key};
	if (req.query.court) {
		search['setup.court_id'] = req.query.court;
	}
	req.app.db.matches.find(search, {}, function(err, matches) {
		const reply = (err ? {
			status: 'error',
			message: err.message,
		} : {
			status: 'ok',
			matches,
		});

		res.json(reply);
	});
}

module.exports = {
	courts_handler,
	matches_handler,
};
