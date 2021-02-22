# node.js challenge


1) run command `docker build -t chatapp .`
2) run command `mkdir mongodb`
3) run command `docker-compose up`
4) visit 127.0.0.1:8080 on browser


In this project
* mongoDB is used to store registred users data,
* Redis is used to store online users list and emit "new connection" as well as "disconnection" events to propagste dat athrogh all servers.
* Apache server is used for cookie-based load-balancing.
* Express.js is used to handle http routes.
* Pug is used as template engine to render simple UI to HTML.


By running `docker-compose up`, four instances of this app will run in separate containers.