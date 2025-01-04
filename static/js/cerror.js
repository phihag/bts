'use strict';
// Do not use const; this is public-facing as part of the ticker

var cerror = (function() {


	var error_list = [];
	var report_enabled = true;

	function show(msg) {
		error_list.unshift(msg);
		if (typeof uiu !== 'undefined') {
			try {
				uiu.show_qs('.errors');
				uiu.text_qs('.errors', error_list.join('\n'));
			} catch (e) { }
		}
	}


	function on_error(msg, script_url, line, col, err) {
		show(msg);
	}

	function silent(msg) {
		console.error(msg);
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
			silent('Error reporting JSON invalid: ' + report_enabled_json);
			return;
		}
		if (report_enabled === null) {
			silent('Error reporting not configured');
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
