//------Imports------
"use strict";
const app = require('express')();
const http = require('http');
const server = http.Server(app);
const io = require('socket.io')(server);
const mongoose = require('mongoose');
const User = require('./user-schema');

//-----Global Variables------
const hostname = '35.237.137.132'; // Change if change servers
const port = 3000;
const mongoDB = 'mongodb://' + hostname + '/my_database';
let clients = {};
let learnerDict = {};
let teacherDict = {};
const connectedPeers = new Set();

// Start Listening
server.listen(port, '127.0.0.1', () => {
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
	console.log("CONNECTION", Object.keys(clients).length);
	socket.emit('serverConnection', "CONNECTED TO SERVER");
	
	// Register listeners
	onClientDisconnect(socket);
	onMatchRequest(socket);
	onSignUp(socket);
});

function onSignUp(socket) {
	socket.on('signup', function(data) {
		let newUser = new User({username: data.username, email: data.email, password: data.password});
		newUser.save().then(function() {
			console.log("NEW USER", newUser.username,"SIGNED UP");
			socket.emit('goodSignUp');
			
		}).catch(function(err) {
			const errorMessage = err.errors[Object.keys(err.errors)[0]].message;
			console.log(errorMessage);
			socket.emit('badSignUp', errorMessage);
			
		});
	});
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
		
		console.log("MESSAGE FROM: " + payload.username);
		payload.socketId = socket.id;
		let match = handleCallPayload(payload);

		if (match) {
			console.log(match);
			setupCall(match, socket);
		} else {
			putOnWaitingList(payload.username)
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
function putOnWaitingList(username) {
	console.log("NO MATCH MADE, PUTTING", username, "ON WAITING LIST");
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


