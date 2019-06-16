"use strict";
//------Global variables-----
var clientUsername = "";
var clientEmail = "";
var clientIsLoggedIn = false;
var connection = null;

//const serverHostname = '192.168.1.3'; // Home
const serverHostname = '35.237.137.132'; // Cloud
//const serverHostname = '192.168.0.109'; // Alex's
const serverPort = 3000;

const socket = io("http://" + serverHostname + ":" + serverPort);

socket.on('serverConnection', function(msg) {
	console.log(msg);
});

socket.on('userInputError', function(msg) {
	alert(msg);
});

socket.on('goodSignUp', function(msg) {
	// REMEMBER TO LOG IN THE USER HERE
	alert(msg);
});

socket.on('loginStatus', function(loginMessage) {
	if (loginMessage.status) {
		clientUsername = loginMessage.username;
		clientEmail = loginMessage.email;
		// TODO: Eventually change the password field from null,
		// by passing it in when retrieved from the server after
		// authentication
		saveAccountInfo(loginMessage.username, loginMessage.email, null);
		alert("YOU HAVE LOGGED IN");
		
	} else {
		alert("FAILED TO LOGIN");
	}
});

socket.on('waitingForAnswer', function(waitMessage) {
	alert("WAITING FOR A PARTNER TO ANSWER YOUR CALL");
});

socket.on('matched', function(msg) {
	console.log("MATCHED WITH:", msg.peer, "IN:", msg.subject);
	var mediaStream = navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    }).timeout(100000);
	
	// If the user approves the use of voice/video
	mediaStream.then(function(stream) {
//		console.log(mediaStream);
		const peer = new SimplePeer({initiator: window.location === "#teach", stream: stream});
		
//		console.log(peer);
	
		peer.on('signal', data => {
			let signal = JSON.stringify(data); // Send this data to other peer for peer.signal()
	//		console.log("SIGNAL:", signal);
			if (peer.initiator) {
	//			console.log("SENDING OFFER");
				socket.emit('offer', signal);
			} else {
	//			console.log("SENDING ANSWER");
				socket.emit('answer', signal);
			}
		});
	
		socket.on('offer', function (offerData) {
	//		console.log("RECIEVING OFFER:", offerData)
			peer.signal(JSON.parse(offerData));
		});

		socket.on('answer', function (answerData) {
	//		console.log("RECIEVING ANSWER:", answerData)
			peer.signal(JSON.parse(answerData));
		});

		// Called upon successful connection- YAY!
		peer.on('connect', () => {
			console.log("CONNECTED TO PEER");
			peer.send('whatever' + Math.random());
		});

		peer.on('data', data => {
			console.log('data: ' + data);
		});

		peer.on('stream', stream => {
			// got remote video stream, now let's show it in a video tag
			var video = document.getElementById('incomingVideo');
			console.log(video);
			if ('srcObject' in video) {
				video.srcObject = stream;
			} else {
				video.src = window.URL.createObjectURL(stream) // for older browsers
			}

			video.play()

		});
	}).catch(function(e) {
		alert("USER MUST ALLOW VOICE AND VIDEO");
	});

});

function call(messageKind) {
	let accountInfo = getAccountInfo();
	if (!getAccountInfo()) {
		alert("USER MUST FIRST LOGIN");
		return;
	}
	
	if (optionList.size == 0) {
		alert("USER MUST FIRST CHOOSE A LANGUAGE");
		return;

	}
	
	const message = {
		username: accountInfo.username,
		kind: messageKind,
		options: Array.from(optionList), //Because stringify doesn't work with sets
	}
	socket.emit('matchRequest', message);
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


function userFormIsNotValid(inputUsername, inputEmail, inputPassword) {

	if (!inputUsername || !inputEmail || !inputPassword) {
	alert("You left a field blank");
	return true;
	}
	
	return false;
}

function passwordsNotEqual(inputPasswords) {
	let i;
	let first = inputPasswords[0].value;
	for (i = 0; i < inputPasswords.length; i++) {
		if (first != inputPasswords[i].value) {
			alert("Passwords must be the same.");
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
	optionList.add(element.id);
	console.log(optionList);
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

