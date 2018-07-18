import * as debugAPI from 'debug';
import { EventEmitter } from 'events';
import * as ws from 'ws';
import * as Joi from 'joi';

import { Offer, IConfig } from './game';
import * as schema from './schema';

const debug = debugAPI('alt-haggle:player');

type Request = { kind: 'init' } |
    { kind: 'start', game: string, config: IConfig } |
    { kind: 'step', game: string, offer: Offer | undefined };

type RequestCallback = (err: Error | undefined, res?: Response) => void;
type RequestMap = Map<number, RequestCallback>;

export interface IPlayerOptions {
  readonly timeout: number;
}

export class Player extends EventEmitter {
  private lastSeq: number = 0;
  private readonly requests: RequestMap = new Map();

  constructor(private readonly ws: ws,
              private readonly options: IPlayerOptions) {
    super();

    this.ws.on('message', (data) => this.onMessage(data));

    this.ws.on('error', (err) => {
      debug('Socket error', err);
      this.ws.terminate();
      this.close();
    });

    this.ws.once('close', () => {
      this.close();
    });
  }

  public async init() {
    await this.send({ kind: 'init' });
  }

  public close() {
    debug('Closing client');
    for (const callback of this.requests.values()) {
      callback(new Error('Socket closed'));
    }
  }

  public async start(game: string, config: IConfig) {
    await this.send({ kind: 'start', game, config });
  }

  public async step(game: string, offer?: Offer): Promise<Offer | undefined> {
    return undefined;
  }

  private onMessage(data: ws.Data) {
    if (typeof data !== 'string') {
      return this.ws.emit('error', new Error('Invalid data'));
    }

    let json: any;
    try {
      json = JSON.parse(data);
    } catch (e) {
      return this.ws.emit('error', new Error('Invalid JSON'));
    }

    const { error, value: packet } = Joi.validate(json, schema.Packet);

    if (error) {
      return this.ws.emit('error', error);
    }

    if (this.requests.has(packet.seq!)) {
      // Execute callback
      this.requests.get(packet.seq!)!(packet.payload!);
    } else {
      return this.ws.emit('error', new Error('Unexpected seq: ' + packet.seq));
    }
  }

  private async send(req: Request): Promise<Response> {
    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(req), (err?: Error) => {
        if (!err) {
          return resolve();
        }
        return reject(err);
      });
    });

    return new Promise<Response>((resolve, reject) => {
      let seq = this.lastSeq++;

      const callback: RequestCallback = (err, response) => {
        clearTimeout(timeout);
        this.requests.delete(seq);
        if (err) {
          reject(err);
        } else {
          resolve(response!);
        }
      };

      const timeout = setTimeout(() => {
        callback(new Error('Timed out'));
      }, this.options.timeout);

      this.requests.set(seq, callback);
    });
  }
}
