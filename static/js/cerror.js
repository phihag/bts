'use strict';
// Do not use const; this is public-facing as part of the ticker

var cerror = (function() {

var REPORT_URL = 'https://aufschlagwechsel.de/bupbug/';
var count = -1;
var error_list = [];
var report_enabled = true;

function show(msg) {
	error_list.push(msg);
	if (typeof uiu !== 'undefined') {
		uiu.show_qs('.errors');
		uiu.text_qs('.errors', error_list.join('\n'));
	}
}

function get_platform_info() {
	return {
		size: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
		ua: window.navigator.userAgent,
	};
}

function on_error(msg, script_url, line, col, err) {
	show(msg);

	if (! report_enabled) {
		return;
	}

	count++;
	if (count > 5) {
		return;
	}

	var report = {
		msg,
		count,
		_type: 'bts-error',
		bts_type: 'client',
		platform: get_platform_info(),
	};
	if (script_url !== undefined) {
		report.script_url = script_url;
	}
	if (line !== undefined) {
		report.line = line;
	}
	if (col !== undefined) {
		report.col = col;
	}
	if (err) {
		report.stack = err.stack;
	}

	var report_json = JSON.stringify(report);
	var xhr = new XMLHttpRequest();
	xhr.open('POST', REPORT_URL, true);
	xhr.setRequestHeader('Content-type', 'text/plain');  // To be a simple CORS request (avoid CORS preflight)
	xhr.send(report_json);
}

function silent(msg) {
	console.error(msg); // eslint-disable-line no-console
	on_error(msg, undefined, undefined, undefined, new Error());
}

function net(err)  {
	silent(err.message);
}

function init() {
	var report_enabled_json = document.getElementById('bts-data-holder').getAttribute('data-error-reporting');
	try {
		report_enabled = JSON.parse(report_enabled_json);
	} catch(e) {
		var msg = 'Error reporting JSON invalid: ' + report_enabled_json;
		silent(msg);
		return;
	}
	if (report_enabled === null) {
		var msg = 'Error reporting not configured';
		silent(msg);
		return;
	}
	if (report_enabled) {
		window.onerror = on_error;
	}
}

return {
	init,
	net,
	on_error,
	silent,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var uiu = null; // UI only

	module.exports = cerror;
}
/*/@DEV*/
