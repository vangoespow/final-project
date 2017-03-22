// set port to a variable, good practice
var PORT = process.env.PORT || 8080;

// require modules
var express = require('express');
var request = require('request');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var mysql = require('mysql');

// initialize express
var app = express();
// serve static html page
app.use(express.static(path.join(__dirname, '/public')));

// use the express body-parser
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());

app.use(cookieParser());

// Read in strings from files for security
var dbpass = fs.readFileSync('./pass.txt', 'utf8');
var client_id = fs.readFileSync('./clientId.txt', 'utf8');
var client_secret = fs.readFileSync('./clientSecret.txt', 'utf8');

// Database credentials
var con = mysql.createConnection({
	host: 'localhost',
	user: 'jh3377',
	password: dbpass,
	database: 'spotify'
});

// Connecting to database status
con.connect(function(err) {
	if (err) {
		console.log("Error connecting to database");
	}
	else {
		console.log("Database successfully connected");
	}
});

var redirect_uri = 'http://localhost:8080/callback';
var stateKey = 'spotify_auth_state';

//=========================SPOTIFY TEST ACCOUNT============================
// Username: adidasvan97@gmail.com OR vangoespow
// Password: drexel2020
//=========================================================================

// Login function
app.get('/login', function(req, res) {
	var state = '34fFs29kd09'; 
	res.cookie(stateKey, state);
	var scopes = 'user-top-read user-library-read user-follow-read';

	// redirect to authorization page
    res.redirect('https://accounts.spotify.com/authorize?' +
    		querystring.stringify({
    		response_type: 'code', // required by Spotify API
    		client_id: client_id, // Application's client ID, provided by Spotify
    		scope: scopes, // access permissions sought
    		redirect_uri: redirect_uri, // redirect to here after login, which is a function for authenticating
    		state: state // assures incoming connection is the result of authentification request
    }));
});

//Logout function
function goBack(){
	require('openurl').open('http://localhost:8080/');
}

app.get('/logout', function(req,res) {
	res.redirect('https://www.spotify.com/us/logout/'); // Resets authorization token in URL
	goBack();
});

// Callback function
app.get('/callback', function(req, res) {
	var code = req.query.code;
	var state = req.query.state;
	var storedState = req.cookies ? req.cookies[stateKey] : null;

	if (state != storedState) {
    res.redirect('/#' + // Redirect to error URL
      querystring.stringify({
        error: 'state_mismatch'
      }));
	} 
	else {
	    res.clearCookie(stateKey);
	    var authOptions = {
	    	url: 'https://accounts.spotify.com/api/token',
	    	form: {
	        code: code,
	        redirect_uri: redirect_uri,
	        grant_type: 'authorization_code'
	    },
	    headers: {
	    	'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
	    },
	    json: true
	};
	request.post(authOptions, function(error, response, body) {
		if (!error && response.statusCode == 200) { // If there's no error and the status is OK
			var access_token = body.access_token;
            var options = {
            	url: 'https://api.spotify.com/v1/me',
            	headers: { 'Authorization': 'Bearer ' + access_token },
            	json: true
            };

        request.get(options, function(error, response, body) {
        	console.log(body);
        });

		res.redirect('/#' +
			querystring.stringify({
				access_token: access_token
		    }));
		} 
	    else {
	    	res.redirect('/#' +
	    		querystring.stringify({
	            error: 'invalid_token'
	        }));
	    }
	});
  }
});

// Insert User's Top Tracks For Today function
app.post('/insertTracksDb', function(req, res) {
	//console.log(req.body.id);
	var rankCount = 1;
	for(var i = 0; i < req.body.size; i++){
		var data = { // Data to add to the tracks table
			userid: req.body.id,
			rank: rankCount++,
			track_name: req.body["tName[]"][i],
			album_name: req.body["alName[]"][i],
			artist_name: req.body["arName[]"][i],
			popularity: req.body["pop[]"][i],
			album_image_url: req.body["alUrl[]"][i],
			date_received: req.body.date
		};
		
		// Inserting the data to the table
		var insert = con.query('INSERT INTO tracks SET ?', data, function(error, results, fields){
			 if (error){
				console.log("Error in tracks insertion process");
			 }
		});
		
		console.log(insert.sql);
	}
});

