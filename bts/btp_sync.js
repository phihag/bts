'use strict';

const assert = require('assert');

const async = require('async');

const btp_parse = require('./btp_parse');
const utils = require('./utils');


function _date_str(dt) {
	return utils.pad(dt.hour, 2, '0') + ':' + utils.pad(dt.minute, 2, '0');
}

function _craft_team(par) {
	if (!par) {
		return {players: []};
	}

	const players = par.map(p => {
		const pres = {
			name: p.Firstname + ' ' + p.Lastname,
		};
		if (p.Country && p.Country[0]) {
			pres.nationality = p.Country[0];
		}
		return pres;
	});

	const tres = {
		players,
	};

	if ((players.length === 2) && (players[0].nationality != players[1].nationality)) {
		tres.name = players[0].nationality + ' / ' + players[1].nationality;
	} else if ((players.length > 0) && (players[0].nationality)) {
		tres.name = {
		'AFG': 'Afghanistan',
		'ALB': 'Albania',
		'DZA': 'Algeria',
		'ASM': 'American Samoa',
		'AND': 'Andorra',
		'AGO': 'Angola',
		'AIA': 'Anguilla',
		'ATA': 'Antarctica',
		'ATG': 'Antigua and Barbuda',
		'ARG': 'Argentina',
		'ARM': 'Armenia',
		'ABW': 'Aruba',
		'AUS': 'Australia',
		'AUT': 'Austria',
		'AZE': 'Azerbaijan',
		'BHS': 'Bahamas',
		'BHR': 'Bahrain',
		'BGD': 'Bangladesh',
		'BRB': 'Barbados',
		'BLR': 'Belarus',
		'BEL': 'Belgium',
		'BLZ': 'Belize',
		'BEN': 'Benin',
		'BMU': 'Bermuda',
		'BTN': 'Bhutan',
		'BOL': 'Bolivia',
		'BIH': 'Bosnia and Herzegovina',
		'BWA': 'Botswana',
		'BVT': 'Bouvet Island',
		'BRA': 'Brazil',
		'BRN': 'Brunei Darussalam',
		'BGR': 'Bulgaria',
		'BFA': 'Burkina Faso',
		'BDI': 'Burundi',
		'CPV': 'Cabo Verde',
		'KHM': 'Cambodia',
		'CMR': 'Cameroon',
		'CAN': 'Canada',
		'CYM': 'Cayman Islands',
		'CAF': 'Central African Republic',
		'TCD': 'Chad',
		'CHL': 'Chile',
		'CHN': 'China',
		'CXR': 'Christmas Island',
		'CCK': 'Cocos Islands',
		'COL': 'Colombia',
		'COM': 'Comoros',
		'COG': 'Congo',
		'COK': 'Cook Islands',
		'CRI': 'Costa Rica',
		'HRV': 'Croatia',
		'CUB': 'Cuba',
		'CUW': 'Curaçao',
		'CYP': 'Cyprus',
		'CZE': 'Czechia',
		'DNK': 'Denmark',
		'DJI': 'Djibouti',
		'DMA': 'Dominica',
		'DOM': 'Dominican Republic',
		'ECU': 'Ecuador',
		'EGY': 'Egypt',
		'SLV': 'El Salvador',
		'GNQ': 'Equatorial Guinea',
		'ERI': 'Eritrea',
		'EST': 'Estonia',
		'SWZ': 'Eswatini',
		'ETH': 'Ethiopia',
		'FLK': 'Falkland Islands',
		'FRO': 'Faroe Islands',
		'FJI': 'Fiji',
		'FIN': 'Finland',
		'FRA': 'France',
		'GUF': 'French Guiana',
		'PYF': 'French Polynesia',
		'GAB': 'Gabon',
		'GMB': 'Gambia',
		'GEO': 'Georgia',
		'DEU': 'Germany',
		'GHA': 'Ghana',
		'GIB': 'Gibraltar',
		'GRC': 'Greece',
		'GRL': 'Greenland',
		'GRD': 'Grenada',
		'GLP': 'Guadeloupe',
		'GUM': 'Guam',
		'GTM': 'Guatemala',
		'GGY': 'Guernsey',
		'GIN': 'Guinea',
		'GNB': 'Guinea-Bissau',
		'GUY': 'Guyana',
		'HTI': 'Haiti',
		'VAT': 'Holy See',
		'HND': 'Honduras',
		'HKG': 'Hong Kong',
		'HUN': 'Hungary',
		'ISL': 'Iceland',
		'IND': 'India',
		'IDN': 'Indonesia',
		'IRN': 'Iran',
		'IRQ': 'Iraq',
		'IRL': 'Ireland',
		'IMN': 'Isle of Man',
		'ISR': 'Israel',
		'ITA': 'Italy',
		'JAM': 'Jamaica',
		'JPN': 'Japan',
		'JEY': 'Jersey',
		'JOR': 'Jordan',
		'KAZ': 'Kazakhstan',
		'KEN': 'Kenya',
		'KIR': 'Kiribati',
		'PRK': 'Korea',
		'KOR': 'Korea',
		'KWT': 'Kuwait',
		'KGZ': 'Kyrgyzstan',
		'LVA': 'Latvia',
		'LBN': 'Lebanon',
		'LSO': 'Lesotho',
		'LBR': 'Liberia',
		'LBY': 'Libya',
		'LIE': 'Liechtenstein',
		'LTU': 'Lithuania',
		'LUX': 'Luxembourg',
		'MAC': 'Macao',
		'MDG': 'Madagascar',
		'MWI': 'Malawi',
		'MYS': 'Malaysia',
		'MDV': 'Maldives',
		'MLI': 'Mali',
		'MLT': 'Malta',
		'MHL': 'Marshall Islands',
		'MTQ': 'Martinique',
		'MRT': 'Mauritania',
		'MUS': 'Mauritius',
		'MYT': 'Mayotte',
		'MEX': 'Mexico',
		'FSM': 'Micronesia',
		'MCO': 'Monaco',
		'MNG': 'Mongolia',
		'MNE': 'Montenegro',
		'MSR': 'Montserrat',
		'MAR': 'Morocco',
		'MOZ': 'Mozambique',
		'MMR': 'Myanmar',
		'NAM': 'Namibia',
		'NRU': 'Nauru',
		'NPL': 'Nepal',
		'NLD': 'Netherlands',
		'NCL': 'New Caledonia',
		'NZL': 'New Zealand',
		'NIC': 'Nicaragua',
		'NER': 'Niger',
		'NGA': 'Nigeria',
		'NIU': 'Niue',
		'NFK': 'Norfolk Island',
		'MKD': 'North Macedonia',
		'NOR': 'Norway',
		'OMN': 'Oman',
		'PAK': 'Pakistan',
		'PLW': 'Palau',
		'PAN': 'Panama',
		'PNG': 'Papua New Guinea',
		'PRY': 'Paraguay',
		'PER': 'Peru',
		'PHL': 'Philippines',
		'PCN': 'Pitcairn',
		'POL': 'Poland',
		'PRT': 'Portugal',
		'PRI': 'Puerto Rico',
		'QAT': 'Qatar',
		'REU': 'Réunion',
		'ROU': 'Romania',
		'RUS': 'Russia',
		'RWA': 'Rwanda',
		'WSM': 'Samoa',
		'SMR': 'San Marino',
		'SAU': 'Saudi Arabia',
		'SEN': 'Senegal',
		'SRB': 'Serbia',
		'SYC': 'Seychelles',
		'SLE': 'Sierra Leone',
		'SGP': 'Singapore',
		'SXM': 'Sint Maarten',
		'SVK': 'Slovakia',
		'SVN': 'Slovenia',
		'SLB': 'Solomon Islands',
		'SOM': 'Somalia',
		'ZAF': 'South Africa',
		'SSD': 'South Sudan',
		'ESP': 'Spain',
		'LKA': 'Sri Lanka',
		'SDN': 'Sudan',
		'SUR': 'Suriname',
		'SWE': 'Sweden',
		'CHE': 'Switzerland',
		'TJK': 'Tajikistan',
		'TZA': 'Tanzania',
		'THA': 'Thailand',
		'TLS': 'Timor-Leste',
		'TGO': 'Togo',
		'TKL': 'Tokelau',
		'TON': 'Tonga',
		'TTO': 'Trinidad and Tobago',
		'TUN': 'Tunisia',
		'TUR': 'Turkey',
		'TKM': 'Turkmenistan',
		'TUV': 'Tuvalu',
		'UGA': 'Uganda',
		'UKR': 'Ukraine',
		'ARE': 'United Arab Emirates',
		'USA': 'USA',
		'URY': 'Uruguay',
		'UZB': 'Uzbekistan',
		'VUT': 'Vanuatu',
		'VEN': 'Venezuela',
		'VNM': 'Viet Nam',
		'VGB': 'Virgin Islands',
		'VIR': 'Virgin Islands',
		'WLF': 'Wallis and Futuna',
		'ESH': 'Western Sahara',
		'YEM': 'Yemen',
		'ZMB': 'Zambia',
		'ZWE': 'Zimbabwe',
		}[players[0].nationality];
	}

	return tres;
}

