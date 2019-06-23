"use strict";
//------Global variables-----
var clientUsername = "";
var clientEmail = "";
var clientIsLoggedIn = false;
var connection = null;

//const serverHostname = '192.168.1.3'; // Home
//const serverHostname = '35.237.137.132'; // Cloud
//const serverHostname = 'http://192.168.0.109:3000'; // Alex's
const serverHostname = 'https://thequicktalk.herokuapp.com'

const serverPort = 3000;

const socket = io(serverHostname);

socket.on('serverConnection', function(msg) {
	console.log(msg);
});

socket.on('userInputError', function(msg) {
	notify(msg);
});

socket.on('signedUp', function(msg) {
	// REMEMBER TO LOG IN THE USER HERE
	notify(msg);
});

socket.on('loginStatus', function(loginMessage) {
	if (loginMessage.status) {
		saveAccountInfo(loginMessage.username, loginMessage.email, loginMessage.password);
	} else {
		notify("FAILED TO LOGIN");
	}
});

socket.on('loggedIn', function (msg) {
	notify(msg);
});

socket.on('waitingForAnswer', function(waitMessage) {
	notify("WAITING FOR A PARTNER TO ANSWER YOUR CALL");
});

socket.on('availableTime', function (timeMessage) {
	displayTime(timeMessage);
});

socket.on('peerLeft', function (friendUsername) {
	notify(friendUsername + " has left the call.");
	setTimeout(function(){
		hangup();
	}, 4000);
});

socket.on('matched', function(msg) {
	console.log("MATCHED WITH:", msg.peer, "IN:", msg.subject);
	let infoCell = document.getElementById("about-cell");
	infoCell.innerHTML = "<div class='text'>In a call with " + msg.peer + "</div>";
//	var mediaStream = navigator.mediaDevices.getUserMedia({
//      audio: true,
//      video: false
//    }).timeout(100000);

	// If the user approves the use of voice/video
//	mediaStream.then(function(stream) {
//		console.log(mediaStream);
	const peer = new SimplePeer({initiator: window.location.href.endsWith("teach.html")});
//		console.log(peer);

	peer.on('signal', data => {
		let signal = JSON.stringify(data); // Send this data to other peer for peer.signal()
//		console.log("SIGNAL:", signal);
		if (peer.initiator) {
//				console.log("SENDING OFFER");
			socket.emit('offer', signal);
		} else {
//				console.log("SENDING ANSWER");
			socket.emit('answer', signal);
		}
	});

	socket.on('offer', function (offerData) {
//			console.log("RECIEVING OFFER:", offerData)
		peer.signal(JSON.parse(offerData));
	});

	socket.on('answer', function (answerData) {
//			console.log("RECIEVING ANSWER:", answerData)
		peer.signal(JSON.parse(answerData));
	});

	// Called upon successful connection- YAY!
	peer.on('connect', () => {
		console.log("CONNECTED TO PEER");
		var mediaStream = navigator.mediaDevices.getUserMedia({audio: true, video: false}).timeout(100000);
		mediaStream.then(function(stream) {
			socket.emit('peerConnect');
			peer.addStream(stream);
			setTimeout(function(){
				
				setupCallCell();
				
			}, 2000);
		}).catch(function(e) {
			console.log(e);
			notify("USER MUST ALLOW VOICE AND VIDEO");
		});

	});

	peer.on('close', () => {
		console.log("DISCONNECTED FROM PEER");

//			socket.emit('peerDisconnect', msg);
	});

	peer.on('data', data => {
		console.log('data: ' + data);
	});

	peer.on('stream', stream => {
		// got remote video stream, now let's show it in a video tag
//			var video = document.getElementById('incomingVideo');
//			console.log(video);
//			if ('srcObject' in video) {
//				video.srcObject = stream;
//			} else {
//				video.src = window.URL.createObjectURL(stream); // for older browsers
//			}
//
//			video.play();
		let audio = document.getElementById('incomingAudio');
		window.stream = stream;
		audio.srcObject = stream;
		audio.play();

	});
//	}).catch(function(e) {
//		console.log(e);
//		alert("USER MUST ALLOW VOICE AND VIDEO");
//	});

});

socket.on('insufficientTime', function(msg) {
	notify("YOU HAVEN'T EARNED ENOUGH TIME, PLEASE TEACH TO GET MORE TIME");
});

function hangup() {
	window.location.reload();
}

