var request = require('request');
var express = require('express');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var async = require('async');

var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your client secret
var redirect_uri = 'http:///localhost:8080/callback'; // Your redirect uri

var app = express();
app.use(cors());

console.log(client_id);
console.log(client_secret);

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

function unique (arr) {
    return arr.filter(function (elem, pos) {
       return arr.indexOf(elem) == pos;
    });
};

function getArtistIds(tracks) {
    var ids = [];
    //console.log(ids.length);

    //console.log(tracks);
    //return [];

    for (i in tracks) {
        var artists = tracks[i].track.artists;
        for (j in artists) {
            ids.push(artists[j].id);
        }
    }
    console.log(ids.length);
    ids = unique(ids);
    console.log(ids.length);
    return ids;
};

function getGenres(artistIds, access_token, callback) {

    //artists = artists.slice(0, 50);

    var genres = [];

    //max ID's per request is 50

    var url = 'https://api.spotify.com/v1/artists?ids=';

    var options = {
        //url: url + artists.join(','),
        headers: { 'Authorization': 'Bearer ' + access_token },
        json: true
    };

    function loop (callback) {

        console.log(artistIds.length + ' artistIds remaining');
        options.url = url + artistIds.slice(0, 50).join(',');

        request.get(options, function(error, response, body) {
            if (error) {
                console.error('couldn\'t get artists');
                console.error(error);
                return;
            } else {
                var artists = body.artists;
                for (i in artists) {
                    genres = genres.concat(artists[i].genres);
                }
                console.log(genres.length + ' genres gotten');

                artistIds = artistIds.slice(50);
                if (artistIds.length != 0) loop(callback);
                else callback();

                //callback(genres);
            }
        });
    }

    loop(function () {
        console.log('done getting genres');
        callback(genres);
    });





};

function packageForD3 (genres) {
    var dict = {};
    for (i in genres) {
        if (genres[i] in dict) {
            ++dict[genres[i]];
        } else {
            dict[genres[i]] = 1;
        }
    }

    var children = [];

    for (key in dict) {
        children.push({"name": key, "size": dict[key]});
    }

    var bundle = {"name": "flare", children: children};
    console.log(bundle);
    return bundle;
};

function getTracks(access_token/*, howMany*/, callback) {

    var tracks = [];

    var options = {
        url: 'https://api.spotify.com/v1/me/tracks?limit=50',
        headers: { 'Authorization': 'Bearer ' + access_token },
        json: true
    };


    function loop (loop_callback) {
        request.get(options, function(error, response, body) {
            if (error) {
                console.error('couldn\'t get tracks');
                console.error(error);
                return;
            }
            else {
                tracks = tracks.concat(body.items);
                console.log(tracks.length + ' tracks gotten');
                if (options.url = body.next) loop(loop_callback);
                else loop_callback();
            }
        });
    };


    loop(function() {
        console.log('done getting tracks');
        callback(tracks);
    });

    /*async.doWhilst(
        function (callback) {
            request.get(options, function(error, response, body) {
                if (error) {
                    console.error('couldn\'t get tracks');
                    console.error(error);
                }
                else {
                    tracks.push(body.items);
                    next = body.next;
                    return;
                }
            });
        },
        function () {return next != null},
        function ()
    );*/

};

app.get('/fetch', function (req, res) {

    var access_token = req.query.access_token;

    getTracks(access_token, function (tracks) {
        var artistIds = getArtistIds(tracks);
        //console.log(artists.length);
        getGenres(artistIds, access_token, function (genres) {
            console.log('writing response');
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(packageForD3(genres)));
        });

    });

    /*var options = {
        url: 'https://api.spotify.com/v1/me/tracks?limit=50',
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
            console.log(artists.length);
            getGenres(artists, access_token, function (genres) {
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(packageForD3(genres)));
            });

        }
    });*/

});

var port = process.env.PORT || 8080;
console.log('Listening on port ', port);
app.listen(port);
