"use strict";
//------Imports------
const express = require('express');
const app = express();
const http = require('http');
const server = http.Server(app);
const io = require('socket.io')(server);
const path = require('path');
const mongoose = require('mongoose');
const User = require('./user-schema');
const bcrypt = require('bcrypt-nodejs');


//-----Global Variables------
//const hostname = '216.227.1.113'; // Home
//const hostname = '35.237.137.132'; // Cloud
//const hostname = '192.168.0.109'; // Alex's
const hostname = 'thequicktalk.herokuapp.com'

const localhost = '0.0.0.0'
const port = process.env.PORT || 3000;
const mongoDB = 'mongodb://' + localhost + '/my_database';
let clients = {};
let learnerDict = {};
let teacherDict = {};
let userChatSessions = {};
SALT_WORK_FACTOR = 10;

app.use(express.static(path.join(__dirname, 'public')));

//io.origins('*:*')
// Start Listening
server.listen(port, localhost, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
// Connect to mongoDB
mongoose.connect(process.env.MONGODB_URI || mongoDB, { useNewUrlParser: true });
mongoose.set('useCreateIndex', true);
//Get the default connection
const dbConnection = mongoose.connection;
//Bind connection to error event (to get notification of connection errors)
dbConnection.on('error', console.error.bind(console, 'MongoDB connection error:'));

// When a client connects to the server
io.on('connection', function (socket) {
	// When the connection is opened
	clients[socket.id] = new Client(socket);
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
	onPeerConnect(socket);
	onLogout(socket);
//	onPeerDisconnect(socket);
});

function onLogout(socket) {
	socket.on('logout', function() {
		let loggedOutClient = clients[socket.id];
		console.log(loggedOutClient.username, "LOGGING OUT")
		loggedOutClient.logout();
		clients[socket.id] = loggedOutClient;
	});
}

// When a client, for example, refreshes a page
function onClientDisconnect(socket) {
	socket.on('disconnect', function () {
		let client = clients[socket.id];
		if (client.username) {
			if (client.isChatting) {
				logSession(client);
					//DATABASE
				client.isChatting = false;
				clients[client.peer].isChatting = false;
				disconnectPeer(clients[client.peer].socket);
			}
		}
		
		delete clients[socket.id];
		delete learnerDict[socket.id];
		delete teacherDict[socket.id];
		console.log("USER DISCONNECTED");
	});
}

function disconnectPeer(socket) {
	console.log("PEER DISCONNECTED");
	let client = clients[socket.id];
	let clientPeer = clients[client.peer];
	logSession(client);
	logSession(clientPeer)
	client.isChatting = false;
	clientPeer.isChatting = false;
	clients[socket.id] = client;
	clients[client.peer] = clientPeer;
	socket.emit('peerLeft', clientPeer.username);
}


function onPeerConnect(socket) {
	socket.on('peerConnect', function(data) {
		console.log("PEER CONNECTED");
		clients[socket.id].isChatting = true;
		clients[socket.id].startTime = new Date();
		emitAvailableTime(socket);
	});
}

function emitAvailableTime(socket) {
	User.findOne({'username': clients[socket.id].username}, function (err, user) {
		if (err) return console.log(err);
		let availableTime = user.availableTime;
		
		let timeMessage = {
			timeLeft: availableTime,
			isAccruing: clients[socket.id].isTeacher
		}
		
		socket.emit('availableTime', timeMessage);
	});
}

// FOR HANG UP BUTTON
//function onPeerDisconnect(socket) {
//	socket.on('peerDisconnect', function(data) {
//		console.log("PEER DISCONNECTED");
//		let client = clients[socket.id];
//		logSession(client);
//		//DATABASE
//		client.isChatting = false;
//		clients[socket.id] = client;
//		console.log(client.peer);
//		clients[client.peer].isChatting = false;
//	});
//}
//

function logSession (client) {
	let endTime = new Date();
	let secondsToAdd = (endTime.getTime() - client.startTime.getTime()) / 1000;
	if (!client.isTeacher) {
		secondsToAdd = -secondsToAdd;
	}
	
	User.findOne({'username': client.username}, function (err, user) {
		if (err) return console.log(err);
			user.availableTime += secondsToAdd;
			if (user.availableTime < 0) {
				user.availableTime = 0;
			}
			user.save();
	});

}

function authenticateSession(socket, email, password) {
	validateEmailAndPassword(email, password).then(function(isMatch) {

		let loginMessage = {
			status: false,
			username: null,
			email: null,
			password: null
		}

		if(isMatch) {
			let client = clients[socket.id];
			loginClient(client, isMatch);
			loginMessage.status = true;
			loginMessage.username = isMatch.username;
			loginMessage.email = isMatch.email;
			loginMessage.password = password;
			socket.emit('loginStatus', loginMessage);
			
		} else {
			console.log("FAILED LOGIN");
			socket.emit('loginStatus', loginMessage);
		}

		
	}).catch(function(err) {
		console.log(err);
		socket.emit('loginStatus', false);
	});
}

function onLogin(socket) {
	socket.on('login', function(data) {
		authenticateSession(socket, data.email, data.password);
		socket.emit('loggedIn', "YOU HAVE LOGGED IN");

	});
}

// When a user attempts a sign up. Invalid input will be caught.
function onSignUp(socket) {
	socket.on('signup', function(data) {
		let newUser = new User({username: data.username, email: data.email, password: data.password});
		newUser.save().then(function() {
			let client = clients[socket.id];
			loginClient(client, newUser);
			let successMessage = "NEW USER " + newUser.username +" SIGNED UP";
			console.log(successMessage);
			socket.emit('signedUp', successMessage);
			authenticateSession(socket, data.email, data.password);

		}).catch(function(err) {
			userInputError(socket, err);
		});
	});
}

function loginClient(client, info) {
	client.email = info.email;
	client.username = info.username;
	client.isLoggedIn = true;
	clients[client.socketId] = client;
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
	console.log(err);
	const errorMessage = err.errors[Object.keys(err.errors)[0]].message;
	socket.emit('userInputError', errorMessage);
}

function getAvailableTime(email) {
	User.findOne({'email': email}, function (err, user) {
		if (err) return console.log(err);
		return user.availableTime;
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
		
		authenticateSession(socket, data.accountInfo.email, data.accountInfo.password);
		
		if (payload.kind == "learn" && (getAvailableTime(data.accountInfo.email) <= 0)) {
			socket.emit('insufficientTime');
			return;
		}
		
		console.log("CALL FROM: " + payload.username);
		payload.socketId = socket.id;
		let match = handleCallPayload(payload);

		if (match) {
			console.log("MATCH MADE BETWEEN", match.teacher.username, "AND", match.learner.username);
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
	
	let learnerSocket = clients[match.learner.socketId].socket;
	let teacherSocket = clients[match.teacher.socketId].socket;
		
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

	let teacherSession = {
		subject: match.subject,
		user: match.teacher,
		peer: match.learner,
		isTeacher: true,
		startTime: null,
		endTime: null
	}
	let learnerSession = {
		subject: match.subject,
		user: match.learner,
		peer: match.teacher,
		isTeacher: false,
		startTime: null,
		endTime: null

	}	
	// Two way for ease of access
	clients[match.teacher.socketId].peer = match.learner.socketId;
	clients[match.teacher.socketId].isTeacher = true;
	clients[match.learner.socketId].peer = match.teacher.socketId;
	
	

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

class Client {
	constructor(socket) {
		this.socket = socket;
		this.socketId = socket.id;
		this.username = "";
		this.email = "";
		this.isLoggedIn = false;
		this.isChatting = false;
		this.peer = null;
		this.isTeacher = false;
		this.subject = null;
		this.startTime = null;
		this.endTime = null;
	}
	
	logout() {
			this.username = "";
		this.email = "";
		this.isLoggedIn = false;
		this.isChatting = false;
		this.peer = null;
		this.isTeacher = false;
		this.subject = null;
		this.startTime = null;
		this.endTime = null;
	}
	
}

class Session {
	constructor(teacher, learner) {
		this.teacher = teacher;
		this.learner = learner;
	}
	
	
}


