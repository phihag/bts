'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const {_translate: translate} = require('../static/js/ci18n.js');


_describe('ci18n', function() {
	_it('normal translate', () => {
		assert.equal(
			translate('en', 'tournament:edit:btp:system timezone', {tz: 'Europe/Berlin'}),
			'System default (Europe/Berlin)');
	});

	_it('translate with undefined value', () => {
		assert.equal(
			translate('en', 'tournament:edit:btp:system timezone', {tz: undefined}),
			'System default (undefined)');
	});
});
