'use strict';

const assert = require('assert');

const {_describe, _it} = require('./tutils.js');

const cmatch_official_select_helpers = require('../static/js/cmatch_official_select_helpers');

function build_entries(tournament, is_service_judge, show_all_officials) {
	return cmatch_official_select_helpers.build_official_select_entries(
		tournament,
		is_service_judge,
		show_all_officials,
		{
			ci18n_fn: (key) => key,
			natcmp_fn: (a, b) => String(a).localeCompare(String(b), 'en'),
		}
	);
}

_describe('cmatch official select entries', () => {
	_it('groups show-all umpire entries in the agreed order', () => {
		const tournament = {
			umpires: [
				{ _id: 'u1', name: 'Wartet U', umpire_wait: 10 },
				{ _id: 'u2', name: 'Wartet SJ', service_judge_wait: 20 },
				{ _id: 'u3', name: 'Pause U', umpire_pause: 30 },
				{ _id: 'u4', name: 'Pause SJ', service_judge_pause: 40 },
				{ _id: 'u5', name: 'Assigned U' },
				{ _id: 'u6', name: 'Assigned SJ' },
				{ _id: 'u7', name: 'Inactive U', inactive_list: 50, is_umpire: true, is_service_judge: false },
				{ _id: 'u8', name: 'Prep U' },
				{ _id: 'u9', name: 'Court U', umpire_on_court: 'c1' },
			],
			matches: [
				{ setup: { state: 'ready', match_num: 7, umpire: { _id: 'u5', name: 'Assigned U' }, service_judge: { _id: 'u6', name: 'Assigned SJ' } } },
				{ setup: { state: 'preparation', match_num: 8, preparation_call_timestamp: 1, umpire: { _id: 'u8', name: 'Prep U' } } },
			]
		};

		const entries = build_entries(tournament, false, true);
		const labels = entries.map((entry) => entry.label);

		assert.deepStrictEqual(labels, [
			'Wartet U',
			'--- Waiting list service judge ---',
			'Wartet SJ (Service judge)',
			'--- Currently on break: Umpire ---',
			'Pause U',
			'--- Currently on break: Service judge ---',
			'Pause SJ (Service judge)',
			'--- Assigned to a match ---',
			'Assigned U',
			'--- Assigned to a match ---',
			'Assigned SJ (Service judge)',
			'--- Not available ---',
			'Inactive U',
			'--- In preparation ---',
			'Prep U',
			'--- On court ---',
			'Court U'
		]);
	});

	_it('omits a separator before the first wait-list group in restricted mode', () => {
		const tournament = {
			umpires: [
				{ _id: 'u1', name: 'Alpha', umpire_wait: 10 },
				{ _id: 'u2', name: 'Beta', service_judge_wait: 20 },
			],
			matches: []
		};

		const entries = build_entries(tournament, false, false);
		const labels = entries.map((entry) => entry.label);

		assert.deepStrictEqual(labels, [
			'Alpha',
			'--- Waiting list service judge ---',
			'Beta (Service judge)',
		]);
	});
});
