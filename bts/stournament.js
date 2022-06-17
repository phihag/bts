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


module.exports = {
	get_courts,
	get_matches,
	get_umpires,
};
