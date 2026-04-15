'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {_describe, _it} = require('./tutils.js');

const match_scoring = require('../static/js/match_scoring');

function createFakeElement(tagName) {
	return {
		tagName,
		children: [],
		attributes: {},
		style: {},
		textContent: '',
		className: '',
		classList: {
			_values: new Set(),
			add(...names) {
				names.filter(Boolean).forEach((name) => this._values.add(name));
			},
			remove(...names) {
				names.forEach((name) => this._values.delete(name));
			},
			contains(name) {
				return this._values.has(name);
			},
		},
		setAttribute(name, value) {
			this.attributes[name] = String(value);
		},
		getAttribute(name) {
			return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
		},
		removeAttribute(name) {
			delete this.attributes[name];
		},
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		addEventListener() {},
	};
}

function loadCmatchForUpdateCourtTest(tr, curt) {
	const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'cmatch.js'), 'utf8');
	const context = {
		console,
		setTimeout() { return 1; },
		clearTimeout() {},
		requestAnimationFrame() {},
		window: {
			innerWidth: 1200,
			addEventListener() {},
			getComputedStyle() {
				return {
					getPropertyValue() {
						return '16px';
					}
				};
			},
		},
		document: {
			querySelectorAll() { return []; },
		},
		curt,
		crouting: { register() {} },
		change: { default_handler(fn) { return fn; } },
		ci18n: (key) => key,
		cerror: { net() {}, silent() {} },
		cflags: { render_flag_el() {} },
		cbts_utils: { cmp(a, b) { return a === b ? 0 : (a < b ? -1 : 1); } },
		ctabletoperator: { add_to_tabletoperator() {} },
		utils: {
			find(list, predicate) {
				return (list || []).find(predicate);
			},
			remove(list, predicate) {
				const idx = (list || []).findIndex(predicate);
				if (idx === -1) {
					return false;
				}
				list.splice(idx, 1);
				return true;
			},
		},
		uiu: {
			qs(selector) {
				if (selector === `tr[data-court_id="${tr.getAttribute('data-court_id')}"]`) {
					return tr;
				}
				return null;
			},
			qsEach() {},
			el(parent, tagName, attrsOrClass, text) {
				const el = createFakeElement(tagName);
				if (typeof attrsOrClass === 'string') {
					el.className = attrsOrClass;
					if (attrsOrClass) {
						el.classList.add(...attrsOrClass.split(/\s+/).filter(Boolean));
					}
				} else if (attrsOrClass && typeof attrsOrClass === 'object') {
					Object.entries(attrsOrClass).forEach(([key, value]) => {
						if (key === 'class') {
							el.className = value;
							el.classList.add(...String(value).split(/\s+/).filter(Boolean));
						} else {
							el.setAttribute(key, value);
						}
					});
				}
				if (text !== undefined) {
					el.textContent = text;
				}
				parent.appendChild(el);
				return el;
			},
		},
	};
	vm.createContext(context);
	vm.runInContext(source, context, { filename: 'cmatch.js' });
	return context.cmatch;
}

