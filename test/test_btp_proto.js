'use strict';

const assert = require('assert');
const { _describe, _it } = require('./tutils.js');
const btp_proto = require('../bts/btp_proto.js');

function extract_first_match_status(req) {
	return req.Update.Tournament.Matches[0].Match.Status;
}

_describe('btp_proto update_request', () => {
	_it('writes match check-in bits in check-in per match mode', () => {
		const req = btp_proto.update_request({
			btp_match_ids: [{ id: 1, draw: 2, planning: 3 }],
			setup: {
				highlight: 0,
				teams: [
					{ players: [{ checked_in: true }, { checked_in: false }] },
					{ players: [{ checked_in: true }, { checked_in: true }] },
				]
			}
		}, 'unicode', null, null, null, null, {
			write_match_check_in_status: true,
		});

		assert.strictEqual(extract_first_match_status(req), 0b1101);
	});

	_it('does not write match check-in bits in check-in per player mode', () => {
		const req = btp_proto.update_request({
			btp_match_ids: [{ id: 1, draw: 2, planning: 3 }],
			setup: {
				highlight: 0,
				teams: [
					{ players: [{ checked_in: true }, { checked_in: true }] },
					{ players: [{ checked_in: true }, { checked_in: true }] },
				]
			}
		}, 'unicode', null, null, null, null, {
			write_match_check_in_status: false,
		});

		assert.strictEqual(extract_first_match_status(req), 0);
	});
});
