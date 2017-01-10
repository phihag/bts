'use strict';
var conn = (function() {
var ws;
var reconnect_duration = 500;
var WS_PATH = '/ws/admin';
var request_id = 1;

var callback_handlers = {};

function _construct_url(abspath) {
    var l = window.location;
    return (
    	((l.protocol === 'https:') ? 'wss://' : 'ws://') +
    	l.hostname +
    	(((l.port !== 80) && (l.port !== 443)) ? ':' + l.port : '') +
    	abspath
    );
}

function handle_message(msg_json) {
	var msg = JSON.parse(msg_json);
	if (!msg) {
		send({
			type: 'error',
			message: 'Could not parse message',
		});
	}

	switch (msg.type) {
	case 'answer':
		cb = callback_handler[msg.rid];
		if (! cb) {
			return;
		}
		cb(null, msg);
		break;
	case 'error':
		on_error('Received error message from BTS: ' + msg.message);
		break;
	default:
		send({
			type: 'error',
			rid: msg.rid,
			message: 'Unsupported message ' + msg.type,
		});
	}
}

function connect(on_status) {
	on_status('connecting');

	ws = new WebSocket(_construct_url(WS_PATH), 'bts-admin');
	ws.onopen = function() {
		on_status('connected');
	};
	ws.onmessage = handle_message;
	ws.onclose = function() {
		// Clear callback handlers
		utils.values(callback_handlers).forEach(function(cb) {
			cb({type: 'disconnected'});
		});
		callback_handlers = {};

		on_status('waiting');
		setTimeout(connect, reconnect_duration, on_status);
	};
}

function ui_on_status(status) {
	if (status === 'connecting') {
		uiu.text_qs('.status', 'Verbindung wird aufgebaut ...');
	} else if (status === 'connected') {
		uiu.text_qs('.status', 'Verbunden.');
	} else if (status === 'waiting') {
		uiu.text_qs('.status', 'Verbindung verloren.');
	}

	uiu.visible_qs('.connecting', (status !== 'connected'));
}

function send(msg, cb) {
	if (! msg.rid) {
		msg.rid = request_id;
		request_id++;
	}
	if (cb) {
		callback_handlers[msg.rid] = cb;
	}
	var msg_json = JSON.stringify(msg);
	ws.send(msg_json);
}

function ui_connect() {
	connect(ui_on_status);
}

return {
	ui_connect: ui_connect,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var WebSocket = require('ws');
	var uiu = null; // UI only

	module.exports = conn;
}
/*/@DEV*/
