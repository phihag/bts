'use strict';

const serror = require('./serror');


function handle(mod, app, ws) {
	function _ws_sendmsg(msg) {
		const msg_json = JSON.stringify(msg);
		ws.send(msg_json);
	}
	ws.sendmsg = _ws_sendmsg;

	function _respond(request, err, response) {
		if (err) {
			response = {
				type: 'error',
				message: err.message,
			};
		}
		if (! response) {
			response = {
				status: 'ok',
			};
		}
		if (!response.type) {
			response.type = 'answer';
		}
		response.rid = request.rid;
		ws.sendmsg(response);
	}
	ws.respond = _respond;

	mod.on_connect(app, ws);

	ws.on('message', function(msg_json) {
		try {
			const msg = JSON.parse(msg_json);
			if (!msg || !msg.type) {
				ws.sendmsg({
					type: 'error',
					message: 'invalid JSON or type missing',
				});
			}

			if (msg.type === 'error') {
				serror.silent('Received error message from client: ' + msg.message);
				return;
			}

			const func = mod['handle_' + msg.type];
			if (func) {
				func(app, ws, msg);
				return;
			}

			const promise_func = mod['async_handle_' + msg.type];
			if (promise_func) {
				(async() => {
					try {
						await promise_func(app, ws, msg);
					} catch(e) {
						serror.silent('Error in async message handler: ' + e.stack);
						return;
					}
				})();
				return;
			}

			ws.sendmsg({
				type: 'error',
				message: 'Unsupported message type ' + msg.type,
				rid: msg.rid,
			});
		} catch (e) {
			serror.silent('Error in message handler: ' + e.stack);
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