function setupCallCell() {	
	
	
	let hangupCell = document.getElementById('call-cell');
	hangupCell.onclick = hangup;
	hangupCell.innerHTML = '';
	let hangupText = document.createElement('div');
	hangupText.className = 'text';
	hangupText.appendChild(document.createTextNode("Hangup"));
	hangupCell.appendChild(hangupText);
}

function displayTime(timeMessage) {
	timeMessage.timeLeft = Math.round(timeMessage.timeLeft);
	let parent = document.getElementById('scroll-cell');
	let toDeactivate = parent.children;
	for (let el of toDeactivate) {
		el.style.display = 'none';
	}
	
//	let timer = document.createTextNode("YOUR AVAILABLE TIME");
//	timeDisplay.appendChild(timer);
	
//	let timeLabel = parent.appendChild(document.createElement("div"));
//	timeLabel.className = 'text';
//	timeLabel.innerHTML = "AVAILABLE TIME\n";
	let timeDisplay = parent.appendChild(document.createElement("div"));
	timeDisplay.className = 'text';

	let interval = setInterval(function() {
		if (timeMessage.isAccruing) {
			timeMessage.timeLeft += 1;
			// display
		} else {
			timeMessage.timeLeft -= 1;
		}
		
		timeDisplay.innerHTML = "TIME AVAILABLE\n" + convertSecondsToHours(timeMessage.timeLeft);
		
	}, 1000);
	
	
}

function convertSecondsToHours(seconds) {
	    // Hours, minutes and seconds
    var hrs = ~~(seconds / 3600);
    var mins = ~~((seconds % 3600) / 60);
    var secs = ~~seconds % 60;

    // Output like "1:01" or "4:03:59" or "123:03:59"
    var ret = "";

    if (hrs > 0) {
        ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }

    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}

function createAudioElement(initiator) {
	let parentElement = document.getElementById("call-cell");
	
	let audioElement = document.createElement("audio");
	parentElement.appendChild(audioElement);
	parentElement.onclick = null;
	return audioElement;
}

function call(messageKind) {
	let accountInfo = getAccountInfo();
	if (!getAccountInfo()) {
		notify("YOU MUST FIRST LOGIN");
		return;
	}
	
	if (optionList.size == 0) {
		notify("YOU MUST FIRST CHOOSE A LANGUAGE");
		return;

	}
	
	let aboutCell = document.getElementById('about-cell');
	aboutCell.innerHTML = '';
	let waitingInfo = document.createElement('div');
	waitingInfo.className = 'text';
	waitingInfo.innerHTML = "Please wait while we match you with a partner. Since QuickTalk is brand new this could take while. Please be patient so we can get our legs!";
	aboutCell.appendChild(waitingInfo);
	
	
	showLoadingCircle();
	
	const message = {
		username: accountInfo.username,
		kind: messageKind,
		options: Array.from(optionList), //Because stringify doesn't work with sets
		accountInfo: accountInfo
	}
	socket.emit('matchRequest', message);
}

function showLoadingCircle() {
	let loadingCircle = document.createElement('div');
	loadingCircle.appendChild(document.createElement('div'));
	loadingCircle.className = 'loading-circle';
	let container = document.getElementById('scroll-cell');
	container.innerHTML = '';
	container.appendChild(loadingCircle);
}

function getAccountInfo() {
	let accountInfo = localStorage.getItem('accountInfo');
	if (!accountInfo) {
		return false;
	}
	
	accountInfo = atob(accountInfo);
	accountInfo = JSON.parse(accountInfo);
	return accountInfo;
	
}

function saveAccountInfo(givenUsername, givenEmail, givenPassword) {
	let accountInfo = {
		username: givenUsername,
		email: givenEmail,
		password: givenPassword
	}
	
	accountInfo = JSON.stringify(accountInfo);
	accountInfo = btoa(accountInfo);
	localStorage.setItem('accountInfo', accountInfo);
	
}

function login() {
	const inputEmail = document.getElementById("email-input").value;
	const inputPassword = document.getElementById("password-input");
	
	if (userFormIsNotValid("username", inputEmail, inputPassword)) {
		return;
	}
	const loginMessage = {
		email: inputEmail, 
		password: inputPassword.value
	};

	socket.emit('login', loginMessage);
	//NOTE THE FOLLOWING IS ONLY TEMPORARY
//	saveAccountInfo(inputEmail, inputEmail, inputPassword.value);

}

