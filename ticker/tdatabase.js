'use strict';

const fs = require('fs');
const path = require('path');

const Datastore = require('nedb');

const utils = require('../bts/utils');
const database = require('../bts/database');


function init(callback) {
	const db = {};
	const TABLES = [
		'tcourts',
		'tmatches',
	];

	const db_dir = path.join(utils.root_dir(), '/ticker_data');
	if (! fs.existsSync(db_dir)) {
		fs.mkdirSync(db_dir);
	}

	TABLES.forEach(function(key) {
		db[key] = new Datastore({filename: db_dir + '/' + key, autoload: true});
	});

	database.setup_helpers(db);

	callback(null, db);
}

module.exports = {
	init: init,
};