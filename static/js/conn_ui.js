'use strict';

var conn_ui = (function() {
var c = conn(ui_on_status, ui_on_change);

function ui_on_status(status) {
	var text = {
		connecting: ci18n('Connecting ...'),
		connected: ci18n('Connected'),
		waiting: ci18n('Connection lost'),
	}[status.code];
	if (status.code === 'error') {
		text = 'Fehler: ' + status.message;
	}
	if (!text) {
		text = 'Unsupported status: ' + status.code;
	}

	ctournament.bts_status_changed({ val: { status: status.code, message: text } })
	
	uiu.visible_qs('.connecting', (status.code === 'connecting') || (status.code === 'waiting'));

	if (status.code === 'connected') {
		on_connect();
	}
}

function ui_on_change(c) {
	crouting.on_change(c);
}

function ui_connect() {
	c.connect();
}

function on_connect() {
	crouting.init();
}

function send(msg, cb) {
	c.send(msg, cb);
}

return {
	ui_connect: ui_connect,
	send: send,
};

})();

function send(msg, cb) { // eslint-disable-line no-unused-vars
	conn_ui.send(msg, cb);
}

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var ci18n = require('./ci18n');
	var conn = require('./conn');
	var crouting = require('./crouting');
	var ctournament = require('./ctournament');
	var uiu = null; // UI only

	module.exports = conn_ui;
}
/*/@DEV*/