function _craft_teams(bm) {
	assert(bm.bts_players);
	return bm.bts_players.map(_craft_team);
}

function _parse_score(bm) {
	assert(bm.Sets);
	assert(bm.Sets[0]);
	assert(bm.Sets[0].Set);

	return bm.Sets[0].Set.map(s => [s.T1[0], s.T2[0]]);
}

function integrate_matches(app, tkey, btp_state, court_map, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const {draws, events, officials} = btp_state;

	async.each(btp_state.matches, function(bm, cb) {
		const draw = draws.get(bm.DrawID[0]);
		assert(draw);

		const event = events.get(draw.EventID[0]);
		assert(event);

		const match_num = bm.MatchNr[0];
		assert(typeof match_num === 'number');
		const discipline_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + '_' + draw.Name[0];
		const btp_id = tkey + '_' + discipline_name + '_' + match_num;
		const btp_match_ids = [{
			id: bm.ID[0],
			draw: bm.DrawID[0],
			planning: bm.PlanningID[0],
		}];

		const query = {
			btp_id,
			tournament_key: tkey,
		};
		app.db.matches.findOne(query, (err, cur_match) => {
			if (err) return cb(err);

			if (cur_match && cur_match.btp_needsync) {
				cb();
				return;
			}

			if (!bm.IsMatch) {
				cb();
				return;
			}

			if (!bm.bts_complete) {
				// TODO: register them as incomplete, but continue instead of returning
				cb();
				return;
			}

			const gtid = event.GameTypeID[0];
			assert((gtid === 1) || (gtid === 2));

			const scheduled_time_str = (bm.PlannedTime ? _date_str(bm.PlannedTime[0]) : undefined);
			const match_name = bm.RoundName[0];
			const event_name = (event.Name[0] === draw.Name[0]) ? draw.Name[0] : event.Name[0] + ' - ' + draw.Name[0];
			const teams = _craft_teams(bm);

			const btp_player_ids = [];
			for (const team of bm.bts_players) {
				for (const p of team) {
					btp_player_ids.push(p.ID[0]);
				}
			}

			const setup = {
				incomplete: !bm.bts_complete,
				is_doubles: (gtid === 2),
				match_num,
				counting: '3x21',
				team_competition: false,
				match_name,
				event_name,
				teams,
			};
			if (scheduled_time_str) {
				setup.scheduled_time_str = scheduled_time_str;
			}
			if (bm.CourtID) {
				const btp_court_id = bm.CourtID[0];
				const court_id = court_map.get(btp_court_id);
				assert(court_id);
				setup.court_id = court_id;
			}
			if (bm.Official1ID) {
				const o = officials.get(bm.Official1ID[0]);
				assert(o);
				setup.umpire_name = o.FirstName + ' ' + o.Name;
			}
			if (bm.Official2ID) {
				const o = officials.get(bm.Official2ID[0]);
				assert(o);
				setup.service_judge_name = o.FirstName + ' ' + o.Name;
			}

			const match = {
				tournament_key: tkey,
				btp_id,
				btp_match_ids,
				btp_player_ids,
				setup,
			};
			match.team1_won = undefined;
			match.btp_winner = undefined;
			if (bm.Winner) {
				match.btp_winner = bm.Winner[0];
				match.team1_won = (match.btp_winner === 1);
			}
			if (bm.Sets) {
				match.network_score = _parse_score(bm);
			}
			match._id = 'btp_' + btp_id;

			if (cur_match) {
				if (utils.plucked_deep_equal(match, cur_match, Object.keys(match))) {
					// No update required
					cb();
					return;
				}

				app.db.matches.update({_id: cur_match._id}, {$set: match}, {}, (err) => {
					if (err) return cb(err);

					admin.notify_change(app, match.tournament_key, 'match_edit', {match__id: match._id, setup});
					cb();
				});
				return;
			}

			// New match
			app.db.matches.insert(match, function(err) {
				if (err) return cb(err);

				admin.notify_change(app, tkey, 'match_add', {match});
				cb();
			});
		});
	}, callback);
}

