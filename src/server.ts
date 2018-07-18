import * as ws from 'ws';
import * as debugAPI from 'debug';
import * as http from 'http';

import { Generator } from './generator';
import { Player } from './player';
import { Game, IGameResult } from './game';

const debug = debugAPI('alt-haggle:server');

export interface IServerOptions {
  readonly timeout?: number;
  readonly parallelGames?: number;

  readonly types?: number;
  readonly minObj?: number;
  readonly maxObj?: number;
  readonly total?: number;
  readonly maxRounds?: number;
}

interface IDefiniteServerOptions {
  readonly timeout: number;
  readonly parallelGames: number;

  readonly types: number;
  readonly minObj: number;
  readonly maxObj: number;
  readonly total: number;
  readonly maxRounds: number;
}

export class Server extends http.Server {
  private readonly generator: Generator;
  private readonly ws: ws.Server = new ws.Server({ server: this });
  private readonly pool: Set<Player> = new Set();
  private readonly options: IDefiniteServerOptions;
  private activeGames: number = 0;

  constructor(options: IServerOptions = {}) {
    super();

    this.options = Object.assign({
      timeout: 2000,
      parallelGames: 1000,

      types: 3,
      minObj: 1,
      maxObj: 6,
      total: 10,
      maxRounds: 5,
    }, options);

    // TODO(indutny): just pass the object
    this.generator = new Generator(this.options.types, this.options.minObj,
      this.options.maxObj, this.options.total, this.options.maxRounds);

    this.ws.on('connection', (socket) => this.onConnection(socket));

    this.on('request', (req, res) => this.onRequest(req, res));
  }

  private async onConnection(socket: ws) {
    const p = new Player(socket, { timeout: this.options.timeout });

    try {
      await p.init();
    } catch (e) {
      debug('Failed to init player due to error', e);
    }

    this.pool.add(p);
    p.once('close', () => {
      this.pool.delete(p);
    });

    this.maybePlay();
  }

  private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // TODO(indutny): leaderboard!
    res.writeHead(404);
    res.end('Not found');
  }

  private maybePlay() {
    // Not enough players yet
    if (this.pool.size < 2) {
      return;
    }

    // Enough games, though!
    while (this.activeGames <= this.options.parallelGames) {
      this.activeGames++;

      this.playGame().then((result: IGameResult) => {
        this.activeGames--;
        console.log(result);

        this.maybePlay();
      }).catch((e) => {
        this.activeGames--;
        debug('Game error', e);

        this.maybePlay();
      });
    }
  }

  private async playGame(): Promise<IGameResult> {
    // Pick two players
    // TODO(indutny): take in account number of games played?
    const players = Array.from(this.pool);
    const first = (Math.random() * players.length) | 0;

    let second: number;
    do {
      second = (Math.random() * players.length) | 0;
    } while (first === second);

    const seed = (Math.random() * this.generator.maxSeed) | 0;
    const config = this.generator.get(seed);

    const firstPlayer = players[first];
    const secondPlayer = players[second];

    const game = new Game(config, firstPlayer, secondPlayer);

    return await game.run();
  }
}
