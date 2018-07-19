#!/usr/bin/env node

const Server = require('../lib/server').Server;

const server = new Server();

server.listen(process.env.PORT || 8000, () => {
  console.log('Listening on %j', server.address());
});