_describe('cmatch', () => {
	_it('detects match end for default 3x21 fallback', () => {
		assert.strictEqual(match_scoring.is_match_over([[21, 10], [21, 18]], null), true);
		assert.strictEqual(match_scoring.is_match_over([[21, 10], [18, 21]], null), false);
	});

	_it('detects match end for 1x21 scoring format', () => {
		const scoringFormat = {
			numSets: 1,
			set_points: { end_points: 21, max_points: 30 },
			last_set_points: { end_points: 21, max_points: 30 },
		};

		assert.strictEqual(match_scoring.is_match_over([[21, 19]], scoringFormat), true);
		assert.strictEqual(match_scoring.is_match_over([[20, 19]], scoringFormat), false);
	});

	_it('uses last-set limits for deciding the final set', () => {
		const scoringFormat = {
			numSets: 3,
			set_points: { end_points: 21, max_points: 30 },
			last_set_points: { end_points: 11, max_points: 15 },
		};

		assert.strictEqual(match_scoring.is_match_over([[21, 18], [19, 21], [11, 9]], scoringFormat), true);
		assert.strictEqual(match_scoring.is_match_over([[21, 18], [19, 21], [10, 9]], scoringFormat), false);
	});

	_it('clears a stale finished match from a court row when the court is updated', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		tr.setAttribute('data-match_id', 'match-1');
		tr.setAttribute('data-style', 'default');
		tr.innerHTML = '<td>stale</td>';

		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [{
				_id: 'match-1',
				setup: {
					is_match: true,
					state: 'finished',
					now_on_court: false,
				},
			}],
		});

		cmatch.update_court({ _id: 'court-1', num: '1', is_active: true });

		assert.strictEqual(tr.getAttribute('data-match_id'), null);
		assert.strictEqual(tr.children.length, 3);
		assert.strictEqual(tr.children[1].classList.contains('court_number'), true);
		assert.strictEqual(tr.children[2].classList.contains('empty_element'), true);
	});

	_it('keeps the court match row when the referenced match is still on court', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		tr.setAttribute('data-match_id', 'match-1');
		tr.setAttribute('data-style', 'public');
		tr.innerHTML = '<td>old</td>';

		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			key: 'default',
			btp_settings: { check_in_per_match: false },
			courts_by_id: {
				'court-1': { _id: 'court-1', num: '1', is_active: true }
			},
			matches: [{
				_id: 'match-1',
				setup: {
					is_match: true,
					state: 'oncourt',
					now_on_court: true,
					court_id: 'court-1',
					teams: [
						{ players: [{ btp_id: 1, name: 'Alice Example', firstname: 'Alice', lastname: 'Example', checked_in: true }] },
						{ players: [{ btp_id: 2, name: 'Bob Example', firstname: 'Bob', lastname: 'Example', checked_in: true }] },
					],
					match_num: 12,
					scheduled_date: '2026-04-15',
					scheduled_time_str: '10:00',
				},
			}],
		});

		cmatch.update_court({ _id: 'court-1', num: '1', is_active: true });

		assert.strictEqual(tr.getAttribute('data-match_id'), 'match-1');
		assert.notStrictEqual(tr.children.length, 0);
	});

	_it('resolves CP-VF participant dependencies per slot instead of by shared candidate order', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [],
		});

		const target = {
			_id: 'target',
			btp_match_ids: [{ planning: 3005 }],
			setup: {
				links: {
					from1: 4009,
					from2: 4010,
				}
			}
		};
		const predecessor = {
			_id: 'pred-1',
			btp_match_ids: [{ planning: 4009 }],
			setup: {
				is_match: true,
				match_num: 18,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '11:30',
				links: {
					winner_to: 3005,
					loser_to: 3009,
				}
			}
		};

		assert.strictEqual(
			cmatch._format_participant_dependency(target, 0, [predecessor]),
			'Winner #18 - 2026-04-18 11:30'
		);
		assert.strictEqual(
			cmatch._format_participant_dependency(target, 1, [predecessor]),
			'???'
		);
	});

	_it('uses direct link labels before trying to infer a predecessor match', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [],
		});

		const target = {
			_id: 'target',
			btp_match_ids: [{ planning: 3005 }],
			setup: {
				links: {
					from1: 4009,
					from2: 4010,
					from1_link: 'CP-VF (5/12)',
				}
			}
		};

		assert.strictEqual(
			cmatch._format_participant_dependency(target, 0, []),
			'CP-VF (5/12)'
		);
	});

	_it('resolves a predecessor through a placeholder planning node for the correct slot', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [],
		});

		const target = {
			_id: 'target',
			btp_match_ids: [{ planning: 3005 }],
			setup: {
				links: {
					from1: 4010,
					from2: 4011,
				}
			}
		};
		const placeholder = {
			_id: 'placeholder-1',
			btp_match_ids: [{ planning: 4010 }],
			setup: {
				is_match: false,
				links: {
					from1: 5017,
					from2: 5018,
				}
			}
		};
		const predecessor = {
			_id: 'pred-1',
			btp_match_ids: [{ planning: 4009 }],
			setup: {
				is_match: true,
				match_num: 18,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '11:30',
				links: {
					from1: 5017,
					from2: 5018,
					winner_to: 3005,
					loser_to: 3009,
				}
			}
		};

		assert.strictEqual(
			cmatch._format_participant_dependency(target, 0, [placeholder, predecessor]),
			'Winner #18 - 2026-04-18 11:30'
		);
		assert.strictEqual(
			cmatch._format_participant_dependency(target, 1, [placeholder, predecessor]),
			'???'
		);
	});

	_it('falls back to incoming loser edges when a source planning has no local match node', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [],
		});

		const target = {
			_id: 'target',
			btp_match_ids: [{ planning: 3005 }],
			setup: {
				links: {
					from1: 4009,
					from2: 4010,
				}
			}
		};
		const feederA = {
			_id: 'r16-7',
			btp_match_ids: [{ planning: 4007 }],
			setup: {
				is_match: true,
				match_num: 7,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '09:00',
				links: {
					loser_to: 4010,
				}
			}
		};
		const feederB = {
			_id: 'r16-8',
			btp_match_ids: [{ planning: 4008 }],
			setup: {
				is_match: true,
				match_num: 8,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '09:30',
				links: {
					loser_to: 4010,
				}
			}
		};

		assert.strictEqual(
			cmatch._format_participant_dependency(target, 1, [feederB, feederA]),
			'Loser #7 / #8'
		);
	});

	_it('prefers the visible consolidation match number for hidden loser slots', () => {
		const tr = createFakeElement('tr');
		tr.setAttribute('data-court_id', 'court-1');
		const cmatch = loadCmatchForUpdateCourtTest(tr, {
			matches: [],
		});

		const target = {
			_id: 'target',
			btp_match_ids: [{ planning: 3005 }],
			setup: {
				links: {
					from1: 4009,
					from2: 4010,
				}
			}
		};
		const feederA = {
			_id: 'r16-7',
			btp_match_ids: [{ planning: 4007 }],
			setup: {
				is_match: true,
				match_num: 7,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '09:00',
				links: {
					loser_to: 4010,
				}
			}
		};
		const feederB = {
			_id: 'r16-8',
			btp_match_ids: [{ planning: 4008 }],
			setup: {
				is_match: true,
				match_num: 8,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '09:30',
				links: {
					loser_to: 4010,
				}
			}
		};
		const visibleConsolidation = {
			_id: 'vf-17',
			btp_match_ids: [{ planning: 3004 }],
			setup: {
				is_match: true,
				match_num: 17,
				scheduled_date: '2026-04-18',
				scheduled_time_str: '11:00',
				links: {
					from1: 4007,
					from2: 4008,
					winner_to: 2002,
					loser_to: 2004,
				}
			}
		};

		assert.strictEqual(
			cmatch._format_participant_dependency(target, 1, [feederA, feederB, visibleConsolidation]),
			'Loser #17 - 2026-04-18 11:00'
		);
	});
});
