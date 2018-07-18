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

type RequestCallback = (err: Error | undefined, res?: any) => void;
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
    const raw = await this.send({ kind: 'init' });
    const { error, value } = Joi.validate(raw, schema.InitResponse);
    if (error) {
      this.error(error);
      throw error;
    }

    // TODO(indutny): check proof-of-work
  }

  public close() {
    debug('Closing client');
    for (const callback of this.requests.values()) {
      callback(new Error('Socket closed'));
    }
  }

  public async start(game: string, config: IConfig) {
    const raw = await this.send({ kind: 'start', game, config });
    const { error, value } = Joi.validate(raw, schema.StartResponse);
    if (error) {
      this.error(error);
      throw error;
    }
  }

  public async step(game: string, offer?: Offer): Promise<Offer | undefined> {
    const raw = await this.send({ kind: 'step', game, offer });

    const { error, value } = Joi.validate(raw, schema.StepResponse);
    if (error) {
      this.error(error);
      throw error;
    }

    return value.offer;
  }

  private onMessage(data: ws.Data) {
    if (typeof data !== 'string') {
      return this.error(new Error('Invalid data'));
    }

    let json: any;
    try {
      json = JSON.parse(data);
    } catch (e) {
      return this.error(new Error('Invalid JSON'));
    }

    const { error, value: packet } = Joi.validate(json, schema.Packet);

    if (error) {
      return this.error(error);
    }

    if (this.requests.has(packet.seq!)) {
      // Execute callback
      this.requests.get(packet.seq!)!(undefined, packet.payload!);
    } else {
      return this.error(new Error('Unexpected seq: ' + packet.seq));
    }
  }

  private async send(req: Request, timeout: number = this.options.timeout)
    : Promise<any> {
    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(req), (err?: Error) => {
        if (!err) {
          return resolve();
        }
        return reject(err);
      });
    });

    return new Promise((resolve, reject) => {
      let seq = this.lastSeq++;

      const callback: RequestCallback = (err, response) => {
        clearTimeout(timer);
        this.requests.delete(seq);
        if (err) {
          reject(err);
        } else {
          resolve(response!);
        }
      };

      const timer = setTimeout(() => {
        callback(new Error('Timed out'));
      }, timeout);

      this.requests.set(seq, callback);
    });
  }

  private error(err: Error): void {
    this.ws.emit('error', err);
  }
}