// Returns a map btp_court_id => court._id
function integrate_courts(app, tournament_key, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const courts = Array.from(btp_state.courts.values());
	const res = new Map();
	var changed = false;

	async.each(courts, (c, cb) => {
		const btp_id = c.ID[0];
		const name = c.Name[0];
		let num = parseInt(name, 10) || btp_id;
		const m = /^Court\s*([0-9]+)$/.exec(name);
		if (m) {
			num = parseInt(m[1]);
		}
		const query = {
			btp_id,
			name,
			num,
			tournament_key,
		};

		app.db.courts.findOne(query, (err, cur_court) => {
			if (err) return cb(err);
			if (cur_court) {
				res.set(btp_id, cur_court._id);
				return cb();
			}

			const alt_query = {
				tournament_key,
				num,
			};
			const court = {
				_id: tournament_key + '_' + num,
				tournament_key,
				btp_id,
				num,
				name,
			};
			res.set(btp_id, court._id);
			app.db.courts.findOne(alt_query, (err, cur_court) => {
				if (err) return cb(err);

				if (cur_court) {
					// Add BTP ID
					app.db.courts.update(alt_query, {$set: {btp_id}}, {}, (err) => cb(err));
					return;
				}

				changed = true;
				app.db.courts.insert(court, (err) => cb(err));
			});
		});
	}, (err) => {
		if (err) return callback(err);

		if (changed) {
			stournament.get_courts(app.db, tournament_key, function(err, all_courts) {
				admin.notify_change(app, tournament_key, 'courts_changed', {all_courts});
				callback(err, res);
			});
		} else {
			callback(err, res);
		}
	});
}

