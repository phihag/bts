'use strict';

// nedb expects using the old util functions, so "backport" them
const util = require('util');

util.isArray = Array.isArray;
util.isDate = util.types.isDate;
util.isRegExp = util.types.isRegExp;
