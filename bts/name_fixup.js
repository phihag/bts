FIXED_PLAYERS = {
	'NONG Sophia': {
		name: 'Sophia Nong',
		firstname: 'Sophia',
		lastname: 'Nong',
		asian_name: false,
	},
};

function fix_player(player) {
	const fixed = FIXED_PLAYERS[player.name];
	if (fixed) {
		Object.assign(player, fixed);
	}
}

module.exports = {
	fix_player,
};
