'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const admin = require('../bts/admin.js');
const bupws = require('../bts/bupws.js');

_describe('bupws', () => {
	_it('clears the stored court match reference when the finished match still owns the court', (done) => {
		const notifications = [];
		const original_notify_change = admin.notify_change;
		admin.notify_change = (_app, _tournament_key, ctype, payload) => {
			notifications.push({ ctype, payload });
		};

		const app = {
			db: {
				courts: {
					update(query, update, options, cb) {
						assert.deepStrictEqual(query, { tournament_key: 'default', _id: 'court-1' });
						assert.deepStrictEqual(update, { $set: { match_id: null } });
						assert.deepStrictEqual(options, { returnUpdatedDocs: true });
						cb(null, 1, {
							_id: 'court-1',
							is_active: true,
							has_umpire: true,
							has_service_judge: false,
							match_id: null,
						});
					}
				}
			}
		};

		bupws._clear_court_match_reference_after_finish(
			app,
			'default',
			{ tournament_key: 'default', _id: 'court-1' },
			{ _id: 'court-1', match_id: 'match-1', is_active: true, has_umpire: true, has_service_judge: false },
			'match-1',
			true,
			(err, changed) => {
				admin.notify_change = original_notify_change;
				assert.ifError(err);
				assert.strictEqual(changed, true);
				assert.deepStrictEqual(notifications, [{
					ctype: 'court_changed',
					payload: {
						court_id: 'court-1',
						is_active: true,
						has_umpire: true,
						has_service_judge: false,
						match_id: null,
					}
				}]);
				done();
			}
		);
	});

	_it('does not clear the court match reference for unrelated finishes', (done) => {
		const original_notify_change = admin.notify_change;
		admin.notify_change = () => {
			throw new Error('notify_change must not be called');
		};

		const app = {
			db: {
				courts: {
					update() {
						throw new Error('court update must not be called');
					}
				}
			}
		};

		bupws._clear_court_match_reference_after_finish(
			app,
			'default',
			{ tournament_key: 'default', _id: 'court-1' },
			{ _id: 'court-1', match_id: 'other-match' },
			'match-1',
			true,
			(err, changed) => {
				admin.notify_change = original_notify_change;
				assert.ifError(err);
				assert.strictEqual(changed, false);
				done();
			}
		);
	});
});
