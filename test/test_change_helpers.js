'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const change_helpers = require('../static/js/change_helpers.js');

_describe('change_helpers', () => {
	_it('updates officials view on umpires_changed', () => {
		const deps = {
			curt_ref: { umpires: [] },
			uiu_ref: {
				qsEach(selector, cb) {
					assert.strictEqual(selector, 'select[name="umpire_name"]');
					cb({ value: 'Stefan Schiedsrichter' });
				},
				qs(selector) {
					assert.strictEqual(selector, '.umpire_container');
					return { id: 'umpire_container' };
				}
			},
			cmatch_ref: {
				calls: [],
				render_umpire_options(select, value) {
					this.calls.push({ select, value });
				}
			},
			current_view_ref: 'show',
			cumpires_ref: {
				calls: [],
				ui_status(container) {
					this.calls.push(container);
				}
			},
			ctournament_ref: {
				update_calls: 0,
				update_officials() {
					this.update_calls += 1;
				}
			}
		};

		const officials = [{ _id: 'u1', name: 'Stefan Schiedsrichter' }];
		change_helpers.apply_umpires_changed({ all_umpires: officials }, deps);

		assert.deepStrictEqual(deps.curt_ref.umpires, officials);
		assert.strictEqual(deps.cmatch_ref.calls.length, 1);
		assert.strictEqual(deps.cmatch_ref.calls[0].value, 'Stefan Schiedsrichter');
		assert.strictEqual(deps.cumpires_ref.calls.length, 1);
		assert.strictEqual(deps.ctournament_ref.update_calls, 1);
	});
});
