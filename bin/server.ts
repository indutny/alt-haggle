#!/usr/bin/env npx ts-node

import { Server } from '../src/server';

const server = new Server();

server.listen(process.env.PORT || 8000, () => {
  console.log('Listening on %j', server.address());
});
