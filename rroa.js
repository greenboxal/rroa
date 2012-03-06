var BufferList = require('./bufferlist.js').BufferList;

var program = require('commander');
var colors = require('colors');

var net = require('net');
var vm = require('vm');
var fs = require('fs');

// vars
var prompt = "# ";
var serverName = "";
var bufferList = new BufferList;
var client = new net.Socket;
var cliCommands = new Array;
var ragServer = {};

var packet_len_table = [ // U - used, F - free
	60, 3,-1,27,10,-1, 6,-1,	// 2af8-2aff: U->2af8, U->2af9, U->2afa, U->2afb, U->2afc, U->2afd, U->2afe, U->2aff
	 6,-1,18, 7,-1,39,30, 10,	// 2b00-2b07: U->2b00, U->2b01, U->2b02, U->2b03, U->2b04, U->2b05, U->2b06, U->2b07
	 6,30, 0, 0,86, 7,44,34,	// 2b08-2b0f: U->2b08, U->2b09, F->2b0a, F->2b0b, U->2b0c, U->2b0d, U->2b0e, U->2b0f
	11,10,10, 0,11, 0,266,10,	// 2b10-2b17: U->2b10, U->2b11, U->2b12, F->2b13, U->2b14, F->2b15, U->2b16, U->2b17
	 2,10, 2,-1,-1,-1, 2, 7,	// 2b18-2b1f: U->2b18, U->2b19, U->2b1a, U->2b1b, U->2b1c, U->2b1d, U->2b1e, U->2b1f
	-1,10, 8, 2, 2,14,19,19,	// 2b20-2b27: U->2b20, U->2b21, U->2b22, U->2b23, U->2b24, U->2b25, U->2b26, U->2b27
];

var packet_len_table2 = [
	-1,-1,27,-1, -1, 0,37, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3800-0x380f
	 0, 0, 0, 0,  0, 0, 0, 0, -1,11, 0, 0,  0, 0,  0, 0, //0x3810
	39,-1,15,15, 14,19, 7,-1,  0, 0, 0, 0,  0, 0,  0, 0, //0x3820
	10,-1,15, 0, 79,19, 7,-1,  0,-1,-1,-1, 14,67,186,-1, //0x3830
	 9, 9,-1,14,  0, 0, 0, 0, -1,74,-1,11, 11,-1,  0, 0, //0x3840
	-1,-1, 7, 7,  7,11, 0, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3850  Auctions [Zephyrus]
	-1, 7, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3860  Quests [Kevin] [Inkfish]
	-1, 3, 3, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3870  Mercenaries [Zephyrus]
	11,-1, 7, 3,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3880
	-1,-1, 7, 3,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0,  0, 0, //0x3890  Homunculus [albator]
];

program
	.version('+++ RROA 2.0.0\n+++ Copyright (c) 2012 GameArmor Team')
	.option('-h, --host <ip>', 'Char-server IP Address', String, '208.115.211.88')
	.option('-P, --port <port>', 'Char-server port', Number, 6121)
	.option('-u, --user <user>', 'Interserver username', String, 's1')
	.option('-p, --pass <pass>', 'Interserver password', String, 'p1')
	;

function welcome()
{
	console.log('+++ RROA 2.0.0\n+++ Copyright (c) 2012 GameArmor Team');
}

function ipToInt(ip) {
    var parts = ip.split(".");
    var res = 0;

    res += parseInt(parts[0], 10) << 24;
    res += parseInt(parts[1], 10) << 16;
    res += parseInt(parts[2], 10) << 8;
    res += parseInt(parts[3], 10);

    return res;
}

function decodeLE (bytes) {
    var acc = 0;
    for (var i = 0; i < bytes.length; i++) {
        acc += Math.pow(256,i) * bytes[i];
    }
    return acc;
}

function readCString(buff, start, len) {
	var str = '';
	
	for (i = start; i < len; i++) {
		var r = buff.readInt8(i);
		
		if (r == 0)
			break;
			
		str += String.fromCharCode(r);
	}
	
	return str;
}

client.on('end', function() {
	console.log('\nServer closed connection!'.red);
	process.exit(0);
});

client.on('close', function() {
	console.log('\nServer closed connection!'.red);
	process.exit(0);
});

client.on('error', function(err) {
	console.log('\n' + err.toString().red);
	process.exit(0);
});

client.on('data', function(data) {
	bufferList.write(data);
	
	while (bufferList.length >= 2) {
		var cmd = decodeLE(bufferList.take(2));
		var cmdIdx = undefined;
		var lenTbl = undefined;
		var size = 0;
		var hdrSize = 2;
		
		if (cmd >= 0x3800) {
			lenTbl = packet_len_table2;
			cmdIdx = cmd - 0x3800;
		} else if (cmd >= 0x2af8) {
			lenTbl = packet_len_table;
			cmdIdx = cmd - 0x2af8;
		}
				
		if (lenTbl == undefined) {
			console.log('\nUndefined packet ' + cmd + '.');
			process.exit(0);
		}
		
		size = lenTbl[cmdIdx];
		
		if (size == -1) {
			if (bufferList.length >= 4) {
				size = decodeLE(bufferList.take(4)) >> 16;
				hdrSize = 4;
			} else {
				break;
			}
		}
		
		if (size - hdrSize > bufferList.length) {
			break;
		}
		
		bufferList.advance(hdrSize);
		try {
			parsePacket(cmd, size, bufferList.take(size - hdrSize));
		} catch (ex) {
			console.log('\n' + ex.toString().red + '\n');
		}
		bufferList.advance(size - hdrSize);
	}
});

