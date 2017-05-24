'use strict';

var INTERVAL = 5000; // TODO make this configurable in the ticker config
var reported = false;

function uiu_empty(node) {
	var last;
	while ((last = node.lastChild)) {
		node.removeChild(last);
	}
}

function uiu_text(node, str) {
	uiu_empty(node);
	node.appendChild(node.ownerDocument.createTextNode(str));
}

function update() {
	var r = new XMLHttpRequest();
	r.open('GET', '/qjson', true);
	r.onreadystatechange = function () {
		if (r.readyState != 4) {
			return;
		}

		var error_display = document.querySelector('.error');
		if (r.status === 200) {
			var d = JSON.parse(r.responseText);
			uiu_empty(error_display);
			var container = document.querySelector('#courts_html');
			container.innerHTML = d.courts_html;
			uiu_text(document.querySelector('.last_update_val'), d.last_update_str);
		} else if (r.status === 0) {
			uiu_text(error_display, 'Netzwerk-Fehler. Versuche erneut in ' + (INTERVAL / 1000) + ' Sekunden ...');
		} else {
			cerror.silent('Ticker HTTP update failed with ' + r.status);
			reported = true;
			uiu_text(error_display, 'Fehler ' + r.status + ' - Entschuldigung! Dieser Fehler wurde uns gemeldet; wir arbeiten daran das zu korrigieren.');
		}
		setTimeout(update, INTERVAL);
	};
	r.send();
}

function cmain() {
	cerror.init();
	setTimeout(update, INTERVAL);
}

document.addEventListener('DOMContentLoaded', cmain);
