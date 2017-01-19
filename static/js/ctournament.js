'use strict';

var ctournament = (function() {

function ui_create_screen() {
	console.log('would now show create_screen');
}

function init() {
	send({
		type: 'tournament_list',
	}, function(err, response) {
		// TODO if error actually handle?
		// TODO if tournaments present adopt

		var tournaments = response.tournaments;
		if (tournaments.length === 0) {
			ui_create_screen();
		}
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
