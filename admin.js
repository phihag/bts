'use strict';

const async = require('async');

const utils = require('./utils');

function _tournament_get_courts(db, tournament_key, callback) {
	db.courts.find({tournament_key: tournament_key}, function(err, courts) {
		if (err) return callback(err);

		courts.sort(function(c1, c2) {
			return utils.natcmp(('' + c1.num), ('' + c2.num));
		});
		return callback(err, courts);
	});
}

function handle_tournament_list(app, ws, msg) {
	app.db.tournaments.find({}, function(err, tournaments) {
		async.map(tournaments, function(t, cb) {
			_tournament_get_courts(app.db, t.key, function(err, courts) {
				if (err) return cb(err);

				t.courts = courts;
				cb(null, t);
			});
		}, function(err, tournaments) {
			ws.respond(msg, err, {
				tournaments,
			});			
		});
	});
}

function handle_tournament_edit(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (! msg.change) {
		return ws.respond(msg, {message: 'Missing change'});
	}

	const key = msg.key;
	const change = utils.pluck(msg.change, ['name']);

	app.db.tournaments.update({key}, {$set: change}, {returnUpdatedDocs: true}, function(err, num, tournament) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		_tournament_get_courts(app.db, tournament.key, function(err, courts) {
			tournament.courts = courts;
			ws.respond(msg, err, {tournament});
		});
	});
}

function handle_courts_add(app, ws, msg) {
	if (! msg.tournament_key) {
		return ws.respond(msg, {message: 'Missing tournament_key'});
	}
	if (! msg.nums) {
		return ws.respond(msg, {message: 'Missing nums'});
	}

	const added_courts = msg.nums.map(num => {
		return {
			_id: msg.tournament_key + '_' + num,
			tournament_key: msg.tournament_key,
			num,
		};
	});
	app.db.courts.insert(added_courts, function(err) {
		ws.respond(msg, err, {added_courts});
	});
}

function handle_tournament_get(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}

	app.db.tournaments.findOne({key: msg.key}, function(err, tournament) {
		if (!err && !tournament) {
			err = {message: 'No tournament ' + msg.key};
		}
		if (err) {
			ws.respond(msg, err);
			return;
		}

		_tournament_get_courts(app.db, tournament.key, function(err, courts) {
			tournament.courts = courts;
			ws.respond(msg, err, {tournament});
		});
	});
}

function handle_create_tournament(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}

	const t = {
		key: msg.key,
	};

	app.db.tournaments.insert(t, function(err, inserted_t) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		_tournament_get_courts(app.db, inserted_t.key, function(err, courts) {
			inserted_t.courts = courts;
			ws.respond(msg, err, inserted_t);
		});
	});
}

function on_connect(/*app, ws*/) {
	// Ignore for now: nice to know that you're connected, but has no effect on system state
	// We could initialize state here though, by attaching it to ws
}

function on_close() {
	// Ignore: Does not matter when an admin disconnects
}


module.exports = {
	handle_create_tournament,
	handle_courts_add,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit,
	on_close,
	on_connect,
};