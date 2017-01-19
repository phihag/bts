'use strict';

var state = {};

function init() {
	conn_ui.ui_connect();
}

document.addEventListener('DOMContentLoaded', init);


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    var conn_ui = require('./conn_ui');
}
/*/@DEV*/
