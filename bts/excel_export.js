'use strict';


async function excel_export_handler(req, res) {
	const { db } = req.app;
	const tournament_key = req.params.tournament_key;

	const [tournament] = await db.tournaments.find_async({key: tournament_key});
	const matches = await db.tournaments.find_async({key: tournament_key});

	console.log('TODO', tournament, matches); // eslint-disable-line no-console

	res.end(500, 'TODO');
	//res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    //res.end(buf);
}

module.exports = {
	excel_export_handler,
};
