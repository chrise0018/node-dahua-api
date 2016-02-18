#!/usr/bin/nodejs
// Dahua HTTP API Module

var 	net 		= require('net');
var  	events 		= require('events');
var 	util		= require('util');
var 	request 	= require('request');

var	TRACE		= true;
var	BASEURI		= false;

var dahua = function(options) {
	events.EventEmitter.call(this)
	this.client = this.connect(options)
	TRACE = options.log
	BASEURI = 'http://' + options.user + ':' + options.pass + '@' + options.host + ':' + options.port
};

util.inherits(dahua, events.EventEmitter);

dahua.prototype.connect = function(options) {
	var self = this
	var authHeader = 'Basic ' + new Buffer(options.user + ':' + options.pass).toString('base64');
	// Connect
	var client = net.connect(options, function () {
		client.write(	'GET /cgi-bin/eventManager.cgi?action=attach&codes=[AlarmLocal,VideoMotion,VideoLoss,VideoBlind] HTTP/1.0\r\n' +
				'Host: ' + options.host + ':' + options.port + '\r\n' +
				authHeader + '\r\n' + 
				'Accept: multipart/x-mixed-replace\r\n' + 
				'Connection: Keep-Alive\r\n\r\n');
        	handleConnection(self);
	});

	client.on('data', function(data) {
       		handleData(self, data)
	});

	client.on('close', function() {
		handleEnd(self)
	});

	client.on('error', function(err) {
		handleError(self, err)
	});
}

dahua.prototype.ptzCommand = function (cmd,arg1,arg2,arg3,arg4) {
    	var self = this;
	if ((!cmd) || (isNaN(arg1)) || (isNaN(arg2)) || (isNaN(arg3)) || (isNaN(arg4))) {
		handleError(self,'INVALID PTZ COMMAND')
		return 0
	}
	request(BASEURI + '/cgi-bin/ptz.cgi?action=start&channel=0&code=' + ptzcommand + '&arg1=' + arg1 + '&arg2=' + arg2 + '&arg3=' + arg3 + '&arg4=' + arg4, function (error, response, body) {
		if ((error) || (response.statusCode !== 200) || (body.trim() !== "OK")) {
			self.emit("error", 'FAILED TO ISSUE PTZ COMMAND');
		}
	})
}

dahua.prototype.ptzPreset = function (preset) {
    	var self = this;
	if (isNaN(preset))	handleError(self,'INVALID PTZ PRESET');
	request(BASEURI + '/cgi-bin/ptz.cgi?action=start&channel=0&code=GotoPreset&arg1=0&arg2=' + preset + '&arg3=0', function (error, response, body) {
		if ((error) || (response.statusCode !== 200) || (body.trim() !== "OK")) {
			self.emit("error", 'FAILED TO ISSUE PTZ PRESET');
		}
	})
}

dahua.prototype.ptzZoom = function (multiple) {
    	var self = this;
	if (isNaN(multiple))	handleError(self,'INVALID PTZ ZOOM');
	if (multiple > 0)	cmd = 'ZoomTele';
	if (multiple < 0)	cmd = 'ZoomWide';
	if (multiple === 0)	return 0;

	request(BASEURI + '/cgi-bin/ptz.cgi?action=start&channel=0&code=' + cmd + '&arg1=0&arg2=' + multiple + '&arg3=0', function (error, response, body) {
		if ((error) || (response.statusCode !== 200) || (body.trim() !== "OK")) {
			self.emit("error", 'FAILED TO ISSUE PTZ ZOOM');
		}
	})
}

dahua.prototype.ptzMove = function (direction,action,speed) {
    	var self = this;
	if (isNaN(speed))	handleError(self,'INVALID PTZ SPEED');
	if ((action !== 'start') || (action !== 'stop')) {
		handleError(self,'INVALID PTZ COMMAND')
		return 0
	}
	if ((direction !== 'Up') || (direction !== 'Down') || (direction !== 'Left') || (direction !== 'Right') 
	    (direction !== 'LeftUp') || (direction !== 'RightUp') || (direction !== 'LeftDown') || (direction !== 'RightDown')) {
		handleError(self,'INVALID PTZ DIRECTION')
		return 0
	}
	request(BASEURI + '/cgi-bin/ptz.cgi?action=' + action + '&channel=0&code=' + direction + '&arg1=' + speed +'&arg2=' + speed + '&arg3=0', function (error, response, body) {
		if ((error) || (response.statusCode !== 200) || (body.trim() !== "OK")) {
			self.emit("error", 'FAILED TO ISSUE PTZ UP COMMAND');
		}
	})
}

dahua.prototype.ptzStatus = function () {
    	var self = this;
	request(BASEURI + '/cgi-bin/ptz.cgi?action=getStatus', function (error, response, body) {
		if ((!error) && (response.statusCode === 200)) {
			body = body.toString().split('\r\n')
			self.emit("ptzStatus", body);
		} else {
			self.emit("error", 'FAILED TO QUERY STATUS');
		}
	})
}

dahua.prototype.dayProfile = function () {
    	var self = this;
	request(BASEURI + '/cgi-bin/configManager.cgi?action=setConfig&VideoInMode[0].Config[0]=1', function (error, response, body) {
		if ((!error) && (response.statusCode === 200)) {
			if (body === 'Error') {		// Didnt work, lets try another method for older cameras
				request(BASEURI + '/cgi-bin/configManager.cgi?action=setConfig&VideoInOptions[0].NightOptions.SwitchMode=0', function (error, response, body) { 
					if ((error) || (response.statusCode !== 200)) {
						self.emit("error", 'FAILED TO CHANGE TO DAY PROFILE');
					}
				})
			}
		} else {
			self.emit("error", 'FAILED TO CHANGE TO DAY PROFILE');
		}	
	})
}

dahua.prototype.nightProfile = function () {
    	var self = this;
	request(BASEURI + '/cgi-bin/configManager.cgi?action=setConfig&VideoInMode[0].Config[0]=2', function (error, response, body) {
		if ((!error) && (response.statusCode === 200)) {
			if (body === 'Error') {		// Didnt work, lets try another method for older cameras
				request(BASEURI + '/cgi-bin/configManager.cgi?action=setConfig&VideoInOptions[0].NightOptions.SwitchMode=3', function (error, response, body) { 
					if ((error) || (response.statusCode !== 200)) {
						self.emit("error", 'FAILED TO CHANGE TO NIGHT PROFILE');
					}
				})
			}
		} else {
			self.emit("error", 'FAILED TO CHANGE TO NIGHT PROFILE');
		}	
	})
}

function handleData(self, data) {
	if (TRACE)	console.log('Data: ' + data.toString());
	data = data.toString().split('\r\n')
	var i = Object.keys(data);
	i.forEach(function(id){
		if (data[id].startsWith('Code=')) {
			var	alarm = data[id].split(';')
			var	code = alarm[0].substr(5)
			var	action = alarm[1].substr(7)
			var	index = alarm[2].substr(6)
			self.emit("alarm", code,action,index);
		}
	});
}

function handleConnection(self) {
	if (TRACE)	console.log('Connected to ' + options.host + ':' + options.port)
    	//self.socket = socket;
	self.emit("connect");
}

function handleEnd(self) {
	if (TRACE)	console.log("Connection closed!");
        setTimeout(function() { receiver.connect(options) }, 30000 );
	self.emit("end");
}

function handleError(self, err) {
	if (TRACE)	console.log("Connection error: " + err);
	self.emit("error", err);
}

String.prototype.startsWith = function (str){
	return this.slice(0, str.length) == str;
};

exports.dahua = dahua;
