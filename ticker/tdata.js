'use strict';

const async = require('async');

const utils = require('../bts/utils');

function prepare_mustache(m) {
	m.p0str = m.p0.join('\n');
	m.p1str = m.p1.join('\n');
	const max_game_count = 3; // TODO look it up from counting
	m.gamesplus2 = max_game_count + 2;
	const game_ids = utils.range(max_game_count);
	for (const team_id of [0, 1]) {
		m['team' + team_id + 'scores'] = game_ids.map((game_idx) => {
			if (!m.s) return '';
			const gs = m.s[game_idx] ;
			return gs ? gs[team_id] : '';
		});
	}

	if (m.n) {
		m.n = m.n.replace(' - Qualification', 'Q');
	}
}

function recalc(app, cb) {
	app.db.fetch_all([{
		collection: 'tcourts',
	}, {
		collection: 'tmatches',
	}, {
		queryFunc: 'findOne',
		collection: 'ttournaments',
		query: {
			_id: '__main__',
		},
	}], function(err, courts, matches, tournament) {
		if (err) return cb(err);

		courts.sort((c1, c2) => utils.cmp(parseInt(c1.num), parseInt(c2.num)));

		for (const c of courts) {
			if (!c.match_id) {
				continue;
			}
			for (const m of matches) {
				if (m._id === c.match_id) {
					c.match = m;
					prepare_mustache(m);
					break;
				}
			}
		}

		const td = {
			courts_with_matches: courts,
		};
		if (tournament && tournament.last_update) {
			td.last_update_str = utils.format_ts(tournament.last_update);
		}

		app.ticker_data = td;
	});
}

function set(app, event, cb) {
	// Test that data is complete
	for (const m of event.matches) {
		if (!m._id) {
			return cb(new Error('Missing match ID'));
		}
	}
	for (const c of event.courts) {
		if (!c._id) {
			return cb(new Error('Missing court ID'));
		}
	}

	const now = Date.now();
	const db = app.db;
	async.waterfall([
		(cb) => {
			async.each(event.matches, (match, cb) => {
				db.tmatches.update({
					_id: match._id,
				}, match, {
					upsert: true,
				}, (err) => cb(err));
			}, (err) => cb(err));
		},
		(cb) => {
			db.tcourts.remove({}, {multi: true}, err => cb(err));
		},
		(cb) => {
			async.each(event.courts, (court, cb) => {
				if (!court.match_id) {
					court.match_id = false;
				}
				db.tcourts.insert(court, (err) => cb(err));
			}, (err) => cb(err));
		},
		(cb) => {
			db.ttournaments.update({_id: '__main__'}, {
				_id: '__main__',
				last_update: now,
				nation_competition: event.nation_competition,
			}, {upsert: true}, (err) => cb(err));
		},
		(cb) => {
			recalc(app, cb);
		},
	], (err) => {
		cb(err);
	});
}

function update_match(app, match, cb) {
	if (!match._id) {
		return cb(new Error('Missing match ID'));
	}

	const now = Date.now();
	const db = app.db;
	async.waterfall([
		(cb) => {
			db.tmatches.update({
				_id: match._id,
			}, {$set: match}, {}, (err) => cb(err));
		},
		(cb) => {
			db.ttournaments.update({_id: '__main__'}, {
				_id: '__main__',
				last_update: now,
			}, {upsert: true}, (err) => cb(err));
		},
		(cb) => {
			recalc(app, cb);
		},
	], (err) => {
		cb(err);
	});
}

module.exports = {
	recalc,
	set,
	update_match,
};
