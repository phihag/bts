

function announceNewMatch(matchSetup) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    const field = createFieldAnnouncement(matchSetup);
    const matchNumber = createMatchNumberAnnouncement(matchSetup);
    const eventName = createEventAnnouncement(matchSetup);
    const round = createRoundAnnouncement(matchSetup);
    const teams = createTeamAnnouncement(matchSetup);
    const umpire = createUmpire(matchSetup);
    const tabletOperator = createTabletOperator(matchSetup);
    announce([field, matchNumber, eventName, round, teams, umpire, tabletOperator, field]);
}

function announcePreparationMatch(matchSetup) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    var preparation = createPreparationAnnouncement();
    var matchNumber = createMatchNumberAnnouncement(matchSetup);
    var eventName = createEventAnnouncement(matchSetup);
    var round = createRoundAnnouncement(matchSetup);
    var teams = createTeamAnnouncement(matchSetup);
    announce([preparation, matchNumber, eventName, round, teams, preparation]);
}
function announceSecondCallTeamOne(matchSetup) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    announceSecondCall(matchSetup, matchSetup.teams[0]);
}

function announceSecondCallTeamTwo(matchSetup) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    announceSecondCall(matchSetup, matchSetup.teams[1]);
}

function announceSecondCallTabletoperator(matchSetup) {
    if (!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    const umpireCall = createUmpire(matchSetup);;
    if (umpireCall != null) {
        const call = createFieldAnnouncement(matchSetup) + createSecondCallAnnouncement() + umpireCall;
        announce([call]);
    }

    const tabletOperatorCall = createTabletOperator(matchSetup);;
    if (tabletOperatorCall != null) { 
        const call = createFieldAnnouncement(matchSetup) + createSecondCallAnnouncement() + tabletOperatorCall;
         announce([call]);
    }
}

function announceSecondCall(matchSetup, team) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    var secondCall = createSecondCallAnnouncement() + createSingleTeam(team.players);
    var field = createFieldAnnouncement(matchSetup);
    announce([secondCall, field]);
}
function announceBeginnToPlay(matchSetup, team) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    announce([createFieldAnnouncement(matchSetup) + "Bitte mit dem Spielen beginnen!"]);
}

function createSecondCallAnnouncement() {
    return "Zweiter Aufruf fuer:";
}

function createTeamAnnouncement(matchSetup) {
    var teams = createSingleTeam(matchSetup.teams[0].players) + ", gegen " + createSingleTeam(matchSetup.teams[1].players);
    return teams;
}

function createTabletOperator(matchSetup) {
    if (matchSetup.tabletoperators && matchSetup.tabletoperators != null) {
        return "Tabletbedienung: " + createSingleTeam(matchSetup.tabletoperators);
    } 
    return null;
}

function createUmpire(matchSetup) {
    if (matchSetup.umpire_name && matchSetup.umpire_name != null) {
        return "Schiedsrichter: " + matchSetup.umpire_name;
    }
    return null;
}

function createSingleTeam(playersSetup) {
    var team = playersSetup[0].name;
    if (playersSetup.length == 2) {
        team = team + " und " + playersSetup[1].name
    }
    return team;
}

function createRoundAnnouncement(matchSetup) {
    var round = matchSetup.match_name;
    if (round == "R16") {
        round = "Achtelfinale";
    } else if (round == "VF") {
        round = "Viertelfinale";
    } else if (round == "HF") {
        round = "Halbfinale";
    } else if (round == "Finale") {
        round = "Finale";
    } else if (round.indexOf('/') !== -1) {
        var roundParts = round.split("/")
        var diff = roundParts[1] - roundParts[0];
        if (diff > 1) {
            round = "Zwischenrunde";
        } else {
            round = "Spiel um Platz " + roundParts[0] + " und " + roundParts[1];
        }
    } else if (round.indexOf('-') !== -1) {
        round = "Zwischenrunde";
    } else {
        round = "";
    }
    return round;
}
function createEventAnnouncement(matchSetup) {
    var eventParts = matchSetup.event_name.split(" ");
    var eventName = "";
    if (eventParts[0] == 'JE') {
        eventName = "Jungeneinzel"
    } else if (eventParts[0] == 'JD') {
        eventName = "Jungendoppel"
    } else if (eventParts[0] == 'ME') {
        eventName = "Maedcheneinzel"
    } else if (eventParts[0] == 'MD') {
        eventName = "Maedchendoppel"
    } else if (eventParts[0] == 'GD' || eventParts[0] == 'MX') {
        eventName = "Gemischtesdoppel"
    } else if (eventParts[0] == 'HE') {
        eventName = "Herreneinzel"
    } else if (eventParts[0] == 'HD') {
        eventName = "Herrendoppel"
    } else if (eventParts[0] == 'DE') {
        eventName = "Dameneinzel"
    } else if (eventParts[0] == 'DD') {
        eventName = "Damendoppel"
    }
    if (eventName == "") {
        if (eventParts[1] == 'JE') {
            eventName = "Jungeneinzel"
        } else if (eventParts[1] == 'JD') {
            eventName = "Jungendoppel"
        } else if (eventParts[1] == 'ME') {
            eventName = "Maedcheneinzel"
        } else if (eventParts[1] == 'MD') {
            eventName = "Maedchendoppel"
        } else if (eventParts[1] == 'GD' || eventParts[1] == 'MX') {
            eventName = "Gemischtesdoppel"
        } else if (eventParts[1] == 'HE') {
            eventName = "Herreneinzel"
        } else if (eventParts[1] == 'HD') {
            eventName = "Herrendoppel"
        } else if (eventParts[1] == 'DE') {
            eventName = "Dameneinzel"
        } else if (eventParts[1] == 'DD') {
            eventName = "Damendoppel"
        }
        if (eventParts[0]) {
            eventName = eventName + " " + eventParts[0];
        }
    } else {
        if (eventParts[1]) {
            eventName = eventName + " " + eventParts[1];
        }
    }
    return eventName;
}

function createMatchNumberAnnouncement(matchSetup) {
    var number = matchSetup.match_num;
    return "Spiel Nummer " + number + "!";
}

function createFieldAnnouncement(matchSetup) {
    if (matchSetup.court_id) {
        var court = matchSetup.court_id.split("_")[1];
        return "Auf Spielfeld " + court + "!";
    } else {
        return "";
    }

}

function createPreparationAnnouncement() {
    return "In Vorbereitung:";
}

function announce(callArray) {
    if(!(window.localStorage.getItem('enable_announcements') === 'true')) {
        return;
    }
    
    // Seems like the getVoices() is an asynchronous function where it is not always guaranteed that you get a 
    // result immediately. The wait for the result must therefore be handled:
    // https://stackoverflow.com/questions/21513706/getting-the-list-of-voices-in-speechsynthesis-web-speech-api
    const allVoicesObtained = new Promise(function (resolve, reject) {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length !== 0) {
            resolve(voices);
        } else {
            window.speechSynthesis.addEventListener("voiceschanged", function () {
                voices = window.speechSynthesis.getVoices();
                resolve(voices);
            });
        }
    });

    allVoicesObtained.then(voices => {
        var voice = null;
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].voiceURI == "Google Deutsch") {
                voice = voices[i];
                break;
            }
        }
        callArray.forEach(function (part) {
            if (part && part != null) { 
                var words = new SpeechSynthesisUtterance(part);
                words.lang = "de-DE";
                words.rate = 1.05;
                words.pitch = 0.9;
                words.volume = 2.0;
                words.voice = voice;
                window.speechSynthesis.speak(words);
            }
        });
    });
}