function consoleLoop() {
	program.prompt(prompt, parseCmd);
}

function parseCmd(cmd) {
	var args = new Array;
	var ac = undefined;
	var inString = false;
	
	for (var i = 0; i < cmd.length; i++) {
		var ch = cmd.charAt(i);
	
		if (ch == ' ' && !inString && ac != undefined) {
			args[args.length] = ac;
			ac = undefined;
		} else if (ch == '"' && !inString) {
			inString = true;
		} else if (ch == '"' && inString) {
			inString = false;
		} else {
			if (ac == undefined) ac = ch;
			else ac += ch;
		}
	}
	
	if (ac != undefined)
		args[args.length] = ac;
		
	if (args.length > 0 && cliCommands[args[0]] != undefined)
	{
		try {
			cliCommands[args[0]](args.slice(1));
		} catch (ex) {
			console.log('\n' + ex.toString().red + '\n');
		}
	}
	
	console.log('');
	
	consoleLoop();
}

function parsePacket(cmd, size, data) {
	if (cmd == 0x2af9) {
		var result = data.readInt8(0);
		
		if (result == 0) {
			console.log('+++ Server accepted our connection');
			
			setInterval(function () {
				var pkt = new Buffer(2);
				pkt.writeInt16LE(0x2b23, 0);
				client.write(pkt);
			}, 40000);
			
			var pkt = new Buffer(8);
			pkt.writeInt16LE(0x2afa, 0);
			pkt.writeInt16LE(8, 2);
			pkt.writeInt32LE(80, 4);
			client.write(pkt);
		} else {
			console.log('--- Server refused our connection(' + result + ')');
			process.exit(0);
		}
	}
	else if (cmd == 0x2afb) {
		var result = data.readInt8(0);
		
		if (result == 0) {
			console.log('+++ Server accepted our maps\n');
			
			ragServer.ip = client.remoteAddress;
			ragServer.port = client.remotePort;
			
			serverName = readCString(data, 1, 24);
			prompt = serverName.green + ' ' + (client.remoteAddress + ':' + client.remotePort).yellow + '\n$ ';
			
			consoleLoop();
		} else {
			console.log('--- Server refused our maps(' + result + ')');
			process.exit(0);
		}
	}
	else if (cmd == 0x2b00) {
		ragServer.usersOnline = data.readUInt32LE(0);
	}
	else if (cmd == 0x2b0f) {
		var accid = data.readUInt32LE(0);
		var name = readCString(data, 4, 24);
		var type = data.readUInt16LE(28);
		var answer = data.readUInt16LE(30);
		
		var action = "";
		var output = "";
		
		switch (type) {
			case 1: action = "block"; break;
			case 2: action = "ban"; break;
			case 3: action = "unblock"; break;
			case 4: action = "unban"; break;
			case 5: action = "change the sex of"; break;
			default: action = "???"; break;
		}
		
		switch (answer) {
			case 0: output = "Login-server has been asked to " + action + " the player '" + name + "'."; break;
			case 1: output = "The player '" + name + "' doesn't exist."; break;
			case 2: output = "Your GM level don't authorise you to " + action + " the player '" + name + "'."; break;
			case 3: output = "Login-server is offline. Impossible to " + action + " the player '" + name + "'."; break;
		}
		
		console.log(output);
	}
	else if (cmd == 0x3800) {
		console.log('Broadcast: '.white.bold + readCString(data, 12, size - 16));
	}
}

function initCommands() {
	cliCommands["fakew"] = function(args) {
		var pkt = new Buffer(4);
		pkt.writeInt16LE(0x2afe, 0);
		pkt.writeUInt16LE(parseInt(args[0]), 2);
		client.write(pkt);
	};
	
	cliCommands["sinfo"] = function(args) {
		console.log(ragServer);
	};
	
	cliCommands["script"] = function(args) {
		var file = args[0];

		try {
			var data = fs.readFileSync(file, 'ascii');
			var sandbox = { console: console, client: client, parseCmd: parseCmd, program: program, args: args.slice(1) };
			var script = vm.createScript(data, file);
			
			script.runInNewContext(sandbox);
		} catch (ex) {
			console.log('\n' + ex.toString().red + '\n');
		}
	};
}

program.parse(process.argv);

if (program.host == undefined || program.port == undefined) {
	console.log(program.helpInformation());
	process.exit(0);
}

initCommands();
welcome();

client.connect(program.port, program.host, function() {
	console.log('+++ Client connected.');
	
	var pkt = new Buffer(60);
	pkt.writeInt16LE(0x2af8, 0);
	pkt.write(program.user, 2, 24, 'utf8');
	pkt.write(program.pass, 26, 2, 'utf8');
	pkt.writeInt32BE(0, 50);
	pkt.writeInt32BE(ipToInt(client.address().address), 54);
	pkt.writeInt16BE(client.address().port, 58);
	client.write(pkt);
});
