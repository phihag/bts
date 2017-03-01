'use strict';

/*
vpath in this mode is t/12/edit.
path is then /admin/t/12/edit, full URL http://someserver/admin/t/12/edit
*/

const crouting = (function() {
const routes = []; // Elements with route: (regexp that matches the vpath) and func: callback function to call with the URL
var path_prefix = '/loading...';

function register(route, func) {
	if (!func) {
		throw new Error('Missing function for route ' + route);
	}
	routes.push({route, func});
}

function _resolve_vpath(vpath, keys) {
	if (keys) {
		for (const k in keys) {
			vpath = vpath.replace(':' + k, keys[k]);
		}
	}
	return path_prefix + vpath;
}

// Go to the handler for the specific URL
function _load(path) {
	if (!path.startsWith(path_prefix)) {
		console.error('Cannot route to path ' + path);
		return;
	}
	const vpath = path.substring(path_prefix.length);

	for (const r of routes) {
		const m = r.route.exec(vpath);
		if (m) {
			return r.func(m);
		}
	}
	console.error('Cannot navigate to ' + JSON.stringify(vpath) + '. No handlers defined.');
}

// Navigate to the specified URL
function navigate_to(path, keys) {
	const full_path = _resolve_vpath(path, keys);
	_set_path(full_path);
	_load(full_path);
}

// Set the current state (i.e. it's already loaded)
function set(vpath, keys) {
	const whole_path = _resolve_vpath(vpath, keys);
	if (whole_path === window.location.pathname) {
		return; // Already set, don't change
	}
	_set_path(whole_path);
}

function _set_path(new_path) {
	history.pushState(null, '', new_path);
}

function init() {
	path_prefix = document.getElementById('bts-data-holder').getAttribute('data-app-root');

	window.addEventListener('onpopstate', function(e) {
		console.log('TODO: back/forward: ', e);
	});

	_load(window.location.pathname);
}

return {
	navigate_to,
	init,
	set,
	register,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {

    module.exports = crouting;
}
/*/@DEV*/
