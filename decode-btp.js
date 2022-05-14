#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert').strict;
const argparse = require('argparse');
const {promisify} = require('util');
const {DOMParser} = require('xmldom');
const fs = require('fs');
const path = require('path');
const TextDecoder = require('text-encoding').TextDecoder;

const btp_conn = require('./bts/btp_conn.js');
const btp_parse = require('./bts/btp_parse.js');
const btp_proto = require('./bts/btp_proto.js');
const btp_sync = require('./bts/btp_sync.js');
const utils = require('./bts/utils.js');
const {serialize_pretty} = require('./bts/xml_utils.js');

async function main() {
    const send_raw_request = promisify(btp_conn.send_raw_request);

    const parser = argparse.ArgumentParser({
        description: 'Decode an exchange of the BTP network protocol'});
    parser.addArgument(['-x', '--exchange'], {
        metavar: 'HEX',
        description: 'The exchange as hexadecimal Wireshark dump.',
    });
    const args = parser.parseArgs();

    let hex = args.exchange;
    if (!hex) {
        console.log('Input BTP exchange as hexadecimal:');
        hex = fs.readFileSync(process.stdin.fd).toString();
    }

    const lines = hex.trim().split('\n');
    assert.equal(lines.length % 2, 0, `Expected an even number of lines, but got ${lines.length}`);

    for (let i = 0;i < lines.length;i += 2) {
        const line_hex = lines[i] + lines[i + 1];
        const buf = Buffer.from(line_hex, 'hex');
        const decoded = await promisify(btp_proto.decode_string)(buf);
        console.log(decoded);
    }
}

(async () => {
    try {
        await main();
    } catch (e) {
        console.error(e.stack);
        process.exit(2);
    }
})();
