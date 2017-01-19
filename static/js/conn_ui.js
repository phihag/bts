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
	c.send({
		type: 'tournament_list',
	}, function(err, list) {
		console.log('err/list', err, list);
	});
}


return {
	ui_connect: ui_connect,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var conn = require('./conn');
	var uiu = null; // UI only

	module.exports = conn_ui;
}
/*/@DEV*/
