'use strict';
var ci18n = (function() {

var languages = {};
var lang = 'en';

function register_lang(lang) {
	languages[lang._code] = lang;
}

function detect_lang() {
	var codes = window.navigator.languages;
	if (codes) {
		for (var i = 0;i < codes.length;i++) {
			if (languages[codes[i]]) {
				return codes[i];
			}
		}
	}
	var code = window.navigator.language;
	if (code) {
		if (languages[code]) {
			return code;
		}
		code = code.replace(/-.*$/, '');
		if (languages[code]) {
			return code;
		}
	}
	return 'en';
}

function register_all() {
	register_lang(ci18n_en);
	register_lang(ci18n_de);
}

function init() {
	lang = detect_lang();
	register_all();
}

function switch_language(new_lang) {
	lang = new_lang;
	// TODO maybe update current texts
}

function translate(langcode, str, data, fallback) {
	var lang = languages[langcode];
	if (! lang) {
		return 'Invalid Language [' + langcode + ']:>> ' + str + ' <<';
	}
	var res = lang[str];
	if ((res === undefined) && (lang._fallback)) {
		lang = languages[lang._fallback];
		if (! lang) {
			return 'invalid fallback language [' + langcode + ']:>> ' + str + ' <<';
		}
		res = lang[str];
	}
	if (res === undefined) {
		if (fallback === undefined) {
			/*@DEV*/
			console.error('Untranslated string(' + langcode + '): ' + JSON.stringify(str)); // eslint-disable-line no-console
			/*/@DEV*/
			return 'UNTRANSLATED:>> ' + str + ' <<';
		} else {
			return fallback;
		}
	}

	if (data) {
		for (var key in data) {
			res = utils.replace_all(res, '{' + key + '}', data[key]);
		}
	}
	return res;
}

function simple_translate(str, data) {
	return translate(lang, str, data);
}

function get_lang() {
	return lang;
}

function get_all_languages() {
	return Object.values(languages);
}

simple_translate.register_all = register_all;
simple_translate.init = init;
simple_translate.get_lang = get_lang;
simple_translate.switch_language = switch_language;
simple_translate.get_all_languages = get_all_languages;
return simple_translate;
})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var utils = require('../bup/js/utils');
	var ci18n_de = require('./ci18n_de');
	var ci18n_en = require('./ci18n_en');
	ci18n.register_all();

	module.exports = ci18n;
}
/*/@DEV*/