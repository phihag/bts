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
			const gs = m.s[game_idx];
			return gs ? gs[team_id] : '';
		});
	}
}

function recalc(app, cb) {
	app.db.fetch_all([{
		collection: 'tcourts',
	}, {
		collection: 'tmatches',
	}], function(err, courts, matches) {
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

		app.courts_with_matches = courts;
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
			async.each(event.courts, (court, cb) => {
				db.tcourts.update({
					_id: court._id,
				}, court, {
					upsert: true,
				}, (err) => cb(err));
			}, (err) => cb(err));
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
};
