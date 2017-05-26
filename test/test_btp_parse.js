'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const btp_parse = require('../bts/btp_parse');


_describe('btp_parse', function() {
	_it('DMO35 2017 finals', function(done) {
		fs.readFile(path.join(__dirname, 'dmo35_finals.json'), 'utf8', function(err, contents) {
			if (err) return done(err);

			const response = JSON.parse(contents);
			const bs = btp_parse.get_btp_state(response);

			const matches = bs.matches;
			const get_match = num => matches.filter(m => m.MatchNr && (m.MatchNr[0] === num))[0];

			const heidi_final = get_match(251);
			assert(heidi_final);
			assert(heidi_final.IsMatch && heidi_final.IsMatch[0]);
			// assert.deepStrictEqual(heidi_final.bts_players, 'aaa'); // TODO
			// assert.deepStrictEqual(heidi_final.bts_complete, true); // TODO

			const heidi_sf = get_match(164);
			assert(heidi_sf);
			assert(heidi_sf.IsMatch && heidi_sf.IsMatch[0]);
			const heidi_sf_players = btp_parse._calc_match_players(
				bs._matches_by_pid, bs.entries, bs.players, heidi_sf);
			assert.deepStrictEqual(heidi_sf_players.length, 1);
			assert.deepStrictEqual(heidi_sf_players[0].Firstname[0], 'Heidi');
			assert.deepStrictEqual(heidi_sf_players[0].Lastname[0], 'Bender');

			const doris_walkover = get_match(66);
			assert(doris_walkover);
			assert(doris_walkover.IsMatch && doris_walkover.IsMatch[0]);
			assert(doris_walkover.Winner && (doris_walkover.Winner[0] === 2));

			const heidi_walkover = get_match(65);
			assert(heidi_walkover);
			assert(heidi_walkover.EntryID && heidi_walkover.EntryID[0]);
			assert(heidi_walkover.IsMatch && heidi_walkover.IsMatch[0]);
			assert(heidi_walkover.Winner && (heidi_walkover.Winner[0] === 1));
			assert(!heidi_walkover.bts_complete);
			const heidi_walkover_players = btp_parse._calc_match_players(
				bs._matches_by_pid, bs.entries, bs.players, heidi_walkover);
			assert.deepStrictEqual(heidi_walkover_players.length, 1);

			const heidi_nomatch = bs._matches_by_pid.get(heidi_walkover.DrawID[0] + '_' + heidi_walkover.From1[0]);
			assert(heidi_nomatch);
			assert(heidi_nomatch.EntryID && heidi_nomatch.EntryID[0]);
			assert(heidi_nomatch.IsMatch && heidi_nomatch.IsMatch[0]);
			assert(heidi_nomatch.Winner && (heidi_nomatch.Winner[0] === 1));
			assert(!heidi_nomatch.bts_complete);
			const heidi_nomatch_players = btp_parse._calc_match_players(
				bs._matches_by_pid, bs.entries, bs.players, heidi_nomatch);
			assert.deepStrictEqual(heidi_nomatch_players.length, 1);

			const heidi_herself = bs._matches_by_pid.get(heidi_nomatch.DrawID[0] + '_' + heidi_nomatch.From1[0]);
			assert(heidi_herself);
			const heidi_herself_players = btp_parse._calc_match_players(
				bs._matches_by_pid, bs.entries, bs.players, heidi_herself);
			assert.deepStrictEqual(heidi_herself_players.length, 1);

			done();
		});
	});
});
