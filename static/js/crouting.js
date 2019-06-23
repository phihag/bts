'use strict';

/*
vpath in this mode is t/12/edit.
path is then /admin/t/12/edit, full URL http://someserver/admin/t/12/edit
*/

var crouting = (function() {
const routes = []; // Elements with route: (regexp that matches the vpath) and func: callback function to call with the URL
const cleanup_funcs = [];
var path_prefix = '/loading...';
var cur_route;

function register(route, func, on_change) {
	if (!func) {
		throw new Error('Missing function for route ' + route);
	}
	if (!on_change) {
		throw new Error('Missing change handler for route ' + route);
	}
	routes.push({route, func, on_change});
}

function _resolve_vpath(vpath, keys) {
	if (keys) {
		for (const k in keys) {
			vpath = vpath.replace(':' + k, keys[k]);
		}
	}
	return path_prefix + vpath;
}

function on_change(c) {
	if (!cur_route) {
		return;
	}

	if (!curt || (c.tournament_key !== curt.key)) {
		return;
	}

	cur_route.on_change(c);
}

// Go to the handler for the specific URL
function _load(path) {
	path = decodeURIComponent(path);
	if (!path.startsWith(path_prefix)) {
		cerror.silent('Cannot route to path ' + path);
		return;
	}
	const vpath = path.substring(path_prefix.length);

	for (const r of routes) {
		const m = r.route.exec(vpath);
		if (m) {
			for (const cfunc of cleanup_funcs) {
				cfunc();
			}

			cur_route = r;
			return r.func(m);
		}
	}
	cerror.silent('Cannot navigate to ' + JSON.stringify(vpath) + '. No handlers defined.');
}

// Navigate to the specified URL
function navigate_to(path, keys) {
	const full_path = _resolve_vpath(path, keys);
	_set_path(full_path);
	_load(full_path);
}

// Set the current state (i.e. it's already loaded)
function set(vpath, keys, cleanup_func) {
	if (cleanup_func) {
		cleanup_funcs.push(cleanup_func);
	}
	const whole_path = _resolve_vpath(vpath, keys);
	if (whole_path === window.location.pathname) {
		return; // Already set, don't change
	}
	_set_path(whole_path);
}

function rerender() {
	_load(window.location.pathname);
}

function _set_path(new_path) {
	history.pushState(null, '', new_path);
}

function init() {
	path_prefix = document.getElementById('bts-data-holder').getAttribute('data-app-root');

	window.onpopstate = function() {
		_load(location.pathname);
	};

	_load(window.location.pathname);
}

function render_link(container, path, text) {
	const link = uiu.el(container, 'a', {
		href: _resolve_vpath(path),
		'data-path': path,
	}, text);
	link.addEventListener('click', e => {
		if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.button != 0) return;
		e.preventDefault();
		navigate_to(e.target.getAttribute('data-path'));
	});
}

return {
	init,
	navigate_to,
	on_change,
	register,
	render_link,
	rerender,
	set,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var uiu = require('../bup/js/uiu');

    module.exports = crouting;
}
/*/@DEV*/
