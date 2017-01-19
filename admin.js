'use strict';

function handle_keepalive(app, ws, msg) {
	// TODO
}

function handle_tournament_list(app, ws, msg) {
	app.db.tournaments.find({}, function(err, tournaments) {
		ws.respond(msg, err, {
			tournaments: tournaments,
		});
	});
}

function on_connect(app, ws) {
	// Ignore for now: nice to know that you're connected, but has no effect on system state
	// We could initialize state here though, by attaching it to ws
}

function on_close() {
	// Ignore: Does not matter when an admin disconnects
}


module.exports = {
	on_connect,
	on_close,
	handle_tournament_list,
};