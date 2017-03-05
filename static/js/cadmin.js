'use strict';

var state = {}; // eslint-disable-line no-unused-vars

function init() {
	cerror.init();
	conn_ui.ui_connect();
}

document.addEventListener('DOMContentLoaded', init);


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    var conn_ui = require('./conn_ui');
    var cerror = require('./cerror');
}
/*/@DEV*/