// Insert User's Top Artists For Today function
app.post('/insertArtistsDb', function(req, res) {
	console.log(req.body.id);
	var rankCount = 1;
	for(var i = 0; i < req.body.size; i++){
		var data = { // Data to add to artists table
			userid: req.body.id,
			rank: rankCount++,
			artist_name: req.body["arName[]"][i],
			popularity: req.body["pop[]"][i],
			artist_image_url: req.body["arUrl[]"][i],
			date_received: req.body.date
		};
		
		// Inserting the data to the table
		var insert = con.query('INSERT INTO artists SET ?', data, function(error, results, fields){
			 if (error){
				console.log("Error in artists insertion process");
			 }
		});
		
		console.log(insert.sql);
	}
});

// Delete User's Top Tracks For Today function
app.post('/deleteTracks', function(req, res) {
	con.query('DELETE FROM tracks WHERE userid = \'' + req.body.id + '\' AND date_received = \'' + req.body.date + '\'', 
	function(err, results, fields){
		if (err){ // Output to console the result of the query
			console.log("Error in tracks deletion process");
		}
		else {
			console.log("Tracks deletion successful.");
		}
	})
});

// Delete User's Top Artists For Today function
app.post('/deleteArtists', function(req, res) {
	con.query('DELETE FROM artists WHERE userid = \'' + req.body.id + '\' AND date_received = \'' + req.body.date + '\'', 
	function(err, results, fields){
		if (err){ // Output to console the result of the query
			console.log("Error in artists deletion process");
		}
		else {
			console.log("Artists deletion successful.");
		}
	})
});

// Function that gets the dates stored in the tracks table from the database
app.get('/dbDatesTr', function(req, res) {
	con.query('SELECT * FROM tracks WHERE userid = \'' + req.query.userid + '\'', //Query to get the dates to display in the select boxes
	function(err,rows,fields) {
		if (err)
			console.log('Error get track database dates');
		else
		{
			//Update the select boxes to display the dates previously stored in the databse
			var html = '';
			html += '<select id=\'trDates\' class=\'trDrop\'>';
			html += '<option selected disabled hidden>Previously Stored Top Tracks</option>';

			var arr = [];
			
			for(var i = 0; i < rows.length; i++){
				//console.log("HERE" + rows[i].date_received);
				var year = rows[i].date_received.getFullYear();
				var month = rows[i].date_received.getMonth() + 1;
				var day = rows[i].date_received.getDate();
				if(day < 10) {
					day = '0' + day;
				} 
				if(month < 10) {
					month = '0' + month;
				} 
				var date = year + "-" + month + "-" + day;
				
				arr.push(date);
				arr = arr.filter(function (item, index, inputArray){ // Checking for any duplicate dates
					return inputArray.indexOf(item) == index;
				});
				
				if(arr[i] != null){ // Add to drop-down box if date is valid
					html += "$('.trDrop').append('<option>'" + arr[i]  + "'</option>')";
				}
					
			}
			
			html += '</select>';
			html += '<a class="btn btn-primary btn-success" onclick="getDateTracks()"><span class="glyphicon glyphicon-saved"></span> Get Top Tracks on That Date </a>'; // Add a button that allows them to get the selected info
			
			res.send(html);
		}
	});

});

