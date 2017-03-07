'use strict';

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
		ws.respond(msg, err, {tournaments});
	});
}

function handle_tournament_edit_props(app, ws, msg) {
	if (! msg.key) {
		return ws.respond(msg, {message: 'Missing key'});
	}
	if (! msg.props) {
		return ws.respond(msg, {message: 'Missing props'});
	}

	const key = msg.key;
	const props = utils.pluck(msg.props, ['name']);

	app.db.tournaments.update({key}, {$set: props}, {}, function(err) {
		if (err) {
			ws.respond(msg, err);
			return;
		}
		_notify_change(app, key, 'props', props);
		ws.respond(msg, err);
	});
}

function handle_courts_add(app, ws, msg) {
	if (! msg.tournament_key) {
		return ws.respond(msg, {message: 'Missing tournament_key'});
	}
	const tournament_key = msg.tournament_key;
	if (! msg.nums) {
		return ws.respond(msg, {message: 'Missing nums'});
	}

	const added_courts = msg.nums.map(num => {
		return {
			_id: tournament_key + '_' + num,
			tournament_key,
			num,
		};
	});
	app.db.courts.insert(added_courts, function(err) {
		if (err) {
			ws.respond(msg, err);
			return;
		}

		_tournament_get_courts(app.db, tournament_key, function(err, all_courts) {
			_notify_change(app, tournament_key, 'courts_changed', {all_courts});
			ws.respond(msg, err, {});
		});
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

const all_admins = [];
function _notify_change(app, tournament_key, ctype, val) {
	for (const admin_ws of all_admins) {
		admin_ws.sendmsg({
			type: 'change',
			tournament_key,
			ctype,
			val,
		});
	}
}

function on_connect(app, ws) {
	all_admins.push(ws);
}

function on_close(app, ws) {
	if (! utils.remove(all_admins, ws)) {
		console.error('Removing admin ws, but it was not connected!?');
	}
}


module.exports = {
	handle_create_tournament,
	handle_courts_add,
	handle_tournament_get,
	handle_tournament_list,
	handle_tournament_edit_props,
	on_close,
	on_connect,
};