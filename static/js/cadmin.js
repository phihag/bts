'use strict';

var state = {};

function init() {
	cerror_reporting.init();
	conn_ui.ui_connect();
}

document.addEventListener('DOMContentLoaded', init);


/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    const conn_ui = require('./conn_ui');
    const cerror_reporting = require('./cerror_reporting');
}
/*/@DEV*/
