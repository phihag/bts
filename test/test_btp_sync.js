'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const btp_sync = require('../bts/btp_sync');


_describe('btp_sync', function() {
	_it('DMO35 2017 finals', function(done) {
		fs.readFile(path.join(__dirname, 'dmo35_finals.json'), 'utf8', function(err, contents) {
			if (err) return done(err);

			const response = JSON.parse(contents);
			const bs = btp_sync.get_btp_state(response);

			const matches = bs.matches;
			const get_match = num => matches.filter(m => m.MatchNr && (m.MatchNr[0] === num))[0];
			const get_match_by_id = idnum => matches.filter(m => m.ID[0] === idnum)[0];

			const heidi_final = get_match(251);
			assert(heidi_final);
			assert(heidi_final.IsMatch && heidi_final.IsMatch[0]);
			// assert.deepStrictEqual(heidi_final.bts_players, 'aaa'); // TODO
			// assert.deepStrictEqual(heidi_final.bts_complete, true); // TODO

			const heidi_walkover = get_match(65);
			assert(heidi_walkover);
			assert(heidi_walkover.IsMatch && heidi_walkover.IsMatch[0]);
			assert(heidi_walkover.Winner && (heidi_walkover.Winner[0] === 1));
			// assert.deepStrictEqual(heidi_final.bts_players, 'aaa'); // TODO
			// assert.deepStrictEqual(heidi_final.bts_complete, true); // TODO

			const doris_walkover = get_match(66);
			assert(doris_walkover);
			assert(doris_walkover.IsMatch && doris_walkover.IsMatch[0]);
			assert(doris_walkover.Winner && (doris_walkover.Winner[0] === 2));



			done();
		});
	});
});
