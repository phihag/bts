'use strict';
var on_error = (function() {
var error_list = [];

function report(message) {
	error_list.push(message);
	uiu.show_qs('.errors', error_list.join('\n'));
}

return {
	report: report,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var uiu = null; // UI only

	module.exports = on_error;
}
/*/@DEV*/
