'use strict';

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const async = require('async');
const Datastore = require('nedb');

const utils = require('./utils');

function init(callback) {
	const db = {};
	const TABLES = [
		'courts',
		'event',
		'matches',
		'tournaments',
		'umpires',
		'logs',
	];

	const db_dir = path.join(utils.root_dir(), '/data');
	if (! fs.existsSync(db_dir)) {
		fs.mkdirSync(db_dir);
	}

	const macos_noindex_file = path.join(db_dir, '.metadata_never_index');
	const macos_noindex_fd = fs.openSync(macos_noindex_file, 'a');
	fs.closeSync(macos_noindex_fd);

	const logos_dir = path.join(db_dir, 'logos');
	if (! fs.existsSync(logos_dir)) {
		fs.mkdirSync(logos_dir);
	}

	TABLES.forEach(function(key) {
		db[key] = new Datastore({filename: path.join(db_dir, key), autoload: true});
	});

	db.courts.ensureIndex({fieldName: 'tournament_key', unique: false});
	db.matches.ensureIndex({fieldName: 'court_id', unique: false});
	db.matches.ensureIndex({fieldName: 'tournament_key', unique: false});
	db.matches.ensureIndex({fieldName: 'event_key', unique: false});
	db.tournaments.ensureIndex({fieldName: 'key', unique: true});
	db.umpires.ensureIndex({fieldName: 'name', unique: true});
	db.umpires.ensureIndex({fieldName: 'tournament_key', unique: false});
	db.logs.ensureIndex({fieldName: 'tournament_key', unique: false});

	setup_helpers(db);

	async.parallel([function(cb) {
		setup_autonum(cb, db, 'matches');
	}, function(cb) {
		setup_autonum(cb, db, 'tournaments');
	}], function(err) {
		callback(err, db);
	});
}

function setup_helpers(db) {
	for (const single_database of Object.values(db)) {
		single_database.find_async = promisify(single_database.find);
		single_database.findOne_async = promisify(single_database.findOne);
		single_database.remove_async = promisify(single_database.remove);
		single_database.update_async = (...args) => {
			return new Promise((resolve, reject) => {
				single_database.update(...args, (err, ...results) => {
					if (err) return reject(err);
					return resolve(results);
				});
			});
		};
	}
	db.fetch_all = function() {
		var args = [db];
		for (var i = 0;i < arguments.length;i++) {
			args.push(arguments[i]);
		}
		return fetch_all.apply(null, args);
	};
}

function fetch_all(db, specs, callback) {
	var results = {};
	var done = false;

	specs.forEach(function(spec, index) {
		var queryFunc = spec.queryFunc || 'find';
		if (queryFunc === '_findOne') {
			queryFunc = 'findOne';
		}

		const col = db[spec.collection];
		if (!col && !done) {
			done = true;
			return callback(new Error('Cannot find collection ' + spec.collection));
		}
		col[queryFunc](spec.query, function (err, docs) {
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
	init,
	setup_helpers,
};