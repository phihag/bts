'use strict';

function handle(mod, app, ws) {
	function _ws_sendmsg(msg) {
		const msg_json = JSON.stringify(msg);
		ws.send(msg);
	}
	ws.sendmsg = _ws_sendmsg;

	ws.on('message', function(msg_json) {
		try {
			const msg = JSON.parse(msg_json);
			if (!msg || !msg.type) {
				ws.sendmsg({
					type: 'error',
					message: 'invalid JSON or type missing',
				});
			}

			const func = mod['handle_' + msg.type];
			if (! func) {
				ws.sendmsg({
					type: 'error',
					message: 'Unsupported message type ' + msg.type,
				});
				return;
			}

			func(app, ws);
		} catch (e) {
			console.error('Error in message handler', e);
			return;
		}
	});
	ws.on('close', function() {
		mod.on_close(app, ws);
	});
}

module.exports = {
	handle,
};