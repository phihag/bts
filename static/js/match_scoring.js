'use strict';

var match_scoring = (function() {
	function fallback_scoring_format() {
		return {
			numSets: 3,
			set_points: {
				end_points: 21,
				max_points: 30,
			},
			last_set_points: {
				end_points: 21,
				max_points: 30,
			},
		};
	}

	function normalize_set_points(setPoints, fallbackSetPoints) {
		const normalized = setPoints || {};
		const fallback = fallbackSetPoints || {};

		return {
			end_points: Number.isFinite(normalized.end_points) ? normalized.end_points : fallback.end_points,
			max_points: Number.isFinite(normalized.max_points) ? normalized.max_points : fallback.max_points,
		};
	}

	function is_set_over(scoreA, scoreB, setPoints) {
		const maxScore = setPoints?.max_points;
		const winningScore = setPoints?.end_points;

		if (Number.isFinite(maxScore) && (scoreA === maxScore || scoreB === maxScore)) return true;

		if (Number.isFinite(winningScore) &&
			(scoreA >= winningScore || scoreB >= winningScore) &&
			Math.abs(scoreA - scoreB) >= 2) {
			return true;
		}

		return false;
	}

	function is_match_over(sets, scoringFormat) {
		if (!sets) {
			return false;
		}

		const format = scoringFormat || fallback_scoring_format();
		const totalSets = Number.isFinite(format.numSets) && format.numSets > 0 ? format.numSets : 3;
		const requiredWins = Math.floor(totalSets / 2) + 1;
		const fallbackSetPoints = fallback_scoring_format().set_points;

		let winsA = 0;
		let winsB = 0;

		for (let idx = 0; idx < sets.length; idx++) {
			const [scoreA, scoreB] = sets[idx];
			const isLastPossibleSet = idx === totalSets - 1;
			const setPoints = normalize_set_points(
				isLastPossibleSet ? format.last_set_points : format.set_points,
				fallbackSetPoints
			);

			if (is_set_over(scoreA, scoreB, setPoints)) {
				if (scoreA > scoreB) {
					winsA++;
				} else {
					winsB++;
				}

				if (winsA >= requiredWins || winsB >= requiredWins) {
					return true;
				}
			} else {
				return false;
			}
		}

		return winsA >= requiredWins || winsB >= requiredWins;
	}

	return {
		is_match_over,
		is_set_over,
	};
})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	module.exports = match_scoring;
}
/*/@DEV*/
