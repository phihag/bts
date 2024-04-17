'use strict';

// Helper functions for tournaments

const utils = require('./utils');

function get_courts(db, tournament_key, callback) {
	db.courts.find({tournament_key}, function(err, courts) {
		if (err) return callback(err);

		courts.sort(function(c1, c2) {
			return utils.natcmp(('' + c1.num), ('' + c2.num));
		});
		return callback(err, courts);
	});
}

function get_umpires(db, tournament_key, callback) {
	db.umpires.find({tournament_key}, function(err, umpires) {
		if (err) return callback(err);

		umpires.sort(utils.cmp_key('name'));
		return callback(err, umpires);
	});
}

function get_matches(db, tournament_key, callback) {
	db.matches.find({tournament_key}, function(err, matches) {
		if (err) return callback(err);
		return callback(err, matches);
	});
}

function get_tabletoperators(db, tournament_key, callback) {
	db.tabletoperators.find({ tournament_key }, function (err, tabletoperators) {
		if (err) return callback(err);
		return callback(err, tabletoperators);
	});
}

function get_displays(app, tournament_key, callback) {
	app.db.display_court_displaysettings.find({}, function (err, display_court_displaysettings) {
		if (err) return callback(err);

		// TODO: Append not registered Displays and set status online/offline of registered displays by using ite registered ws in bubws
		display_court_displaysettings = display_court_displaysettings.filter(function (obj) {
			return obj.client_id !== 'deleted';
		});

		const bupws = require('./bupws');
		bupws.add_display_status(app, tournament_key, display_court_displaysettings);
		display_court_displaysettings = display_court_displaysettings.sort(utils.cmp_key('client_id'));
		return callback(err, display_court_displaysettings);
	});
}

function get_normalizations(db, tournament_key, callback) {
	db.normalizations.find({}, function (err, normalizations) {
		if (err) return callback(err);
		return callback(err, normalizations);
	});
}

function get_displaysettings(db, tournament_key, callback) {
	db.displaysettings.find({}, function (err, displaysettings) {
		if (err) return callback(err);
		return callback(err, displaysettings);
	});
}


module.exports = {
	get_courts,
	get_matches,
	get_umpires,
	get_tabletoperators,
	get_displays,
	get_normalizations,
	get_displaysettings,
};
