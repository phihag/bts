'use strict';

const assert = require('assert');
const zlib = require('zlib');

const xmldom = require('xmldom');

const serror = require('./serror');


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

function update_request(match, key_unicode, password) {
	const matches = [];
	const res = {
		Header: {
			Version: {
				Hi: 1,
				Lo: 1,
			},
		},
		Action: {
			ID: 'SENDUPDATE',
			Password: password,
			Unicode: key_unicode,
		},
		Client: {
			IP: 'bts',
		},
		Update: {
			Tournament: {
				Matches: matches,
			},
		},
	};

	assert(typeof match.team1_won === 'boolean');
	const winner = match.team1_won ? 1 : 2;
	assert(match.btp_match_ids);
	assert(match.btp_match_ids.length > 0);
	assert(match.network_score);
	assert(match.duration_ms);
	const duration_mins = Math.floor(match.duration_ms / 60000);

	for (const btp_m_id of match.btp_match_ids) {
		assert(btp_m_id);

		const sets = match.network_score.map(ns => {
			return {
				Set: {
					T1: ns[0],
					T2: ns[1],
				},
			};
		});

		const m = {
			ID: btp_m_id.id,
			DrawID: btp_m_id.draw,
			PlanningID: btp_m_id.planning,
			Sets: sets,
			Winner: winner,
			ScoreStatus: 0, // Won normally (TODO: correctly handle resignations etc.)
			Duration: duration_mins,
			Status: 0,
			// BTP also sends a boolean ScoreSheetPrinted here
		};
		matches.push({Match: m});
	}

	if (match.btp_player_ids && match.end_ts && (match.end_ts + 300000 > Date.now())) {
		const players = [];
		res.Update.Tournament.Players = players;
		const end_date = new Date(match.end_ts);

		for (const pid of match.btp_player_ids) {
			const pupdate = {
				ID: pid,
				LastTimeOnCourt: end_date,
			};
			players.push({Player: pupdate});
		}
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
			node = doc.createElement('GROUP');
			for (const el of v) {
				_req2xml_add(doc, node, el);
			}
		} else if (v instanceof Date) {
			node = doc.createElement('ITEM');
			node.setAttribute('TYPE', 'DateTime');

			const dt = doc.createElement('DATETIME');
			dt.setAttribute('Y', v.getFullYear());
			dt.setAttribute('MM', v.getMonth() + 1);
			dt.setAttribute('D', v.getDate());
			dt.setAttribute('H', v.getHours());
			dt.setAttribute('M', v.getMinutes());
			dt.setAttribute('S', v.getSeconds());
			dt.setAttribute('MS', v.getMilliseconds());
			node.appendChild(dt);
		} else if (typeof v === 'object') {
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
	const xml_str = req2xml(req);
	// console.log('sending', xml_str); // TODO remove this line

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
	} catch(err) {
		serror.silent('Encountered an error while parsing BTP message: ' + err.message);
		callback(err);
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
	update_request,
};