#!/usr/bin/env node
'use strict';

const assert = require('assert');
const async = require('async');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const extract_zip = require('extract-zip');
const request = require('request');
const rimraf = require('rimraf');

const ZIP_URL = 'https://aufschlagwechsel.de/bup.zip';

function safe_rimraf(path, cb) {
	assert(path.includes('bup'));
	rimraf(path, cb);
}

function download_file(req, fn, cb) {
	var encountered_error = false;
	function on_error(err) {
		if (encountered_error) {
			return;
		}
		encountered_error = true;
		cb(err);
	}

	req.on('error', on_error);
	const pipe = req.pipe(fs.createWriteStream(fn, {
		encoding: 'binary',
	}));
	pipe.on('error', on_error);
	pipe.on('finish', function() {
		if (!encountered_error) {
			cb();
		}
	});
}

function sha512_file(fn, cb) {
	const sha_sum = crypto.createHash('SHA512');

	const s = fs.ReadStream(fn);
	s.on('data', function(d) {
		sha_sum.update(d);
	});
	s.on('error', function(err) {
		cb(err);
	});
	s.on('end', function() {
		cb(null, sha_sum.digest('hex'));
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.length !== 1) {
		console.error('Usage: report_error.js TARGET_DIR');
		process.exit(2);
	}

	const target_dir = argv[0];
	bupdate(target_dir, function(err) {
		if (err) throw err;
	});
}

function bupdate(target_dir, callback) {
	const tmp_token = process.pid;
	const tmp_dir = path.join(target_dir, 'bupdate_tmp_' + tmp_token);
	const new_dir = path.join(tmp_dir, 'new');
	const final_dir = path.join(target_dir, 'downloaded');
	const zip_fn = path.join(tmp_dir, 'bup.zip');
	const backup_dir = path.join(target_dir, 'bupdate_tmp_oldbup_' + tmp_token);

	async.waterfall([function(cb) {
		fs.mkdir(tmp_dir, cb);
	}, function(cb) {
		const req = request({
			url: ZIP_URL,
		});
		download_file(req, zip_fn, cb);
	}, function(cb) {
		extract_zip(zip_fn, {dir: new_dir}, cb);
	}, function(cb) {
		const checksums_fn = path.join(new_dir, 'bup', 'checksums.json');
		fs.readFile(checksums_fn, 'utf8', cb);
	}, function(checksums_json, cb) {
		const checksums = JSON.parse(checksums_json);

		async.each(Object.keys(checksums), function(vfn, cb) {
			const file_checksums = checksums[vfn];
			const fn = path.join(new_dir, vfn);

			sha512_file(fn, function(err, sum) {
				if (err) return cb(err);

				if (sum === file_checksums.sha512) {
					cb();
				} else {
					const msg = (
						'Incorect checksum of ' + fn + ': ' +
						'Expected ' + sum + ', but is ' + file_checksums.sha512
					);
					cb(new Error(msg));
				}
			});
		}, cb);
	}, function(cb) {
		fs.stat(final_dir, err => cb(null, !err));
	}, function(old_exists, cb) {
		if (old_exists) {
			fs.rename(final_dir, backup_dir, cb);
		} else {
			cb();
		}
	}, function(cb) {
		fs.rename(path.join(new_dir, 'bup'), final_dir, cb);
	}, function(cb) {
		safe_rimraf(backup_dir, cb);
	}], function(err) {
		if (err) {
			safe_rimraf(tmp_dir);
			callback(err);
			return;
		}

		safe_rimraf(tmp_dir, callback);
	});
}

if (require.main === module) {
	main();
}
