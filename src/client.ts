import * as ws from 'ws';
import * as debugAPI from 'debug';
import { Solver } from 'proof-of-work';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

import { IOpponentResult } from './game';

const debug = debugAPI('alt-haggle:client');

export interface IClientOptions {
  readonly address?: string;
  readonly name: string;
  readonly agent: IAgentConstructor;
}

interface IDefiniteClientOptions {
  readonly address: string;
  readonly name: string;
  readonly agent: IAgentConstructor;
}

interface IRequest {
  readonly seq: number;
}

export interface IAgentConstructor {
  new(me: number, counts: ReadonlyArray<number>,
      values: ReadonlyArray<number>, maxRounds: number,
      log: (...args: any[]) => void): IAgent;
}

export interface IAgent {
  offer(o: ReadonlyArray<number> | undefined)
    : ReadonlyArray<number> | undefined;
}

export class Client extends EventEmitter {
  private readonly options: IDefiniteClientOptions;
  private readonly ws: ws;
  private readonly pow: Solver = new Solver();
  private readonly agents: Map<string, IAgent> = new Map();
  private readonly gameLog: Map<string, any[]> = new Map();

  constructor(options: IClientOptions) {
    super();

    this.options = Object.assign({
      address: 'ws://localhost:8000/',
    }, options);

    this.ws = new ws(this.options.address);

    this.ws.on('message', (data) => this.onMessage(data));
  }

  private onMessage(data: ws.Data) {
    debug('received message', data);

    const msg = JSON.parse(data.toString());
    if (msg.error) {
      console.error(msg.error);
      return;
    }

    const payload = msg.payload!;
    const kind = payload.kind!;

    if (kind === 'init') {
      const prefix = Buffer.from(payload.prefix!, 'hex');
      const challenge = this.pow.solve(payload.complexity!, prefix);

      this.reply(msg!, {
        kind: 'init',
        name: this.options.name,
        challenge: challenge.toString('hex'),
      });
      return;
    }

    let log = this.gameLog.get(payload.game!)!;

    if (kind === 'start') {
      this.reply(msg!, { kind: 'start' });

      const config = payload.config!;

      const agent = new this.options.agent(config.isFirst ? 0 : 1,
          config.counts!, config.values!, config.maxRounds!,
          () => {});
      this.agents.set(payload.game!, agent);

      log = [];
      this.gameLog.set(payload.game!, log);
      log.push(payload);
    } else if (kind === 'end') {
      this.reply(msg!, { kind: 'end' });

      log.push(payload);
      this.gameLog.delete(payload.game!);
      this.agents.delete(payload.game!);

      this.emit('game', payload.game!, log);
    } else if (kind === 'step') {
      const agent = this.agents.get(payload.game!)!;

      log.push(payload);
      const offer = agent.offer(payload.offer!);
      log.push({ kind: 'counter-step', offer });

      this.reply(msg!, { kind: 'step', offer });
    } else {
      debug('unknown message kind %j', kind);
    }
  }

  private reply(req: IRequest, response: any): void {
    debug('replying with %j', response);
    this.ws.send(JSON.stringify({
      seq: req.seq,
      payload: response
    }));
  }
}
