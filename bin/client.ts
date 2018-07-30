#!/usr/bin/env npx ts-node
import * as yargs from 'yargs';
import * as path from 'path';
import * as crypto from 'crypto';

import { Client } from '../src/client';
import { getPlayerHash } from '../src/utils';

const argv = yargs
  .option('address', {
    default: 'ws://localhost:8000/v1/standard',
  })
  .option('name', {
    alias: 'n',
  })
  .option('script', {
    alias: 's',
  })
  .demandOption([ 'name', 'script' ])
  .argv;

// Unsafe, but who cares?
const agent = require(path.resolve(argv.script));

console.log('Your hash is "%s"', getPlayerHash(argv.name));

const client = new Client({
  address: argv.address as string,
  name: argv.name as string,
  agent,
});

client.on('game', (id: string, events: any[]) => {
  // Do something useful here
  // console.log(id, events);
});
