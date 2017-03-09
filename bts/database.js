'use strict';

const fs = require('fs');
const path = require('path');

const async = require('async');
const Datastore = require('nedb');

const utils = require('./utils');

function init(callback) {
	var db = {};
	const TABLES = [
		'courts',
		'matches',
		'tournaments',
	];

	var db_dir = path.join(utils.root_dir(), '/data');
	if (! fs.existsSync(db_dir)) {
		fs.mkdirSync(db_dir);
	}

	TABLES.forEach(function(key) {
		db[key] = new Datastore({filename: db_dir + '/' + key, autoload: true});
	});

	db.tournaments.ensureIndex({fieldName: 'key', unique: true});
	db.courts.ensureIndex({fieldName: 'tournament_key', unique: false});
	db.matches.ensureIndex({fieldName: 'tournament_key', unique: false});
	db.matches.ensureIndex({fieldName: 'court_id', unique: false});

	db.fetch_all = function() {
		var args = [db];
		for (var i = 0;i < arguments.length;i++) {
			args.push(arguments[i]);
		}
		return fetch_all.apply(null, args);
	};

	async.parallel([function(cb) {
		setup_autonum(cb, db, 'matches');
	}, function(cb) {
		setup_autonum(cb, db, 'tournaments');
	}], function(err) {
		if (err) {
			throw err;
		}
		callback(db);
	});

}

function fetch_all(db, specs, callback) {
	var results = {};
	var done = false;

	specs.forEach(function(spec, index) {
		var queryFunc = spec.queryFunc || 'find';
		if (queryFunc === '_findOne') {
			queryFunc = 'findOne';
		}

		db[spec.collection][queryFunc](spec.query, function (err, docs) {
			if (done) {
				return;  // Error occured already
			}
			if (err) {
				done = true;
				return callback(err, null);
			}

			if ((spec.queryFunc == '_findOne') && !docs) {
				done = true;
				return callback(new Error('Cannot find one of ' + spec.collection));
			}

			results['r' + index] = docs;
			if (utils.size(results) == specs.length) {
				done = true;
				var args = [null];
				specs.forEach(function(spec, index) {
					args.push(results['r' + index]);
				});
				return callback.apply(null, args);
			}
		});
	});
}

function setup_autonum(callback, db, collection, start) {
	var idx = (start === undefined) ? 0 : start;
	db[collection].autonum = function() {
		idx++;
		return '' + idx;
	};

	db[collection].find({}, function(err, docs) {
		if (err) {
			callback(err);
		}

		docs.forEach(function(doc) {
			idx = Math.max(idx, doc._id);
		});

		return callback();
	});
}

module.exports = {
	init: init,
};