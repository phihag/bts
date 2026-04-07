'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const admin = require('../bts/admin.js');

_describe('admin', () => {
	_it('marks official changes in match edit as pending sync and suppresses removed BTP officials', () => {
		const old_setup = {
			umpire: { _id: 'u1', btp_id: 6, name: 'Stefan Schiedsrichter' },
			service_judge: { _id: 'u2', btp_id: 7, name: 'Michael G-Punkt' }
		};
		const new_setup = {
			service_judge: { _id: 'u2', btp_id: 7, name: 'Michael G-Punkt' }
		};

		const result = admin._build_match_edit_official_sync_meta(old_setup, new_setup);

		assert.strictEqual(result.has_official_change, true);
		assert.strictEqual(new_setup.suppressed_umpire_btp_id, 6);
		assert.strictEqual(new_setup.suppressed_service_judge_btp_id, undefined);
	});

	_it('clears stale suppress flag when a new official is set in the same role', () => {
		const old_setup = {
			umpire: { _id: 'u1', btp_id: 6, name: 'Stefan Schiedsrichter' }
		};
		const new_setup = {
			umpire: { _id: 'u3', btp_id: 9, name: 'Ralf Referee' },
			suppressed_umpire_btp_id: 6
		};

		const result = admin._build_match_edit_official_sync_meta(old_setup, new_setup);

		assert.strictEqual(result.has_official_change, true);
		assert.strictEqual(new_setup.suppressed_umpire_btp_id, undefined);
	});

	_it('releases dependent service judge when umpire is removed from a setup', () => {
		const setup = {
			service_judge: { _id: 'u2', btp_id: 7, name: 'Michael G-Punkt' }
		};

		const releases = admin._collect_dependent_official_releases(setup);

		assert.deepStrictEqual(releases, [{
			official_id: 'u2',
			wait_field: 'service_judge_wait',
			target_position: 'front'
		}]);
		assert.strictEqual(setup.service_judge, undefined);
		assert.strictEqual(setup.suppressed_service_judge_btp_id, 7);
	});

	_it('removing an umpire from a setup also releases a dependent service judge', () => {
		const setup = {
			umpire: { _id: 'u1', btp_id: 6, name: 'Stefan Schiedsrichter' },
			service_judge: { _id: 'u2', btp_id: 7, name: 'Michael G-Punkt' }
		};

		const releases = admin._remove_official_from_setup(setup, 'umpire');

		assert.strictEqual(setup.umpire, undefined);
		assert.strictEqual(setup.service_judge, undefined);
		assert.strictEqual(setup.suppressed_umpire_btp_id, 6);
		assert.strictEqual(setup.suppressed_service_judge_btp_id, 7);
		assert.deepStrictEqual(releases, [{
			official_id: 'u2',
			wait_field: 'service_judge_wait',
			target_position: 'front'
		}]);
	});
});
