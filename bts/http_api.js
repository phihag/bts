'use strict';

const async = require('async');

const admin = require('./admin');
const btp_manager = require('./btp_manager');
const stournament = require('./stournament');
const ticker_manager = require('./ticker_manager');
const utils = require('./utils');

// Returns true iff all params are met
function _require_params(req, res, keys) {
	for (const k of keys) {
		if (! req.body.hasOwnProperty(k)) {
			res.json({
				status: 'error',
				message: 'Missing field ' + k + ' in request',
			});
			return false;
		}
	}
	return true;
}

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
	const now = Date.now();
	const show_still = now - 60000;
	const query = {
		tournament_key,
		$or: [
			{
				team1_won: null,
			},
			{
				end_ts: {
					$gt: show_still,
				},
			},
		],
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
				network_team1_serving: dm.network_team1_serving,
				network_teams_player1_even: dm.teams_player1_even,
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
	if (!_require_params(req, res, ['duration_ms', 'end_ts', 'network_score', 'team1_won', 'presses'])) return;

	const tournament_key = req.params.tournament_key;
	const match_id = req.params.match_id;
	const query = {
		_id: match_id,
		tournament_key,
	};
	const update = {
		network_score: req.body.network_score,
		network_team1_serving: req.body.network_team1_serving,
		network_teams_player1_even: req.body.teams_player1_even,
		team1_won: req.body.team1_won,
		presses: req.body.presses,
		duration_ms: req.body.duration_ms,
		end_ts: req.body.end_ts,
	};
	if (update.team1_won !== undefined) {
		update.btp_winner = (update.team1_won === true) ? 1 : 2;
		update.btp_needsync = true;
	}

	const court_q = {
		tournament_key,
		_id: req.body.court_id,
	};
	const db = req.app.db;
 
	async.waterfall([
		cb => db.matches.update(query, {$set: update}, {returnUpdatedDocs: true}, (err, _, match) => cb(err, match)),
		(match, cb) => db.courts.findOne(court_q, (err, court) => cb(err, match, court)),
		(match, court, cb) => {
			if (court.match_id === match_id) {
				cb(null, match, court, false);
				return;
			}

			db.courts.update(court_q, {$set: {match_id: match_id}}, {}, (err) => {
				cb(err, match, court, true);
			});
		},
		(match, court, changed_court, cb) => {
			if (changed_court) {
				admin.notify_change(req.app, tournament_key, 'court_current_match', {
					match_id,
					court_id: court._id,
				});
			}
			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			btp_manager.update_score(req.app, match);

			cb(null, match, changed_court);
		},
		(match, changed_court, cb) => {
			if (changed_court) {
				ticker_manager.pushall(req.app, tournament_key);
			} else {
				ticker_manager.update_score(req.app, match);
			}

			cb();
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
