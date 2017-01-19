'use strict';

var conn_ui = (function() {
var c = conn(ui_on_status);

function ui_on_status(status) {
	var text = {
		connecting: 'Verbindung wird aufgebaut ...',
		connected: 'Verbunden.',
		waiting: 'Verbindung verloren.',
	}[status.code];
	if (status.code === 'error') {
		text = 'Fehler: ' + status.message;
	}
	if (!text) {
		text = 'Unsupported status: ' + status.code;
	}

	uiu.text_qs('.status', text);
	uiu.visible_qs('.connecting', (status.code === 'connecting') || (status.code === 'waiting'));

	if (status.code === 'connected') {
		on_connect();
	}
}

function ui_connect() {
	c.connect();
}

function on_connect() {
	ctournament.init();
}

function send(msg, cb) {
	c.send(msg, cb);
}

return {
	ui_connect: ui_connect,
	send: send,
};

})();

function send(msg, cb) {
	conn_ui.send(msg, cb);
}

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var conn = require('./conn');
	var ctournament = require('./ctournament');
	var uiu = null; // UI only

	module.exports = conn_ui;
}
/*/@DEV*/
