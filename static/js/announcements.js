               
function announceNewMatch(matchSetup){
    var field = createFieldAnnouncement(matchSetup);
    var matchNumber = createMatchNumberAnnouncement(matchSetup);
    var eventName = createEventAnnouncement(matchSetup);
    var round = createRoundAnnouncement(matchSetup);
    var teams = createTeamAnnouncement(matchSetup);
    var tabletOperator = createTabletOperator(matchSetup);
    announce([field, matchNumber, eventName, round, teams, tabletOperator, field]);
}

function announcePreparationMatch(matchSetup) {
    var preparation = createPreparationAnnouncement();
    var matchNumber = createMatchNumberAnnouncement(matchSetup);
    var eventName = createEventAnnouncement(matchSetup);
    var round = createRoundAnnouncement(matchSetup);
    var teams = createTeamAnnouncement(matchSetup);
    announce([preparation, matchNumber, eventName, round, teams]);
}

function createTeamAnnouncement(matchSetup){
     var teams = createSingleTeam(matchSetup.teams[0])+", gegen "+createSingleTeam(matchSetup.teams[1]);
     return teams;
}
function createTabletOperator(matchSetup) {
    var tabletOperator = "Tabletbedienung: ";
    if (matchSetup.teams[1].players[0].state) {
        tabletOperator = tabletOperator + matchSetup.teams[1].players[0].state;
    } else
    {
        tabletOperator = tabletOperator + "Verlierer des vorhergehenden Spiels";
    }
    
    return tabletOperator;
}

function createSingleTeam(teamSetup){
    var team = teamSetup.players[0].name;
    if (teamSetup.players.length == 2){
        team = team+" und "+teamSetup.players[1].name
    }
    return team;
}
function createRoundAnnouncement(matchSetup){
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
function createEventAnnouncement(matchSetup){
    var eventParts = matchSetup.event_name.split(" ");
    var eventName = "";
    if (eventParts[0] == 'JE'){
        eventName = "Jungeneinzel"
    }else if (eventParts[0] == 'JD') {
        eventName = "Jungendoppel"
    }else if (eventParts[0] == 'ME') {
        eventName = "Mädcheneinzel"
    }else if (eventParts[0] == 'MD') {
        eventName = "Mädchendoppel"
    } else if (eventParts[0] == 'GD' || eventParts[0] == 'MX') {
        eventName = "Gemischtesdoppel"
    }else if (eventParts[0] == 'HE'){
        eventName = "Herreneinzel"
    }else if (eventParts[0] == 'HD') {
        eventName = "Herrendoppel"
    }else if (eventParts[0] == 'DE') {
        eventName = "Dameneinzel"
    }else if (eventParts[0] == 'DD') {
        eventName = "Damendoppel"
    }
    if (eventName == "") {
        if (eventParts[1] == 'JE') {
            eventName = "Jungeneinzel"
        } else if (eventParts[1] == 'JD') {
            eventName = "Jungendoppel"
        } else if (eventParts[1] == 'ME') {
            eventName = "Mädcheneinzel"
        } else if (eventParts[1] == 'MD') {
            eventName = "Mädchendoppel"
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
        eventName = eventName + " " + eventParts[0];
    } else {
        eventName = eventName + " " + eventParts[1];
    }
    return eventName;
}
function createMatchNumberAnnouncement(matchSetup){
    var number = matchSetup.match_num;
    return "Spiel Nummer " + number + "!";
}
function createFieldAnnouncement(matchSetup){
    var court = matchSetup.court_id.split("_")[1];
    return "Auf Spielfeld " + court + "!";
}
function createPreparationAnnouncement() {
    return "In Vorbereitung:";
}
function announce(callArray) {
    const voices = window.speechSynthesis.getVoices();
    callArray.forEach(function (part) {
        var words = new SpeechSynthesisUtterance(part);
        words.lang = "de-DE";
        words.rate = 1.05;
        words.pitch = 0.9;
        words.volume = 2.0;
        words.voice = voices[6];
        window.speechSynthesis.speak(words);
    });
    
}