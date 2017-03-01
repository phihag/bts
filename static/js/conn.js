'use strict';
var conn = (function(on_status) {
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

function handle_message(ws_msg) {
    var msg_json = ws_msg.data;
    console.log('>', msg_json)
    var msg = JSON.parse(msg_json);
    if (!msg) {
        send({
            type: 'error',
            message: 'Could not parse message',
        });
    }

    switch (msg.type) {
    case 'answer':
        var cb = callback_handlers[msg.rid];
        if (! cb) {
            return;
        }
        if (cb(null, msg) !== 'keep') {
            delete callback_handlers[msg.rid];
        }
        break;
    case 'error':
        if (msg.rid && callback_handlers[msg.rid]) {
            delete callback_handlers[msg.rid];
        }
        on_status({
            code: 'error',
            message: 'Received error message from BTS: ' + msg.message,
        });
        break;
    default:
        send({
            type: 'error',
            rid: msg.rid,
            message: 'Unsupported message ' + msg.type,
        });
    }
}

function connect() {
    on_status({
        code: 'connecting',
    });

    ws = new WebSocket(_construct_url(WS_PATH), 'bts-admin');
    ws.onopen = function() {
        on_status({
            code: 'connected',
        });
    };
    ws.onmessage = handle_message;
    ws.onclose = function() {
        // Clear callback handlers
        utils.values(callback_handlers).forEach(function(cb) {
            cb({type: 'disconnected'});
        });
        callback_handlers = {};

        on_status({
            code: 'waiting',
        });
        setTimeout(connect, reconnect_duration);
    };
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
    console.log('<', msg_json);
    ws.send(msg_json);
}

return {
    connect: connect,
    send: send,
};

});

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    var WebSocket = require('ws');

    var on_error = require('./on_error');
    var utils = require('../bup/bup/js/utils.js');

    module.exports = conn;
}
/*/@DEV*/
