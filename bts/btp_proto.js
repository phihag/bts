'use strict';

const zlib = require('zlib');

const xmldom = require('xmldom');


function login_request() {
	//const doc = xmldom.DocumentImplementation.createDocument(null, 'VISUALXML', null);
	// TODO determine my IP address!?
	// TODO actually construct something

	return (new xmldom.DOMParser().parseFromString('<?xml version="1.0" encoding="UTF-8"?><VISUALXML VERSION="1.0"><GROUP ID="Header"><GROUP ID="Version"><ITEM ID="Hi" TYPE="Integer">1</ITEM><ITEM ID="Lo" TYPE="Integer">1</ITEM></GROUP></GROUP><GROUP ID="Action"><ITEM ID="ID" TYPE="String">LOGIN</ITEM></GROUP><GROUP ID="Client"><ITEM ID="IP" TYPE="String">10.0.2.15</ITEM></GROUP></VISUALXML>'));
}

function encode(xml_doc) {
	const serializer = new xmldom.XMLSerializer();
	const xml_str = serializer.serializeToString(xml_doc);
	console.log('sending', xml_str);
	const xml_buf = Buffer.from(xml_str, 'utf8');
	const compressed_request = zlib.gzipSync(xml_buf, {});

	const byte_len = compressed_request.byteLength;
	const request_header = Buffer.alloc(4);
	request_header.writeInt32BE(byte_len, 0);
	const whole_req = Buffer.concat([request_header, compressed_request]);

	return whole_req;
}

function decode(buffers) {

}

module.exports = {
	encode,
	login_request,
};