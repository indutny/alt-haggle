import { EventEmitter } from 'events';
import * as ws from 'ws';

export class Connection extends EventEmitter {
  constructor(private readonly socket: ws) {
    super();
  }
}
