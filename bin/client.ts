#!/usr/bin/env npx ts-node
import * as yargs from 'yargs';
import * as path from 'path';

import { Client } from '../src/client';

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

const client = new Client({
  address: argv.address as string,
  name: argv.name as string,
  agent,
});
