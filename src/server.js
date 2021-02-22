/*
*   This app consist of http and websocket servers.
*
*   New user can be registered with route /register (POST)
*   There is a HTML form for register new user on route /register (GET)
*
*   User can login with route /login (POST)
*   There is a HTML form for login on route /login (GET)
*   
*   If login was successful jwt token will be stored on client user agent cookie.
*   To stablish a socket connection this cookies is needed.
*    
*   Once socket connected, User can emit "users.list" to receive the list of online users and 
*   "users.info" to retrieve specific user's info by sending his/her email.
*
*   On new socket connection, first server will push user to redis users key, 
*   then publish the user info on channel to other notify other servers which are subscribed to the channel,
*   Each server will emit this new user to its alive socket connections.
*   This events is shown on route /chat (GET)
*
*/

const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const cookieParser = require("cookie-parser");
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Users = require('./user');
const redis = require("redis");
/* *************************************************************** */
const SERVERID = process.env.SERVERID || 1;
const PORT = process.env.PORT || 8080;
/* *************************************************************** */
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
/* *************************************************************** */
mongoose.connect('mongodb://mongodb:27017/challenge', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("\x1b[42m",`SERVER ${SERVERID} CONNECTED TO DATABASE`,"\x1b[0m"))
    .catch(error => {
        console.log(error);
        console.log(`\nmongodb::error_in_connection`);
        server.close(function () {
            process.exit(1);
        });
    });
/* *************************************************************** */
const subscriber = redis.createClient({ host: 'rds', port: 6379 });
const publisher = redis.createClient({ host: 'rds', port: 6379 });
const store = redis.createClient({ host: 'rds', port: 6379 });
store.flushall();
/* *************************************************************** */
app.set('views', path.resolve(__dirname + '/views/'));
app.set('view engine', 'pug');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());
/* *************************************************************** */
subscriber.on("subscribe", function () {
    console.log("\x1b[44m",`SERVER ${SERVERID} SUBSCRIBED TO REDIS`,"\x1b[0m")
});
subscriber.on("message", function (channel, message) {
    if (channel === "chatroom") {
        var msg = JSON.parse(message);
        if (msg.type === "data") io.emit(msg.data.header, msg.data.body);
    }
});
subscriber.subscribe("chatroom");
/* *************************************************************** */
app.post('/register', async (req, res, next) => {
    try {
        var _user = req.body;
        await Users.addUser(_user);
        res.status(201).render('success');
    } catch (error) {
        next(error);
    }
});
app.post('/login', async (req, res, next) => {
    try {
        var _user = req.body;

        var user = (await Users.getUsers({ email: _user.email }))[0];
        if (!user) throw new Error('login:email_or_password_is_wrong');
        var isMatch = await user.comparePassword(_user.password);
        if (!isMatch) throw new Error("login:email_or_password_is_wrong");

        jwt.sign({
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
        }, "sampleKey", function (error, token) {
            if (error) return next(error);
            res.set("Set-Cookie", `token=${token}; HttpOnly`);
            res.redirect('/chat');
        });
    } catch (error) {
        next(error);
    }
});

app.get('/register', (req, res, next) => {
    res.render('register');
});
app.get('/login', (req, res, next) => {
    res.render('login');
});
app.get('/logout', (req, res, next) => {
    res.clearCookie('token');
    res.redirect('/')
});
app.get('/chat', (req, res, next) => {
    jwt.verify(req.cookies?.token, "sampleKey", function (error, decoded) {
        var route = "chat";
        if (error) route = "401";
        res.render(route);
    });
});
app.get('/', (req, res, next) => {
    jwt.verify(req.cookies?.token, "sampleKey", function (error, decoded) {
        var route = "/chat";
        if (error) route = "/login";

        res.redirect(route);
    });
});
app.get('*', (req, res, next) => {
    res.redirect("/");
});

// In register and login processes, those error that thrown based on user's wrong input values is catched in this error handler.
// The relevant message to the error will place in HTML file and send back to client.
app.use(function (error, req, res, next) {
    if (error && error.message === "login:email_or_password_is_wrong") {
        res.status(400).render('login', { message: "Email or password is wrong!" })
    }
    else if (error && error.message === "register:required_field_missing") {
        res.status(400).render('register', { message: "Required field missing!" })
    }
    else if (error && error.message === "register:email_failed_pattern_test") {
        res.status(400).render('register', { message: "Email is not valid!" })
    }
    else if (error && error.message === "register:password_failed_pattern_test") {
        res.status(400).render('register', { message: "Password should be 8 characters at least!" })
    }
    else if (error && error.message === "register:password_repeat_does_not_match") {
        res.status(400).render('register', { message: "Password repeat does not match!" })
    }
});
/* *************************************************************** */
io.use((socket, next) => {
    const token = socket.handshake.headers.cookie?.split('=')?.pop();
    jwt.verify(token, "sampleKey", function (error, decoded) {
        if (error) next(new Error("io:not_authenticated"));
        else {
            socket.user = decoded;
            next();
        }
    });
});
io.on('connection', (socket) => {
    console.log("\x1b[45m", `SOCKET CONNECTION ON SERVER ${SERVERID}`, "\x1b[0m")
    store.rpush('users', JSON.stringify(socket.user), (err) => {
        if (err) console.log(err);
        else publisher.publish("chatroom", JSON.stringify(
            {
                type: "data",
                data: {
                    header: "users.connection",
                    body: socket.user
                }
            }
        ));
    });

    socket.on('disconnect', () => {
        console.log("\x1b[43m", `SOCKET DISCONNECTION ON SERVER ${SERVERID}`, "\x1b[0m")
        store.lrem('users', 0, JSON.stringify(socket.user), (err) => {
            if (err) console.log(err);
            else publisher.publish("chatroom", JSON.stringify(
                {
                    type: "data",
                    data: {
                        header: "users.disconnection",
                        body: socket.user
                    }
                }
            ));
        })
    });

    socket.on("users.list", () => {
        store.lrange('users', 0, -1, (err, users) => {
            if (err) console.log(err);
            else socket.emit("users.list", users.map(usr => (JSON.parse(usr))));
        });
    });

    socket.on("users.info", async (msg) => {
        var user = (await Users.getUsers({ email: msg }))[0];
        socket.emit('users.info', user);
    });

});
/* *************************************************************** */
server.listen(PORT, () => console.log("\x1b[41m", `-->SERVER ${SERVERID} IS RUNNING ON PORT ${PORT}<--`, "\x1b[0m"));
module.exports = server;