function signUp() {
	const inputUsername = document.getElementById("username-signup-input").value;
	const inputEmail = document.getElementById("email-signup-input").value;
	const inputPasswords = document.getElementsByClassName("signup-password");
	
	if (userFormIsNotValid(inputUsername, inputEmail, inputPasswords)) {
		return;
	}

	if (passwordsNotEqual(inputPasswords)) {
		return;
	}
	
	const signUpMessage = {
		username: inputUsername, 
		email: inputEmail, 
		password: inputPasswords[0].value
	};

	socket.emit('signup', signUpMessage);
	saveAccountInfo(inputUsername, inputEmail, inputPasswords[0].value);
}

function logout() {
	localStorage.clear();
	socket.emit('logout');
	notify("You have logged out");
	// user feedback
}

function notify(str) {
	let activeModals = document.getElementsByClassName('modal');
	
	for(let modal of activeModals) {
		modal.style.display = "none";
	}
	
	let modalParent = document.createElement('div');
	modalParent.className = 'modal';
	let span = document.createElement('span');
	span.className = 'close';
	span.innerHTML = "&times;"
	modalParent.appendChild(span);
	span.onclick = deactivate(span.parentNode);

	let modalContent = document.createElement('div');
	modalContent.className = 'modal-content animate';
	let modalContainer = document.createElement('div');
	modalContainer.className = 'container dark-text';
	let modalText = document.createElement('div');
	modalText.className = 'info dark-text';
	modalText.innerHTML = str;
	
	modalContainer.appendChild(modalText);
	modalContent.appendChild(modalContainer);
	modalParent.appendChild(modalContent);
	document.getElementById('body').appendChild(modalParent);
	modalParent.style.display = 'block';
}

function userFormIsNotValid(inputUsername, inputEmail, inputPassword) {

	if (!inputUsername || !inputEmail || !inputPassword) {
	notify("You left a field blank");
	return true;
	}
	
	return false;
}

function passwordsNotEqual(inputPasswords) {
	let i;
	let first = inputPasswords[0].value;
	for (i = 0; i < inputPasswords.length; i++) {
		if (first != inputPasswords[i].value) {
			notify("Passwords must be the same.");
			return true;
		}
	}
}

function goToLearn() {
	// Check if signed in
	window.location = "learn.html";
}

function goToTeach() {
	// Check if signed in
	window.location.href = "teach.html";

}

function activateLoginForm() {

	document.getElementById("login-modal").style.display = "block";
//	let btns = document.getElementsByClassName("userBtn");
//	deactivateElements(btns);
}

function activateProfile() {
	document.getElementById("profile-modal").style.display = "block";
	let username = getAccountInfo().username
	if (!username) {
		username = "not logged in user! Please log in."
		document.getElementById("logout-button").style.display = 'none';
	} else {
		document.getElementById("logout-button").style.display = 'inline'

	}
	let profileContainer = document.getElementById("profile-username");
	profileContainer.innerHTML = '';
	let usernameDiv = document.createElement("div");
	let usernameText = document.createTextNode("Hello " + username);
	usernameDiv.appendChild(usernameText);
	profileContainer.appendChild(usernameDiv);
	
}

function deactivate(element) {
	element.style.display = "none";
}

function activateSignupForm() {
	document.getElementById("signup-modal").style.display = "block";

}

function deactivateElements(elements) {
	let i;
	for (i = 0; i < elements.length; i++) {
		elements[i].style.display = "none";
	}

}

let optionList = new Set();

/* When the user clicks on the button, 
toggle between hiding and showing the dropdown content */
function wantToLearn() {
	document.getElementById("learnDropdown").classList.toggle("show");

}

function addOption(element) {
	if (optionList.has(element.id)) {
		optionList.delete(element.id);
		element.style.filter = 'brightness(100%)'
		
	} else {
		optionList.add(element.id);
		element.style.filter = 'brightness(120%)'
	}
}

function moveTo(from) {
	document.getElementById(from.dataset.toActivate).style.display = "block";	document.getElementById(from.dataset.toDeactivate).style.display = "none";
}

// Close the dropdown if the user clicks outside of it
window.onclick = function(event) {
	if (!event.target.classList.contains('dropdown')) {
		let dropdowns = document.getElementsByClassName("dropdown-content");
		let i;
		for (i = 0; i < dropdowns.length; i++) {
			let openDropdown = dropdowns[i];
			if (openDropdown.style.display != "none") {

				openDropdown.style.display = "none";
			}
		}
	}
	if (event.target.classList.contains("modal")) {
		event.target.style.display = "none";
	}
}





// Adding timout functionality to promises
Promise.wait = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
};

Promise.prototype.timeout = function(ms) {
    return Promise.race([
        this, 
        Promise.wait(ms).then(function () {
            throw new Error("time out");
        })
    ])
};

