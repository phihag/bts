'use strict';

var change_helpers = (function() {
	function apply_umpires_changed(update, deps) {
		const {
			curt_ref,
			uiu_ref,
			cmatch_ref,
			current_view_ref,
			cumpires_ref,
			ctournament_ref
		} = deps;

		curt_ref.umpires = update.all_umpires;
		uiu_ref.qsEach('select[name="umpire_name"]', function(select) {
			cmatch_ref.render_umpire_options(select, select.value);
		});
		if(current_view_ref === 'show') {
			cumpires_ref.ui_status(uiu_ref.qs('.umpire_container'));
		}
		ctournament_ref.update_officials();
	}

	return {
		apply_umpires_changed
	};
})();

if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	module.exports = change_helpers;
}