function integrate_umpires(app, tournament_key, btp_state, callback) {
	const admin = require('./admin'); // avoid dependency cycle
	const stournament = require('./stournament'); // avoid dependency cycle

	const officials = Array.from(btp_state.officials.values());
	var changed = false;

	async.each(officials, (o, cb) => {
		const name = (o.FirstName ? (o.FirstName[0] + ' ') : '') + ((o.Name[0] && o.Name[0]) ? o.Name[0] : '');
		if (!name) {
			return cb();
		}
		const btp_id = o.ID[0];

		app.db.umpires.findOne({tournament_key, name}, (err, cur) => {
			if (err) return cb(err);

			if (cur) {
				if (cur.btp_id === btp_id) {
					return cb();
				} else {
					app.db.umpires.update({tournament_key, name}, {$set: {btp_id}}, {}, (err) => cb(err));
					return;
				}
			}

			const u = {
				_id: tournament_key + '_btp_' + btp_id,
				btp_id,
				name,
				tournament_key,
			};
			changed = true;
			app.db.umpires.insert(u, err => cb(err));
		});
	}, err => {
		if (changed) {
			stournament.get_umpires(app.db, tournament_key, function(err, all_umpires) {
				if (!err) {
					admin.notify_change(app, tournament_key, 'umpires_changed', {all_umpires});
				}
				callback(err);
			});
		} else {
			callback(err);
		}
	});
}

function fetch(app, tkey, response, callback) {
	let btp_state;
	try {
		btp_state = btp_parse.get_btp_state(response);
	} catch (e) {
		return callback(e);
	}

	async.waterfall([
		cb => integrate_umpires(app, tkey, btp_state, cb),
		cb => integrate_courts(app, tkey, btp_state, cb),
		(court_map, cb) => integrate_matches(app, tkey, btp_state, court_map, cb),
	], callback);
}

module.exports = {
	fetch,
};