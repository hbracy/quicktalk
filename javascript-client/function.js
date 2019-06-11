"use strict";
//------Global variables-----
var clientUsername = "";
var connection = null;
const serverHostname = '35.237.137.132';
const serverPort = 3000;
const socket = io.connect("http://" + serverHostname + ":" + serverPort);

socket.on('serverConnection', function(msg) {
	console.log(msg);
});

socket.on('userInputError', function(msg) {
	alert(msg);
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

function teachCall() {
		// connection is opened and ready to use
		clientUsername = document.getElementById("email_input").value
		const teachMessage = {
			username: clientUsername,
			kind: 'teach',
			options: Array.from(wantToTeachList), //Because stringify doesn't work with sets
		}
		socket.emit('matchRequest', teachMessage);
}

function learnCall() {

		clientUsername = document.getElementById("email_input").value
		// connection is opened and ready to use
		const learnMessage = {
			username: clientUsername,
			kind: 'learn',
			options: Array.from(wantToLearnList),
		}
		
		socket.emit('matchRequest', learnMessage);
}

function signUp() {
	const inputUsername = document.getElementById("username-input").value;
	const inputEmail = document.getElementById("email-input").value;
	const inputPassword = document.getElementById("password-input").value;

	const signUpMessage = {
		username: inputUsername, 
		email: inputEmail, 
		password: inputPassword
	};

	socket.emit('signup', signUpMessage);

}

function goToLearn() {
	signUp();
	window.location = "#learn";
	document.getElementById("learn").style.display = "inline-block";
	document.getElementById("landing").style.display = "none";
}

function goToTeach() {
	signUp();
	window.location = "#teach";
	document.getElementById("teach").style.display = "inline-block";
	document.getElementById("landing").style.display = "none";

}

let wantToTeachList = new Set();
let wantToLearnList = new Set();


/* When the user clicks on the button, 
toggle between hiding and showing the dropdown content */
function wantToLearn() {
	document.getElementById("learnDropdown").classList.toggle("show");

}

function addLearn(id) {
	wantToLearnList.add(id);
	console.log(wantToLearnList);
}

function wantToTeach() {
	document.getElementById("teachDropdown").classList.toggle("show");
}

function addTeach(id) {
	wantToTeachList.add(id);
	console.log(wantToTeachList);
}



// Close the dropdown if the user clicks outside of it
window.onclick = function(event) {
	if (!event.target.matches('.dropbtn')) {
		let dropdowns = document.getElementsByClassName("dropdown-content");
		let i;
		for (i = 0; i < dropdowns.length; i++) {
			let openDropdown = dropdowns[i];
			if (openDropdown.classList.contains('show')) {
				openDropdown.classList.remove('show');
			}
		}
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

