var handle_change = function(change) {
	if (!curt || (change.tournament_key !== curt.key)) {
		return;
	}

	switch (change.ctype) {
	case 'props':
		curt.name = change.val.name;
		uiu.qsEach('.ct_name', function(el) {
			if (el.tagName.toUpperCase() === 'INPUT') {
				el.value = change.val.name;
			} else {
				uiu.text(el, change.val.name);
			}
		});
		break;
	case 'match_add':
	case 'courts_changed':
		crouting.rerender();
		break;
	default:
		cerror.silent('Unsupported change type ' + change.ctype);
	}
};

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var crouting = require('./crouting');
	var uiu = require('../bup/js/uiu');

    module.exports = handle_change;
}
/*/@DEV*/
