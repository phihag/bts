'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {init_test} = require('../bts/database');
const btp_parse = require('../bts/btp_parse');
const btp_sync = require('../bts/btp_sync');
require('../bts/compat.js');

const TOURNAMENT_KEY = 'ttest';

describe('btp_sync', () => {
	it('Umpire name change', async () => {
		const db = await init_test();

		// TODO set up tournament
		db.tournaments.insert({key: TOURNAMENT_KEY});

		// await promisify(btp_sync.fetch)()
		// TODO change umpire name in BTP

	});

	it('league synchronization', async () => {
		const db = await init_test();
		db.tournaments.insert({key: TOURNAMENT_KEY, is_team: true});
		const app = {db};

		const test_file = path.join(__dirname, 'testdata', 'dmm-2026-one-game.json');
		const contents = await fs.promises.readFile(test_file, 'utf-8');
		const response = JSON.parse(contents);
		const btp_state = btp_parse.get_btp_state(response);

		await btp_sync.integrate_btp_state(app, TOURNAMENT_KEY, btp_state);
	});
});
