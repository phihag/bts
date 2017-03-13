'use strict';

const zlib = require('zlib');

const xmldom = require('xmldom');

function get_info_request(password) {
	const res = {
		Header: {
			Version: {
				Hi: 1,
				Lo: 1,
			},
		},
		Action: {
			ID: 'SENDTOURNAMENTINFO',
		},
		Client: {
			IP: 'bts',
		},
	};
	if (password) {
		res.Action.Password = password;
	}
	return res;
}

function login_request(password) {
	const res = {
		Header: {
			Version: {
				Hi: 1,
				Lo: 1,
			},
		},
		Action: {
			ID: 'LOGIN',
		},
		Client: {
			IP: 'bts',
		},
	};
	if (password) {
		res.Action.Password = password;
	}
	return res;
}

function el2obj(el) {
	const res = {};
	for (let i = 0;i < el.childNodes.length;i++) {
		const c = el.childNodes[i];
		let item;

		if (c.tagName === 'GROUP') {
			item = el2obj(c);
		} else if (c.tagName === 'ITEM') {
			const itype = c.getAttribute('TYPE');
			if (itype === 'String') {
				item = c.textContent;
			} else if (itype === 'Integer') {
				item = parseInt(c.textContent);
			} else if (itype === 'Float') {
				item = parseFloat(c.textContent);
			} else if (itype === 'Bool') {
				item = c.textContent === 'true';
			} else if (itype === 'DateTime') {
				const dt = c.getElementsByTagName('DATETIME')[0];
				item = {
					_type: 'datetime',
					year: parseInt(dt.getAttribute('Y')),
					month: parseInt(dt.getAttribute('MM')),
					day: parseInt(dt.getAttribute('D')),
					hour: parseInt(dt.getAttribute('H')),
					minute: parseInt(dt.getAttribute('M')),
					second: parseInt(dt.getAttribute('S')),
					ms: parseInt(dt.getAttribute('MS')),
				};
			} else {
				throw new Error('Unsupported BTP item type ' + itype);
			}
		} else {
			throw new Error('Unsupported BTP tag ' + c.tagName);
		}

		const id = c.getAttribute('ID');
		if (!res[id]) {
			res[id] = [];
		}
		res[id].push(item);
	}
	return res;
}

function _req2xml_add(doc, parent, obj) {
	for (const k in obj) {
		const v = obj[k];

		let node;
		if (Array.isArray(v)) {
			throw new Error('TODO: support arrays');
		}
		if (typeof v === 'object') {
			node = doc.createElement('GROUP');
			_req2xml_add(doc, node, v);
		} else if (typeof v === 'string') {
			node = doc.createElement('ITEM');
			node.setAttribute('TYPE', 'String');
			node.appendChild(doc.createTextNode(v));
		} else if (typeof v === 'number') {
			node = doc.createElement('ITEM');
			node.setAttribute('TYPE', 'Integer');
			node.appendChild(doc.createTextNode(v));
		} else if (typeof v === 'boolean') {
			node = doc.createElement('ITEM');
			node.setAttribute('TYPE', 'Bool');
			node.appendChild(doc.createTextNode(v));
		} else {
			throw new Error('Cannot encode type ' + typeof v);
		}
		node.setAttribute('ID', k);
		parent.appendChild(node);
	}
}

function req2xml(req) {
	const doci = new xmldom.DOMImplementation();
	const doc = doci.createDocument(null, 'VISUALXML');
	const root_node = doc.documentElement;
	root_node.setAttribute('VERSION', '1.0');

	_req2xml_add(doc, root_node, req);

	const serializer = new xmldom.XMLSerializer();
	const xml_str = '<?xml version="1.0" encoding="UTF-8"?>' + serializer.serializeToString(doc);
	return xml_str;
}

function encode(req) {
	// console.log('sending', req); // TODO remove this line
	const xml_str = req2xml(req);

	const xml_buf = Buffer.from(xml_str, 'utf8');
	const compressed_request = zlib.gzipSync(xml_buf, {});

	const byte_len = compressed_request.length;
	const request_header = Buffer.alloc(4);
	request_header.writeInt32BE(byte_len, 0);
	const whole_req = Buffer.concat([request_header, compressed_request]);

	return whole_req;
}

function decode(buf, callback) {
	if (buf.length < 4) {
		return callback(new Error('Got only ' + buf.length + ' bytes'));
	}

	const expect_len = buf.readInt32BE(0);
	if (buf.length - 4 !== expect_len) {
		return callback(new Error('Expected a message of 4+' + expect_len + ' Bytes, but got ' + buf.length));
	}

	const main_buf = buf.slice(4);
	const response_buf = zlib.gunzipSync(main_buf, {});
	const response_str = response_buf.toString('utf8');
	const parser = new xmldom.DOMParser();

	var response;
	try {
		const doc = parser.parseFromString(response_str);
		response = el2obj(doc.documentElement);
		require('fs').writeFileSync('response', response_str);
	} catch(err) {
		console.error('Encountered an error while parsing: ', err);
		//callback(err);
		return;
	}

	// console.log('reponse', JSON.stringify(response)); // TODO remove this line
	callback(null, response);
}

module.exports = {
	decode,
	encode,
	get_info_request,
	login_request,
};