var request = require('request');
var express = require('express');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var cors = require('cors');

var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your client secret
var redirect_uri = 'http:///localhost:8080/callback'; // Your redirect uri

var app = express();
app.use(cors());

console.log(client_id);
console.log(client_secret);

function getTracks() {
    var url = 'https://api.spotify.com/v1/me/tracks';
    request(url, function (error, response, body) {
       if (!error && response.statusCode == 200) {
           console.log(body);
       } else {
           console.error('error!');
           console.error(response.statusCode);
           console.error(error);
       }
    });
};

var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

app.use(express.static(__dirname + '/public'))
    .use(cookieParser());

app.get('/login', function(req, res) {
    console.log('at /login');

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-library-read';
    var url = 'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        });
    console.log('redirect_uri: ' + url);
    res.redirect(url);
});

app.get('/callback', function(req, res) {
    console.log('at /callback');

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
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
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    console.log(body);
                });

                res.redirect('http://localhost:5000/#' +
                 querystring.stringify({
                 access_token: access_token,
                 //refresh_token: refresh_token
                 }));
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});


app.get('/', function (req, res) {
    res.send('welcome to the backend');
});

function getArtistIds(tracks) {

    var ids = [];

    for (i in tracks) {
        var artists = tracks[i].track.artists;
        for (j in artists) {
            ids.push(artists[j].id);
        }
    }
    return ids;
};

function getGenres(artists, access_token) {

    var genres = [];

    //max ID's per request is 50

    var options = {
        url: 'https://api.spotify.com/v1/artists?ids=' + artists.join(','),
        headers: { 'Authorization': 'Bearer ' + access_token },
        json: true
    };

    request.get(options, function(error, response, body) {
        if (error) {
            console.error('couldn\'t get artists');
            console.error(error);
        } else {
            console.log('here are the artists');
            console.log(body);
            var artists = body.artists;
            for (i in artists) {
                genres = genres.concat(artists[i].genres);
            }
            console.log(genres);
        }
    });

};

app.get('/fetch', function (req, res) {

    var access_token = req.query.access_token;

    var options = {
        url: 'https://api.spotify.com/v1/me/tracks',
        headers: { 'Authorization': 'Bearer ' + access_token },
        json: true
    };

    request.get(options, function(error, response, body) {
        if (error) {
            console.error('couldn\'t get tracks');
            console.error(error);
        }
        else {
            var artists = getArtistIds(body.items);
            console.log(artists);
            var genres = getGenres(artists, access_token);
        }
    });

    res.send('token: ' + access_token);
});

//getTracks();

var port = process.env.PORT || 8080;
console.log('Listening on port ', port);
app.listen(port);