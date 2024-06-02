'use strict';

const serror = require('../bts/serror');

const tdata = require('./tdata');


/**
* Returns true iff everything is ok.
*/
function _require_msg(ws, msg, fields) {
	for (const f of fields) {
		if (typeof msg[f] === 'undefined') {
			ws.respond(msg, {message: 'Missing required field ' + f + ' in message ' + msg.type});
			return false;
		}
	}
	return true;
}

function handle_tset(app, ws, msg) {
	if (!_require_msg(ws, msg, ['event'])) {
		return;
	}
	if (msg.event.tournament_name) {
		app.config.tournament_name = msg.event.tournament_name;
	}
	if (msg.event.tournament_url) {
		app.config.note_html = "Alle Spiele auf <a href=\"" + msg.event.tournament_url+"\" target='_blank'>Turnier.de</a>";
	}
	tdata.set(app, msg.event, (err) => {
		if (err) {
			serror.silent('Failed tset: ' + err.message + ' ' + err.stack);
		}
		ws.respond(msg, err);
	});
}

function handle_tupdate_match(app, ws, msg) {
	if (!_require_msg(ws, msg, ['match'])) {
		return;
	}

	tdata.update_match(app, msg.match, (err) => {
		if (err) {
			serror.silent('Failed tupdate_match: ' + err.message + ' ' + err.stack);
		}
		ws.respond(msg, err);
	});
}

function on_connect(/*app, ws*/) {
	
}

function on_close(/*app, ws*/) {
	
}


module.exports = {
	handle_tset,
	handle_tupdate_match,
	on_close,
	on_connect,
};