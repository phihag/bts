'use strict';

var cerror_reporting = (function() {
const REPORT_URL = 'https://aufschlagwechsel.de/bupbug/';
var count = -1;

function get_platform_info() {
	return {
		size: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
		ua: window.navigator.userAgent,
	};
}

function on_error(msg, script_url, line, col, err) {
	count++;
	if (count > 5) {
		return;
	}

	const report = {
		msg,
		script_url,
		line,
		col,
		count,
		_type: 'bts-error',
		bts_type: 'client',
		platform: get_platform_info(),
	};
	if (err) {
		report.stack = err.stack;
	}

	const report_json = JSON.stringify(report);
	const xhr = new XMLHttpRequest();
	xhr.open('POST', REPORT_URL, true);
	xhr.setRequestHeader('Content-type', 'text/plain');  // To be a simple CORS request (avoid CORS preflight)
	xhr.send(report_json);
}


function init() {
	const is_active_json = document.getElementById('bts-data-holder').getAttribute('data-error-reporting');
	try {
		var is_active = JSON.parse(is_active_json);
		
	} catch(e) {
		const msg = 'Error reporting JSON invalid: ' + is_active_json;
		console.error(msg); // eslint-disable-line no-console
		on_error(msg);
		return;
	}
	if (is_active === null) {
		const msg = 'Error reporting not configured';
		console.error(msg); // eslint-disable-line no-console
		on_error(msg);
	}
	if (is_active) {
		window.onerror = on_error;
	}
}

return {
	on_error,
	init,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
    module.exports = cerror_reporting;
}
/*/@DEV*/
