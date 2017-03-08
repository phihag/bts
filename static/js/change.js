var change = (function() {

function default_handler(rerender) {
	return function(c) {
		default_handler_func(rerender, c);
	};
}

function default_handler_func(rerender, c) {
	switch (c.ctype) {
	case 'props':
		curt.name = c.val.name;
		uiu.qsEach('.ct_name', function(el) {
			if (el.tagName.toUpperCase() === 'INPUT') {
				el.value = c.val.name;
			} else {
				uiu.text(el, c.val.name);
			}
		});
		break;
	case 'match_add':
		curt.matches.push(c.val.match);
		rerender();
		break;
	case 'match_edit':
		{
		const changed_m = utils.find(curt.matches, m => m._id === c.val.match__id);
		if (changed_m) {
			changed_m.setup = c.val.setup;
		} else {
			cerror.silent('Cannot find edited match ' + c.val.match__id);
		}
		rerender();
		}
		break;
	case 'courts_changed':
		curt.courts = c.val.all_courts;
		rerender();
		break;
	default:
		cerror.silent('Unsupported change type ' + change.ctype);
	}
}

return {
	default_handler,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var utils = require('./utils');
	var uiu = require('../bup/js/uiu');

    module.exports = change;
}
/*/@DEV*/
