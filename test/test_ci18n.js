'use strict';

const assert = require('assert');

const {_translate: translate} = require('../static/js/ci18n.js');


describe('ci18n', function() {
	it('normal translate', () => {
		assert.equal(
			translate('en', 'tournament:edit:btp:system timezone', {tz: 'Europe/Berlin'}),
			'System default (Europe/Berlin)');
	});

	it('translate with undefined value', () => {
		assert.equal(
			translate('en', 'tournament:edit:btp:system timezone', {tz: undefined}),
			'System default (undefined)');
	});
});
