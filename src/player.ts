import * as debugAPI from 'debug';
import { EventEmitter } from 'events';
import * as ws from 'ws';
import * as Joi from 'joi';
import { Buffer } from 'buffer';
import { Verifier } from 'proof-of-work';

import { Offer, IConfig, IOpponentResult } from './game';
import * as schema from './schema';
import { getPlayerHash } from './utils';

const debug = debugAPI('alt-haggle:player');

const VERSION = 1;

type Request =
    { kind: 'init', version: number, complexity: number, prefix: string } |
    { kind: 'start', game: string, config: IConfig } |
    { kind: 'end', game: string, result: IOpponentResult } |
    { kind: 'step', game: string, offer: Offer | undefined };

type RequestCallback = (err: Error | undefined, res?: any) => void;
type RequestMap = Map<number, RequestCallback>;

export interface IPlayerOptions {
  readonly complexity: number;
  readonly prefix: Buffer;
  readonly timeout: number;
  readonly initTimeout: number;
}

export class Player extends EventEmitter {
  private lastSeq: number = 0;
  private readonly requests: RequestMap = new Map();
  private privName: string | undefined;
  private privHash: string | undefined;

  constructor(private readonly ws: ws,
              private readonly options: IPlayerOptions) {
    super();

    this.ws.on('message', (data) => this.onMessage(data));

    this.ws.on('error', (err) => {
      debug('Socket error', err);
      this.close();
    });

    this.ws.once('close', () => {
      this.close();
    });
  }

  public get name(): string {
    if (this.privName === undefined) {
      throw new Error('Name hasn\'t been sent yet');
    }
    return this.privName;
  }

  public get hash(): string {
    if (this.privHash !== undefined) {
      return this.privHash;
    }

    this.privHash = getPlayerHash(this.name);
    return this.privHash;
  }

  public async init(pow: Verifier) {
    const raw = await this.send({
      kind: 'init',
      version: VERSION,
      complexity: this.options.complexity,
      prefix: this.options.prefix.toString('hex'),
    }, this.options.initTimeout);

    const { error, value } = Joi.validate(raw, schema.InitResponse);
    if (error) {
      this.error(error);
      throw error;
    }

    this.privName = value.name!;

    const challenge = Buffer.from(value.challenge!, 'hex');

    if (!pow.check(challenge)) {
      const error = new Error('Invalid proof of work');
      this.error(error);
      throw error;
    }
  }

  public close(err?: Error) {
    if (err) {
      return this.error(err);
    }

    debug('Closing client');
    this.ws.terminate();
    this.emit('close');

    for (const callback of this.requests.values()) {
      callback(new Error('Socket closed'));
    }
  }

  public async start(game: string, config: IConfig) {
    debug('starting game %s', game);
    const raw = await this.send({ kind: 'start', game, config });
    const { error, value } = Joi.validate(raw, schema.StartResponse);
    if (error) {
      this.error(error);
      throw error;
    }

    debug('started game %s', game);
  }

  public async end(game: string, result: IOpponentResult) {
    debug('ending game %s', game);
    const raw = await this.send({ kind: 'end', game, result });
    const { error, value } = Joi.validate(raw, schema.EndResponse);
    if (error) {
      this.error(error);
      throw error;
    }

    debug('ended game %s', game);
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
    let seq = this.lastSeq++;

    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify({ seq, payload: req }), (err?: Error) => {
        if (!err) {
          return resolve();
        }
        this.error(err);
        return reject(err);
      });
    });

    return new Promise((resolve, reject) => {
      const callback: RequestCallback = (err, response) => {
        clearTimeout(timer);
        this.requests.delete(seq);
        if (err) {
          this.error(err);
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
    try {
      this.ws.send(JSON.stringify({ error: err.message }));
    } catch (e) {
    }

    this.ws.emit('error', err);
  }
}
