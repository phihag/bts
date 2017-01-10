'use strict';
var conn = (function() {
var ws;
var reconnect_duration = 500;
var WS_PATH = '/ws/admin';

function _construct_url(abspath) {
    var l = window.location;
    return (
    	((l.protocol === 'https:') ? 'wss://' : 'ws://') +
    	l.hostname +
    	(((l.port !== 80) && (l.port !== 443)) ? ':' + l.port : '') +
    	abspath
    );
}

function connect(on_status) {
	on_status('connecting');
	ws = new WebSocket(_construct_url(WS_PATH), 'bts-admin');
	ws.onopen = function() {
		on_status('connected');
	};
	ws.onclose = function() {
		on_status('waiting');
		setTimeout(connect, reconnect_duration, on_status);
	};
}

function ui_on_status(status) {
	uiu.visible_qs('.connecting', (status !== 'connected'));
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
