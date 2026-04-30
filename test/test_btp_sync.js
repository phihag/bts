'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {init_test} = require('../bts/database');
const btp_sync = require('../bts/btp_sync');

const TOURNAMENT_KEY = 'ttest';

describe('btp_sync', () => {
	it('Umpire name change', async () => {
		const db = await init_test();

		// TODO set up tournament
		db.tournaments.insert({key: TOURNAMENT_KEY});

		// await promisify(btp_sync.fetch)()
		// TODO change umpire name in BTP
		
	});
});
