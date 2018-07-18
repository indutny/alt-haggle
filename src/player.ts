import * as debug from 'debug';
import { EventEmitter } from 'events';
import * as ws from 'ws';

import { Offer, IConfig } from './game';

type Message = { kind: 'init' } |
    { kind: 'start', game: string, config: IConfig };

type Response = { kind: 'init' } |
    { kind: 'step', game: string, offer: Offer };

export interface IPlayerOptions {
  readonly timeout: number;
}

export class Player extends EventEmitter {
  constructor(private readonly ws: ws,
              private readonly options: IPlayerOptions) {
    super();

    this.ws.on('error', (err) => {
      this.ws.terminate();
      this.emit('close', err);
    });

    this.init();
  }

  private onMessage(data: ws.Data) {
  }

  private async send(msg: Message) {
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(msg), (err?: Error) => {
        if (!err) {
          return resolve();
        }
        return reject(err);
      });
    });
  }

  private async init() {
    this.send({ kind: 'init' });
  }

  public async start(game: string, config: IConfig) {
    this.send({ kind: 'start', game, config });
  }

  public async step(game: string, offer?: Offer): Promise<Offer | undefined> {
    return undefined;
  }
}
