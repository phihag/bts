'use strict';

const async = require('async');

function recalc(app, cb) {
	app.db.fetch_all([{
		collection: 'tcourts',
	}, {
		collection: 'tmatches',
	}], function(err, courts, matches) {
		if (err) return cb(err);

		for (const c of courts) {
			if (!c.match_id) {
				continue;
			}
			for (const m of matches) {
				if (m._id === c.match_id) {
					c.match = m;
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
				});
			}, (err) => cb(err));
		},
		(cb) => {
			async.each(event.courts, (court, cb) => {
				db.tcourts.update({
					_id: court._id,
				}, court, {
					upsert: true,
				});
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