// Function that gets the dates stored in the artists table from the database
app.get('/dbDatesAr', function(req, res) {
	con.query('SELECT * FROM artists WHERE userid = \'' + req.query.userid + '\'',
	function(err,rows,fields) {
		//console.log("HEREEEEE: " + req.query.userid );
		if (err)
			console.log('Error get artist database dates');
		else
		{
			//Update the select boxes to display the dates previously stored in the databse
			var html1 = '';
			html1 += '<select id="arDates" class=\"arDrop\">';
			html1 += '<option selected disabled hidden>Previously Stored Top Artists</option>';
			
			var arr = [];
			
			for(var i = 0; i < rows.length; i++){
				var year = rows[i].date_received.getFullYear();
				var month = rows[i].date_received.getMonth() + 1;
				var day = rows[i].date_received.getDate();
				if(day < 10) {
					day = '0' + day;
				} 
				if(month < 10) {
					month = '0' + month;
				} 
				var date = year + "-" + month + "-" + day;	
				
				arr.push(date); 
				arr = arr.filter(function (item, index, inputArray){ // Checking for any duplicate dates
					return inputArray.indexOf(item) == index;
				});
				
				if(arr[i] != null){ // Add to drop-down box if date is valid
					html1 += "$('.arDrop').append('<option>'" + arr[i]  + "'</option>')"; 
				}
			}
		
			html1 += '</select>';
			html1 += '<a class="btn btn-primary btn-success" onclick="getDateArtists()"><span class="glyphicon glyphicon-saved"></span> Get Top Artists on That Date </a>'; // Add a button that allows them to get the selected info
			
			res.send(html1);
		}
	});
});	

// Function that gets the user's top tracks on selected date
app.get('/getDateTracks', function(req, res) {
	var chosenDate = req.query.dateChoice;
	
	// Error handling for when user doesn't choose a valid date
	if(chosenDate == 'Previously Stored Top Tracks'){
		return;
	}
	
	//console.log("CHOSEN DATE");
	//console.log(chosenDate);
	con.query("SELECT * FROM tracks WHERE userid = '" + req.query.userid + "' AND " + "date_received LIKE ("+chosenDate+")",
	function(err,rows,fields) {
		//console.log("POP " + req.query.userid);
		var out = '<h3>Your Previously Stored Top Tracks</h3><table><th>Rank</th><th>Track Name</th><th>Album Name</th><th>Artist\'s Name</th><th>Popularity</th><th>Artist Cover</th><th>Date</th></tr>';

		for (var i = 0; i < rows.length; i++) {
			
			var rank = rows[i].rank;
			var tName = rows[i].track_name;
			var alName = rows[i].album_name;
			var arName = rows[i].artist_name;
			var pop = rows[i].popularity;
			var url = rows[i].album_image_url;
			var date = rows[i].date_received;
			
			out += '<tr><td>' + rank + '</td><td>' + tName + '</td>';
			out += '<td>' + alName + '</td>';
			out += '<td>' + arName + '</td>';
			out += '<td>' + pop + '</td>';
			out += '<td><img src=' + url + ' alt=\'Album Cover\' height=\'75\' width=\'75\'></td>';
			out += '<td>' + date + '</td>';
			out += '</tr>';
			
		}
		
	out += '</table>';
	
	res.send(out); // Send back the table to the client
	
	});
});

// Function that gets the user's top artists on selected date
app.get('/getDateArtists', function(req, res) {
	var chosenDate = req.query.dateChoice;
	
	// Error handling for when user doesn't choose a valid date
	if(chosenDate == 'Previously Stored Top Artists'){
		return;
	}
	
	con.query("SELECT * FROM artists WHERE userid = '" + req.query.userid + "' AND " + "date_received LIKE ("+chosenDate+")",
	function(err,rows,fields) {
		var out = '<h3>Your Previously Stored Top Artists</h3><table><th>Rank</th><th>Artist Name</th><th>Popularity</th><th>Artist Image</th><th>Date</th></tr>';

		for (var i = 0; i < rows.length; i++) {
			
			var rank = rows[i].rank;
			var arName = rows[i].artist_name;
			var pop = rows[i].popularity;
			var url = rows[i].artist_image_url;
			var date = rows[i].date_received;
			
			out += '<tr><td>' + rank + '</td><td>' + arName + '</td>';
			out += '<td>' + pop + '</td>';
			out += '<td><img src=' + url + ' alt=\'Artist Image\' height=\'75\' width=\'75\'></td>';
			out += '<td>' + date + '</td>';
			out += '</tr>';
			
		}
		
	out += '</table>';
	
	res.send(out); // Send back the table to the client
	
	});
});

app.listen(PORT , function() {
	console.log('Server running...');
});