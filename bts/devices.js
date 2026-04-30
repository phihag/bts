'use strict';

const DEVICES_BY_TOURNAMENT = new Map();

function handle_update(tournament_id, device_data) {
	let tournament_info = DEVICES_BY_TOURNAMENT.get(tournament_id);
	if (!tournament_info) {
		tournament_info = {};
		DEVICES_BY_TOURNAMENT.set(tournament_id, tournament_info);
	}


}
