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
	const query = {tournament_key};
	if (req.query.court) {
		query['setup.court_id'] = req.query.court;
	}

	req.app.db.fetch_all([{
		queryFunc: '_findOne',
		collection: 'tournaments',
		query: {key: tournament_key},
	}, {
		collection: 'matches',
		query,
	}], function(err, tournament, db_matches) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		const matches = db_matches.map(function(dm) {
			const setup = dm.setup;
			setup.match_id = 'bts_' + dm._id;
			return {
				setup,
				presses_json: JSON.stringify(dm.presses),
				network_score: dm.network_score,
			};
		});

		const event = {
			id: 'bts_' + tournament_key,
			tournament_name: tournament.name,
			matches,
		};

		const reply = {
			status: 'ok',
			event,
		};
		res.json(reply);
	});
}

function score_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	const match_id = req.params.match_id;
	const query = {
		_id: match_id,
		tournament_key,
	};
	const update = {
		network_score: req.body.network_score,
		team1_won: req.body.team1_won,
		presses: req.body.presses,
	};

	req.app.db.matches.update(query, {$set: update}, {}, function(err) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		res.json({status: 'ok'});
	});
}
module.exports = {
	courts_handler,
	matches_handler,
	score_handler,
};
