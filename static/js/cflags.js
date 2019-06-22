'use strict';

var cflags = (() => {

function show_flag(e) {
	const img = e.target;
	alert(img.getAttribute('title') + ' (' + img.getAttribute('data-nationality') + ')');
}

function render_flag_el(parentNode, nationality) {
	const img = uiu.el(parentNode, 'img', {
		style: 'height:1em;width:1em;vertical-align:text-top;',
		src: '/static/flags/' + (nationality || 'unknown') + '.svg',
		alt: nationality || '??',
		title: nationality ? countries.lookup(nationality) : '??',
		'data-nationality': nationality,
	});
	img.addEventListener('click', show_flag);
}

return {
	render_flag_el,
};

})();



/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var countries = require('./countries');
	var uiu = require('../bup/js/uiu');

    module.exports = cflags;
}
/*/@DEV*/
