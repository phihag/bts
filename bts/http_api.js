'use strict';

const assert = require('assert');
const async = require('async');
const path = require('path');

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
				$and: [
					{
						team1_won: {
							$ne: true,
						},
					},
					{
						team1_won: {
							$ne: false,
						},
					},
				],
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
			setup.team_competition = tournament.is_team;
			setup.nation_competition = tournament.is_nation_competition;
			for (const t of setup.teams) {
				if (!t.players) continue;

				for (const p of t.players) {
					if (p.lastname) continue;

					const m = /^(.*)\s+(\S+)$/.exec(p.name);
					if (m) {
						p.firstname = m[1];
						p.lastname = m[2];
					} else {
						p.firstname = '';
						p.lastname = p.name;
					}
				}
			}
			return {
				setup,
				presses_json: JSON.stringify(dm.presses),
				network_score: dm.network_score,
				network_team1_serving: dm.network_team1_serving,
				network_teams_player1_even: dm.network_teams_player1_even,
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

function matchinfo_handler(req, res) {
	const tournament_key = req.params.tournament_key;
	const match_id = req.params.match_id;

	const query = {
		tournament_key,
		_id: match_id,
	};

	req.app.db.fetch_all([{
		collection: 'matches',
		query,
	}], function(err, match) {
		if (err) {
			res.json({
				status: 'error',
				message: err.message,
			});
			return;
		}

		if (!match) {
			res.json({
				status: 'error',
				message: 'Cannot find match',
			});
			return;
		}

		const reply = {
			status: 'ok',
			match,
		};
		res.header('Content-Type', 'application/json');
        res.send(JSON.stringify(reply, null, 4));
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
		network_teams_player1_even: req.body.network_teams_player1_even,
		team1_won: req.body.team1_won,
		presses: req.body.presses,
		duration_ms: req.body.duration_ms,
		end_ts: req.body.end_ts,
	};
	if (update.team1_won !== undefined) {
		update.btp_winner = (update.team1_won === true) ? 1 : 2;
		update.btp_needsync = true;
	}
	if (req.body.shuttle_count) {
		update.shuttle_count = req.body.shuttle_count;
	}

	const court_q = {
		tournament_key,
		_id: req.body.court_id,
	};
	const db = req.app.db;
 
	async.waterfall([
		cb => db.matches.update(query, {$set: update}, {returnUpdatedDocs: true}, (err, _, match) => cb(err, match)),
		(match, cb) => {
			if (!match) {
				return cb(new Error('Cannot find match ' + JSON.stringify(match)));
			}
			return cb(null, match);
		},
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
			shuttle_count: update.shuttle_count,
		});
		res.json({status: 'ok'});
	});
}

function logo_handler(req, res) {
	const {tournament_key, logo_id} = req.params;
	assert(tournament_key);
	assert(logo_id);
	const m = /^[-0-9a-f]+\.(gif|png|jpg|jpeg|svg|webp)$/.exec(logo_id);
	assert(m, `Invalid logo ${logo_id}`);
	const mime = {
		gif: 'image/gif',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		svg: 'image/svg+xml',
		webp: 'image/webp',
	}[m[1]];
	assert(mime, `Unsupported ext ${JSON.stringify(m[1])}`);

	const fn = path.join(utils.root_dir(), 'data', 'logos', path.basename(logo_id));
	res.setHeader('Content-Type', mime);
	res.sendFile(fn);
}

module.exports = {
	courts_handler,
	logo_handler,
	matches_handler,
	matchinfo_handler,
	score_handler,
};
