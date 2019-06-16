"use strict";
//------Imports------
const app = require('express')();
const http = require('http');
const server = http.Server(app);
const io = require('socket.io')(server);
const mongoose = require('mongoose');
const User = require('./user-schema');
const bcrypt = require('bcrypt-nodejs');


//-----Global Variables------
//const hostname = '216.227.1.113'; // Home
const hostname = '35.237.137.132'; // Cloud
//const hostname = '192.168.0.109'; // Alex's

const localhost = '0.0.0.0'
const port = 3000;
const mongoDB = 'mongodb://' + localhost + '/my_database';
let clients = {};
let learnerDict = {};
let teacherDict = {};
const connectedPeers = new Set();
SALT_WORK_FACTOR = 10;


io.origins('*:*')
// Start Listening
server.listen(port, localhost, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
// Connect to mongoDB
mongoose.connect(mongoDB, { useNewUrlParser: true });
mongoose.set('useCreateIndex', true);
//Get the default connection
const dbConnection = mongoose.connection;
//Bind connection to error event (to get notification of connection errors)
dbConnection.on('error', console.error.bind(console, 'MongoDB connection error:'));

// When a client connects to the server
io.on('connection', function (socket) {
	// When the connection is opened
	let userName = "";
	clients[socket.id] = socket;
	
	// Make appropriate logs
	let ipAddress = socket.request.connection.remoteAddress;
	console.log('NEW CONNECTION FROM', ipAddress, "ON", new Date());
	console.log("CURRENTLY", Object.keys(clients).length, "CONNECTIONS");
	socket.emit('serverConnection', "CONNECTED TO SERVER");
	
	// Register listeners
	onClientDisconnect(socket);
	onMatchRequest(socket);
	onSignUp(socket);
	onLogin(socket);
	authenticateSession(socket);
});

function authenticateSession(socket) {
	socket.on('authenticateSession', function(data) {
		let loggedIn = validateEmailAndPassword(data.email, data.password).then(function(isMatch) {
			if(isMatch) {
				console.log("SUCCESSFUL LOGIN");
			} else {
				console.log("FAILED LOGIN");
			}
		}).catch(function(err) {
			console.log(err);
		});
	});
}

function onLogin(socket) {
	socket.on('login', function(data) {
		let loggedIn = validateEmailAndPassword(data.email, data.password).then(function(isMatch) {
			
			
			let loginMessage = {
				status: false,
				username: null,
				email: null,
			}
			
			if(isMatch) {
				loginMessage.status = true;
				loginMessage.username = isMatch.username;
				loginMessage.email = isMatch.email;
			} else {
				console.log("FAILED LOGIN");
				socket.emit('loginStatus', loginMessage);
			}
			
			socket.emit('loginStatus', loginMessage);
			
		}).catch(function(err) {
			console.log(err);
			socket.emit('loginStatus', false);
		});
	});
}

// When a user attempts a sign up. Invalid input will be caught.
function onSignUp(socket) {
	socket.on('signup', function(data) {
		let newUser = new User({username: data.username, email: data.email, password: data.password});
		newUser.save().then(function() {
			let successMessage = "NEW USER " + newUser.username +" SIGNED UP";
			console.log(successMessage);
			socket.emit('goodSignUp', successMessage);
			
		}).catch(function(err) {
			userInputError(socket, err);
		});
	});
}

function validateEmailAndPassword(inputEmail, inputPassword) {
	return User.findOne({ email: inputEmail}, function (err, user){
		if (err || !user) {
			console.log(inputEmail);
			return false;
		}
		user.comparePassword(inputPassword, function(err, isMatch) {
			return isMatch;
		});
	});
}

//function getLoginToken(givenEmail, givenUsername, givenPassword) {
//	let token = hashString(givenEmail + givenUsername + givenPassword);
//	console.log(token);
//	User.findOneAndUpdate({username: givenUsername}, {loginToken: token}, {upsert:true});
//	return token;
//}

function hashString(toHash) {
		// generate a salt
	bcrypt.genSaltSync(SALT_WORK_FACTOR, function(err, salt) {

			// hash the password using our new salt
			bcrypt.hashSync(toHash, salt, null, function(err, hash) {
					// override the cleartext password with the hashed one
				toHash = hash;
			
			});
	});
	
	return toHash;
}


// A helper function for whenever we want to catch a database error due to user input
function userInputError(socket, err) {
			const errorMessage = err.errors[Object.keys(err.errors)[0]].message;
			console.log(errorMessage);
			socket.emit('userInputError', errorMessage);
}

// When a client, for example, refreshes a page
function onClientDisconnect(socket) {
	socket.on('disconnect', function () {
		delete clients[socket.id];
		delete learnerDict[socket.id];
		delete teacherDict[socket.id];
		console.log("USER DISCONNECTED");
	});
}

// When a client starts their search
function onMatchRequest(socket) {
	socket.on('matchRequest', function (data) {
		let payload = data;
		if (!payload.username) {
			socket.emit('userInputError', "USER FORGOT TO INPUT USERNAME");
			return;
		}
		
		console.log("CALL FROM: " + payload.username);
		payload.socketId = socket.id;
		let match = handleCallPayload(payload);

		if (match) {
			console.log(match);
			setupCall(match, socket);
		} else {
			putOnWaitingList(payload.username, socket);
		}

	});
}

// Intended to be a simple all purpose payload handler
function handleCallPayload(payload) {
	switch (payload.kind) {
		case 'teach':
			teacherDict[payload.socketId] = new Teacher(payload.username, payload.options, payload.socketId);
			return searchForMatch();
		case 'learn':
			learnerDict[payload.socketId] = new Learner(payload.username, payload.options, payload.socketId);
			return searchForMatch();
	}
	return false;
}

// The business logic of matchmaking. When called, finds the intersection of teachers or learners of the same subject. 
function searchForMatch() {
	for (let teacherSocketId in teacherDict) {
		for (let learnerSocketId in learnerDict) {
			const teacherPerson = teacherDict[teacherSocketId];
			const learnerPerson = learnerDict[learnerSocketId];
			// Finds the intersection
			const intersection = new Set(Array.from(teacherPerson.wantToTeachList).filter(subject => learnerPerson.wantToLearnList.has(subject)));
			if (intersection.size > 0) {
				console.log("MATCH MADE");
				delete learnerDict[learnerSocketId];
				delete teacherDict[teacherSocketId];
				return {
					subject: intersection.entries().next().value[0],
					teacher: teacherPerson,
					learner: learnerPerson
				};
			}
		}
	}
	return false;
}
// Handles the WebRTC signalling by letting the client know they can setup the Webrtc stuff and then handling the consequent offer and answer signals.
function setupCall(match, socket) {
	
	let learnerSocket = clients[match.learner.socketId];
	let teacherSocket = clients[match.teacher.socketId];
	
	let messageToLearner = {
		subject: match.subject,
		peer: match.teacher.username,
		socketId: match.teacher.socketId,
	};
	
	let messageToTeacher = {
		subject: match.subject,
		peer: match.learner.username,
		socketId: match.learner.socketId,
	};
	
	// Let the client know to register the handlers related to WebRTC
	learnerSocket.emit('matched', messageToLearner);
	teacherSocket.emit('matched', messageToTeacher);

	// Handle the signaling logic
	teacherSocket.on('offer', function (offerData) {
//		console.log("RECIEVING OFFER:", offerData)
		learnerSocket.emit('offer', offerData);
	});
	
	learnerSocket.on('answer', function (answerData) {
//		console.log("RECIEVING ANSWER:", answerData)
		teacherSocket.emit('answer', answerData);
	});

}

// For when there is no match and the usermust wait
function putOnWaitingList(username, socket) {
	console.log("NO MATCH MADE, PUTTING", username, "ON WAITING LIST");
	
	let waitMessage = {
		waiting: true
	}
	
	socket.emit('waitingForAnswer', waitMessage);
}

// The following two classes are a precaution in case we want to extend them.
class Learner {
	constructor(username, wantToLearnList, socketId) {
		this.username = username;
		this.wantToLearnList = new Set(wantToLearnList);
		this.socketId = socketId;
	}
}	

class Teacher {
	constructor(username, wantToTeachList, socketId) {
		this.username = username;
		this.wantToTeachList = new Set(wantToTeachList);
		this.socketId = socketId;
	}
}


