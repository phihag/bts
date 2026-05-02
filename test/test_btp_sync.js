'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const {init_test} = require('../bts/database');
const btp_parse = require('../bts/btp_parse');
const btp_proto = require('../bts/btp_proto');
const btp_sync = require('../bts/btp_sync');
require('../bts/compat.js'); // Fix nedb
const {assert_snapshot} = require('./tutils.js');

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

		const find_match = promisify(db.matches.findOne.bind(db.matches));
		const match = await find_match({tournament_key: TOURNAMENT_KEY, btp_id: 'ttest_U15_Group 1_273'});
		match.team1_won = true;
		match.network_score = [[21, 5], [21, 8]];
		match.shuttle_count = 7;

		const req = btp_proto.update_request(match, 'password_unicode', 'password123', 1001, 1002, 1003);
		await assert_snapshot(__dirname, 'league_update_request', req);
		const [{PlayerMatch: pm}] = req.Update.Tournament.PlayerMatches;
		assert.deepStrictEqual(pm.TeamMatchID, 100);
		assert.deepStrictEqual(pm.MatchOrder, 1);
		assert.deepStrictEqual(pm.Team1Player1ID, 127);
		assert.deepStrictEqual(pm.Shuttles, 7);
	});
});
