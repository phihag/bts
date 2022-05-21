'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const tutils = require('./tutils.js');
const _describe = tutils._describe;
const _it = tutils._it;

const {_req2xml: req2xml} = require('../bts/btp_proto');


_describe('btp_proto', function() {
	_it('Timezone encoding', async function() {
		assert.deepStrictEqual(
			req2xml({test_date: new Date(1652529397790)}, 'Europe/Berlin'),
			('<?xml version="1.0" encoding="UTF-8"?><VISUALXML VERSION="1.0">' +
			 '<ITEM TYPE="DateTime" ID="test_date">' +
			 '<DATETIME Y="2022" MM="5" D="14" H="13" M="56" S="37" MS="790"/>' +
			 '</ITEM></VISUALXML>'));
		assert.deepStrictEqual(
			req2xml({test_date: new Date(1652529397790)}, 'America/New_York'),
			('<?xml version="1.0" encoding="UTF-8"?><VISUALXML VERSION="1.0">' +
			 '<ITEM TYPE="DateTime" ID="test_date">' +
			 '<DATETIME Y="2022" MM="5" D="14" H="7" M="56" S="37" MS="790"/>' +
			 '</ITEM></VISUALXML>'));
	});
});
