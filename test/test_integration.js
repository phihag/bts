'use strict';

const assert = require('assert').strict;
const {promisify} = require('util');

const {init_test} = require('../bts/database');
const http_api = require('../bts/http_api');
require('../bts/compat.js'); // Fix nedb
const {assert_snapshot, call_handler} = require('./tutils.js');

const TOURNAMENT_KEY = 'itest';

describe('integration tests', () => {
	it('basic bup API', async () => {
		const db = await init_test();

		const insert_tournament = promisify(db.tournaments.insert.bind(db.tournaments));
		await insert_tournament({
			key: TOURNAMENT_KEY,
			name: 'Integration Test',
			counting: '3x15',
		});
		const insert_court = promisify(db.courts.insert.bind(db.courts));
		const court = await insert_court({
			_id: 'court1',
			tournament_key: TOURNAMENT_KEY,
			num: '1',
		});

		// Create a match
		const insert_match = promisify(db.matches.insert.bind(db.matches));
		const match = await insert_match({
			_id: 'match1',
			tournament_key: TOURNAMENT_KEY,
			setup: {
				court_id: court._id,
				match_name: 'HE',
				is_doubles: false,
				now_on_court: true,
				teams: [
					{players: [{name: 'Lin Dan'}]},
					{players: [{name: 'Lee Chong Wei'}]},
				],
			},
			presses: [],
		});
		const update_court = promisify(db.courts.update.bind(db.courts));
		await update_court({_id: court._id}, {$set: {match_id: match._id}}, {});

		// Query the bup API
		const reply = await call_handler(http_api.matches_handler, {
			app: {db},
			params: {tournament_key: TOURNAMENT_KEY},
			query: {},
		});

		// JSON snapshot the result
		assert.equal(reply.status, 'ok');
		const json = JSON.parse(JSON.stringify(reply));
		await assert_snapshot(__dirname, 'integration_3x15_game', json);
		assert.equal(reply.event.matches.length, 1);
		const [match_repr] = reply.event.matches;
		assert.equal(match_repr.setup.counting, '3x15');
	});
});
