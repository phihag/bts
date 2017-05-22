'use strict';

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

function handle_hello(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key', 'id', 'setup'])) {
		return;
	}

	// TODO
}

function handle_update(app, ws, msg) {
	if (!_require_msg(ws, msg, ['tournament_key'])) {
		return;
	}

	// TODO
	ws.respond(msg);
}

function on_connect(app, ws) {
	
}

function on_close(app, ws) {
	
}


module.exports = {
	handle_hello,
	handle_update,
	on_close,
	on_connect,
};