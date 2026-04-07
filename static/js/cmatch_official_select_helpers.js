'use strict';

var cmatch_official_select_helpers = (function() {
	function build_official_select_entries(tournament, is_service_judge, show_all_officials, deps) {
		const { ci18n_fn, natcmp_fn } = deps;
		const primary_role = is_service_judge ? 'service_judge' : 'umpire';
		const secondary_role = is_service_judge ? 'umpire' : 'service_judge';
		const role_label = (role) => role === 'umpire' ? ci18n_fn('Umpire') : ci18n_fn('Service judge');
		const with_role_label = (official, role) => `${official.name} (${role_label(role)})`;
		const entries = [];
		const append_separator = (label) => {
			entries.push({ type: 'separator', label: `--- ${label} ---` });
		};
		const append_options = (items, role, secondary_mode = false) => {
			for (const official of items) {
				entries.push({
					type: 'option',
					value: official.name,
					label: secondary_mode ? with_role_label(official, role) : official.name
				});
			}
		};
		const sort_by_name = (items) => [...items].sort((a, b) => natcmp_fn(a.name || '', b.name || ''));
		const sort_by_wait = (items, field) => [...items].sort((a, b) => {
			const ts_a = a[field] || 0;
			const ts_b = b[field] || 0;
			if (ts_a !== ts_b) return ts_a - ts_b;
			return natcmp_fn(a.name || '', b.name || '');
		});

		if (show_all_officials) {
			const visible_official_ids = new Set();
			const mark_visible = (official) => {
				if (official && official._id) {
					visible_official_ids.add(official._id);
				}
			};
			const all_officials = tournament.umpires || [];
			const preparation_matches = [...(tournament.matches || [])]
				.filter((match) => (match.setup || {}).state === 'preparation')
				.sort((a, b) => (a.setup?.preparation_call_timestamp || 0) - (b.setup?.preparation_call_timestamp || 0));
			const assigned_matches = [...(tournament.matches || [])]
				.filter((match) => {
					const setup = match.setup || {};
					return setup.state !== 'preparation'
						&& !['oncourt', 'blocked', 'finished'].includes(setup.state)
						&& ((setup.umpire && setup.umpire._id) || (setup.service_judge && setup.service_judge._id));
				})
				.sort((a, b) => natcmp_fn(String(a.setup?.match_num || ''), String(b.setup?.match_num || '')));
			preparation_matches.forEach((match) => {
				mark_visible(match.setup && match.setup.umpire);
				mark_visible(match.setup && match.setup.service_judge);
			});
			assigned_matches.forEach((match) => {
				mark_visible(match.setup && match.setup.umpire);
				mark_visible(match.setup && match.setup.service_judge);
			});
			for (const official of all_officials) {
				if (official.umpire_on_court != null || official.service_judge_on_court != null) {
					mark_visible(official);
				}
			}
			const should_render_in_lower_lists = (official) => !visible_official_ids.has(official._id);
			const primary_wait_field = `${primary_role}_wait`;
			const secondary_wait_field = `${secondary_role}_wait`;
			const primary_pause_field = `${primary_role}_pause`;
			const secondary_pause_field = `${secondary_role}_pause`;
			const primary_wait_items = sort_by_wait(
				all_officials.filter((u) => u[primary_wait_field] != null && should_render_in_lower_lists(u)),
				primary_wait_field
			);
			const secondary_wait_items = sort_by_wait(
				all_officials.filter((u) => u[secondary_wait_field] != null && should_render_in_lower_lists(u)),
				secondary_wait_field
			);
			const primary_pause_items = sort_by_wait(
				all_officials.filter((u) => u[primary_pause_field] != null && should_render_in_lower_lists(u)),
				primary_pause_field
			);
			const secondary_pause_items = sort_by_wait(
				all_officials.filter((u) => u[secondary_pause_field] != null && should_render_in_lower_lists(u)),
				secondary_pause_field
			);
			const preparation_primary = sort_by_name(preparation_matches.map((match) => match.setup && match.setup[primary_role]).filter(Boolean));
			const preparation_secondary = sort_by_name(preparation_matches.map((match) => match.setup && match.setup[secondary_role]).filter(Boolean));
			const assigned_primary = sort_by_name(assigned_matches.map((match) => match.setup && match.setup[primary_role]).filter(Boolean));
			const assigned_secondary = sort_by_name(assigned_matches.map((match) => match.setup && match.setup[secondary_role]).filter(Boolean));
			const inactive_primary = sort_by_wait(
				all_officials.filter((u) => u.inactive_list != null && should_render_in_lower_lists(u) && !(u.is_service_judge && !u.is_umpire)),
				'inactive_list'
			);
			const inactive_secondary = sort_by_wait(
				all_officials.filter((u) => u.inactive_list != null && should_render_in_lower_lists(u) && u.is_service_judge && !u.is_umpire),
				'inactive_list'
			);
			const fallback_inactive_officials = all_officials
				.filter((u) => !visible_official_ids.has(u._id))
				.filter((u) => u.umpire_wait == null && u.service_judge_wait == null && u.umpire_pause == null && u.service_judge_pause == null && u.inactive_list == null)
				.sort((a, b) => natcmp_fn(a.name || '', b.name || ''));
			fallback_inactive_officials.forEach((official) => {
				if (official.is_umpire && !official.is_service_judge) {
					inactive_primary.push(official);
					return;
				}
				if (official.is_service_judge && !official.is_umpire) {
					inactive_secondary.push(official);
					return;
				}
				inactive_primary.push(official);
			});
			const on_court_primary = sort_by_name(all_officials.filter((u) => u[`${primary_role}_on_court`] != null));
			const on_court_secondary = sort_by_name(all_officials.filter((u) => u[`${secondary_role}_on_court`] != null));
			const sections = [
				{ label: primary_role === 'umpire' ? ci18n_fn('Waiting list umpire') : ci18n_fn('Waiting list service judge'), items: primary_wait_items, role: primary_role, secondary_mode: false },
				{ label: secondary_role === 'umpire' ? ci18n_fn('Waiting list umpire') : ci18n_fn('Waiting list service judge'), items: secondary_wait_items, role: secondary_role, secondary_mode: true },
				{ label: ci18n_fn('Currently on break:') + ' ' + role_label(primary_role), items: primary_pause_items, role: primary_role, secondary_mode: false },
				{ label: ci18n_fn('Currently on break:') + ' ' + role_label(secondary_role), items: secondary_pause_items, role: secondary_role, secondary_mode: true },
				{ label: ci18n_fn('Assigned to a match:'), items: assigned_primary, role: primary_role, secondary_mode: false },
				{ label: ci18n_fn('Assigned to a match:'), items: assigned_secondary, role: secondary_role, secondary_mode: true },
				{ label: ci18n_fn('Not available:'), items: inactive_primary, role: primary_role, secondary_mode: false },
				{ label: ci18n_fn('Not available:'), items: inactive_secondary, role: secondary_role, secondary_mode: true },
				{ label: ci18n_fn('In preparation:'), items: preparation_primary, role: primary_role, secondary_mode: false },
				{ label: ci18n_fn('In preparation:'), items: preparation_secondary, role: secondary_role, secondary_mode: true },
				{ label: ci18n_fn('On court:'), items: on_court_primary, role: primary_role, secondary_mode: false },
				{ label: ci18n_fn('On court:'), items: on_court_secondary, role: secondary_role, secondary_mode: true },
			];
			let rendered_any = false;
			sections.forEach((section) => {
				if (!section.items.length) return;
				if (rendered_any) {
					append_separator(section.label.replace(/:$/, ''));
				}
				append_options(section.items, section.role, section.secondary_mode);
				rendered_any = true;
			});
			return entries;
		}

		const primary_wait_field = is_service_judge ? 'service_judge_wait' : 'umpire_wait';
		const secondary_wait_field = is_service_judge ? 'umpire_wait' : 'service_judge_wait';
		const sort_wait_list = (wait_field) => [...(tournament.umpires || [])]
			.filter((u) => u[wait_field] != null)
			.sort((a, b) => {
				const ts_a = a[wait_field] || 0;
				const ts_b = b[wait_field] || 0;
				if (ts_a !== ts_b) return ts_a - ts_b;
				return natcmp_fn(a.name || '', b.name || '');
			});
		const officials = [
			...sort_wait_list(primary_wait_field).map((u) => ({ official: u, label: u.name })),
			...sort_wait_list(secondary_wait_field).map((u) => ({ official: u, label: with_role_label(u, secondary_wait_field === 'umpire_wait' ? 'umpire' : 'service_judge') }))
		];
		const primary_count = sort_wait_list(primary_wait_field).length;
		const secondary_label = secondary_wait_field === 'umpire_wait'
			? '--- ' + ci18n_fn('Waiting list umpire') + ' ---'
			: '--- ' + ci18n_fn('Waiting list service judge') + ' ---';
		for (const [index, entry] of officials.entries()) {
			if (index === primary_count && officials.length > primary_count) {
				entries.push({ type: 'separator', label: secondary_label });
			}
			entries.push({
				type: 'option',
				value: entry.official.name,
				label: entry.label
			});
		}
		return entries;
	}

	return {
		build_official_select_entries
	};
})();

if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	module.exports = cmatch_official_select_helpers;
}
