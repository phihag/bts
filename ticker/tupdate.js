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

	tdata.set(app, msg.event, (err) => {
		if (err) {
			serror.silent('Failed tset: ' + err.message + ' ' + err.stack);
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
	on_close,
	on_connect,
};