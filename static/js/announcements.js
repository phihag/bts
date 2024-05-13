

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
    const umpire = createUmpire(matchSetup);
    const tabletOperator = createTabletOperator(matchSetup);
    var lastPart = preparation;
    if (curt.preparation_meetingpoint_enabled) {
        lastPart = createMeetingPointAnnouncement();
    }
    announce([preparation, matchNumber, eventName, round, teams, umpire, tabletOperator, lastPart]);
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
    announce([createFieldAnnouncement(matchSetup) + ci18n('announcements:begin_to_play')]);
}

function createSecondCallAnnouncement() {
    return ci18n('announcements:second_call');
}

function createTeamAnnouncement(matchSetup) {
    var teams = createSingleTeam(matchSetup.teams[0].players) + "," + ci18n('announcements:vs') + createSingleTeam(matchSetup.teams[1].players);
    return teams;
}

function createTabletOperator(matchSetup) {
    if (matchSetup.tabletoperators && matchSetup.tabletoperators != null) {
        return (curt.tabletoperator_use_manual_counting_boards_enabled ? ci18n('announcements:counting_board_service') : ci18n('announcements:table_service')) + createSingleTeam(matchSetup.tabletoperators);
    } 
    return null;
}

function createUmpire(matchSetup) {
    if (matchSetup.umpire_name && matchSetup.umpire_name != null) {
        return ci18n('announcements:umpire') + normalizeNames(matchSetup.umpire_name);
    }
    return null;
}

function createSingleTeam(playersSetup) {
    var team = normalizeNames(playersSetup[0].name);
    if (playersSetup.length == 2) {
        team = team + ci18n('announcements:and') + normalizeNames(playersSetup[1].name)
    }
    return team;
}


function normalizeNames(name) {
    if (curt.normalizations && curt.normalizations.length > 0) {
        for (const norm of curt.normalizations) {
            if (ci18n('announcements:lang') == norm.language) {
                name = name.replaceAll(norm.origin, norm.replace); 
            }
        }
    }
    return name;
}

function createRoundAnnouncement(matchSetup) {
    var round = matchSetup.match_name;
    if (round == "R16") {
        round = ci18n('announcements:round_16');
    } else if (round == "VF") {
        round = ci18n('announcements:quaterfinal');
    } else if (round == "HF") {
        round = ci18n('announcements:semifinal');
    } else if (round == "Finale") {
        round = ci18n('announcements:final');
    } else if (round.indexOf('/') !== -1) {
        var roundParts = round.split("/")
        var diff = roundParts[1] - roundParts[0];
        if (diff > 1) {
            round = ci18n('announcements:intermediate_round');
        } else {
            round = ci18n('announcements:game_for_place') + roundParts[0] + ci18n('announcements:and') + roundParts[1];
        }
    } else if (round.indexOf('-') !== -1) {
        round = ci18n('announcements:intermediate_round');
    } else {
        round = "";
    }
    return round;
}
function createEventAnnouncement(matchSetup) {
    var eventParts = matchSetup.event_name.split(" ");
    var eventName = "";
    if (eventParts[0] == 'JE') {
        eventName = ci18n('announcements:boys_singles');
    } else if (eventParts[0] == 'JD') {
        eventName = ci18n('announcements:boys_doubles');
    } else if (eventParts[0] == 'ME') {
        eventName = ci18n('announcements:girls_singles');
    } else if (eventParts[0] == 'MD') {
        eventName = ci18n('announcements:girls_doubles')
    } else if (eventParts[0] == 'GD' || eventParts[0] == 'MX') {
        eventName = ci18n('announcements:mixed_doubles')
    } else if (eventParts[0] == 'HE') {
        eventName = ci18n('announcements:men_singles');
    } else if (eventParts[0] == 'HD') {
        eventName = ci18n('announcements:men_doubles');
    } else if (eventParts[0] == 'DE') {
        eventName = ci18n('announcements:women_singles');
    } else if (eventParts[0] == 'DD') {
        eventName = ci18n('announcements:women_doubles');
    }
    if (eventName == "") {
        if (eventParts[1] == 'JE') {
            eventName = ci18n('announcements:boys_singles');
        } else if (eventParts[1] == 'JD') {
            eventName = ci18n('announcements:boys_doubles');
        } else if (eventParts[1] == 'ME') {
            eventName = ci18n('announcements:girls_singles');
        } else if (eventParts[1] == 'MD') {
            eventName = ci18n('announcements:girls_doubles')
        } else if (eventParts[1] == 'GD' || eventParts[1] == 'MX') {
            eventName = ci18n('announcements:mixed_doubles')
        } else if (eventParts[1] == 'HE') {
            eventName = ci18n('announcements:men_singles');
        } else if (eventParts[1] == 'HD') {
            eventName = ci18n('announcements:men_doubles');
        } else if (eventParts[1] == 'DE') {
            eventName = ci18n('announcements:women_singles');
        } else if (eventParts[1] == 'DD') {
            eventName = ci18n('announcements:women_doubles');
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
    return ci18n('announcements:match_number') + number + "!";
}

function createFieldAnnouncement(matchSetup) {
    if (matchSetup.court_id) {
        var court = matchSetup.court_id.split("_")[1];
        return ci18n('announcements:on_court') + court + "!";
    } else {
        return "";
    }

}

function createPreparationAnnouncement() {
    return ci18n('announcements:preparation');
}

function createMeetingPointAnnouncement() {
    return ci18n('announcements:meetingpoint');
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
            if (voices[i].voiceURI == ci18n('announcements:voice')) {
                voice = voices[i];
                break;
            }
        }
        callArray.forEach(function (part) {
            if (part && part != null) { 
                var words = new SpeechSynthesisUtterance(part);
                words.lang = ci18n('announcements:lang');
                words.rate = 1;
                words.pitch = 0;
                words.volume = 1;
                words.voice = voice;
                window.speechSynthesis.speak(words);
            }
        });
    });
}