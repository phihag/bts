'use strict';

const async = require('async');

const admin = require('./admin');
const stournament = require('./stournament');
const utils = require('./utils');


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
	const query = {
		tournament_key,
	};
	if (req.query.court) {
		query['setup.court_id'] = req.query.court;
	} else {
		query['setup.court_id'] = {$exists: true};
	}

	req.app.db.fetch_all([{
		queryFunc: '_findOne',
		collection: 'tournaments',
		query: {key: tournament_key},
	}, {
		collection: 'matches',
		query,
	}, {
		collection: 'courts',
		query: {tournament_key},
	}], function(err, tournament, db_matches, db_courts) {
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

		db_courts.sort(utils.cmp_key('num'));
		const courts = db_courts.map(function(dc) {
			var res = {
				court_id: dc._id,
				label: dc.num,
			};
			if (dc.match_id) {
				res.match_id = 'bts_' + dc.match_id;
			}
			return res;
		});

		const event = {
			id: 'bts_' + tournament_key,
			tournament_name: tournament.name,
			matches,
			courts,
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

	const court_q = {
		tournament_key,
		_id: req.body.court_id,
	};
	const db = req.app.db;

	async.waterfall([
		cb => db.matches.update(query, {$set: update}, {}, err => cb(err)),
		cb => db.courts.findOne(court_q, (err, court) => cb(err, court)),
		(court, cb) => {
			if (court.match_id === match_id) {
				cb();
				return;
			}

			admin.notify_change(req.app, tournament_key, 'court_current_match', {
				match_id,
				court_id: court._id,
			});
			db.courts.update(court_q, {$set: {match_id: match_id}}, {}, err => cb(err));
		},
	], function(err) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		admin.notify_change(req.app, tournament_key, 'score', {
			match_id,
			network_score: update.network_score,
			team1_won: update.team1_won,
		});
		res.json({status: 'ok'});
	});
}
module.exports = {
	courts_handler,
	matches_handler,
	score_handler,
};
