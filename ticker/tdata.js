'use strict';

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
				if (m.setup.match_id === c.match_id) {
					c.match = m;
					break;
				}
			}
		}

		app.courts_with_matches = courts;
	});
}

module.exports = {
	recalc,
};
