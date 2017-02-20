'use strict';

var ctournament = (function() {

function ui_create() {
	var main = uiu.qs('.main');

	var form = uiu.create_el(main, 'form');
	uiu.create_el(form, 'h2', {}, 'Turnier erstellen');
	var id_label = uiu.create_el(form, 'label', {}, 'Turnier-ID:');
	uiu.create_el(id_label, 'input', {
		type: 'text',
		name: 'id',
		required: 'required',
		pattern: '^[a-z0-9]+$',
	});
	uiu.create_el(form, 'button', {
		role: 'submit',
	}, 'Turnier erstellen');

	form.addEventListener('submit', function(e) {
		e.preventDefault();

		var fd = new FormData(form);
		console.log('would now send form details', fd);

		uiu.remove(form);
	});
}

function init() {
	send({
		type: 'tournament_list',
	}, function(err, response) {
		if (err) {
			return on_error.show(err);
		}
		// TODO if tournaments present adopt

		var tournaments = response.tournaments;
		if (tournaments.length === 0) {
			ui_create();
		}
		// TODO list tournaments
	});
}

return {
	init: init,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {

    module.exports = ctournament;
}
/*/@DEV*/
