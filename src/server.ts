import * as ws from 'ws';
import * as debugAPI from 'debug';
import * as http from 'http';
import { Verifier } from 'proof-of-work';
import { Buffer } from 'buffer';

import { Generator } from './generator';
import { Player } from './player';
import { Game, IGameResult } from './game';
import { Leaderboard, ILeaderboardOptions } from './leaderboard';

const debug = debugAPI('alt-haggle:server');

const POW_PREFIX = Buffer.from('alt-haggle');

export interface IServerOptions {
  readonly complexity?: number;
  readonly initTimeout?: number;
  readonly timeout?: number;
  readonly parallelGames?: number;

  readonly leaderboard?: ILeaderboardOptions;

  readonly types?: number;
  readonly minObj?: number;
  readonly maxObj?: number;
  readonly total?: number;
  readonly maxRounds?: number;
}

interface IDefiniteServerOptions {
  readonly complexity: number;
  readonly initTimeout: number;
  readonly timeout: number;
  readonly parallelGames: number;

  readonly leaderboard?: ILeaderboardOptions;

  readonly types: number;
  readonly minObj: number;
  readonly maxObj: number;
  readonly total: number;
  readonly maxRounds: number;
}

export class Server extends http.Server {
  private readonly generator: Generator;
  private readonly ws: ws.Server = new ws.Server({
    perMessageDeflate: true,
    noServer: true,

    // This is already too much
    maxPayload: 16 * 1024,
  });
  private readonly leaderboard: Leaderboard;
  private readonly pow: Verifier;
  private readonly pool: Map<string, Player> = new Map();
  private readonly options: IDefiniteServerOptions;
  private activeGames: number = 0;

  constructor(options: IServerOptions = {}) {
    super();

    this.options = Object.assign({
      complexity: 19, // proof-of-work

      initTimeout: 120000, // 2 min
      timeout: 30000, // 30 seconds
      parallelGames: 1000,

      types: 3,
      minObj: 1,
      maxObj: 6,
      total: 10,
      maxRounds: 5,
    }, options);

    this.leaderboard = new Leaderboard(this.options.leaderboard);

    this.pow = new Verifier({
      size: 1024,
      n: 16,
      complexity: this.options.complexity,
      prefix: POW_PREFIX,
    });

    // TODO(indutny): just pass the object
    this.generator = new Generator(this.options.types, this.options.minObj,
      this.options.maxObj, this.options.total, this.options.maxRounds);

    this.on('request', (req, res) => {
      this.onRequest(req, res).catch((error) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error }));
      });
    });

    this.on('upgrade', (req, socket, head) => {
      if (req.url === '/v1/standard') {
        this.ws.handleUpgrade(req, socket, head, (ws) => {
          this.onConnection(ws);
        });
      } else {
        socket.end();
      }
    });
  }

  private async onConnection(socket: ws) {
    const p = new Player(socket, {
      complexity: this.options.complexity,
      prefix: POW_PREFIX,

      initTimeout: this.options.initTimeout,
      timeout: this.options.timeout,
    });

    let challenge: Buffer;
    try {
      challenge = await p.init();
    } catch (e) {
      debug('Failed to init player due to error', e);
      return;
    }

    if (!this.pow.check(challenge)) {
      p.close(new Error('Invalid proof of work'));
      return;
    }

    if (this.pool.has(p.hash)) {
      p.close(new Error('duplicate hash'));
      return;
    }

    debug('Challenge passed!');
    this.pool.set(p.hash, p);
    p.once('close', () => {
      this.pool.delete(p.hash);
    });

    this.maybePlay();
  }

  private async onRequest(req: http.IncomingMessage,
                          res: http.ServerResponse) {
    // TODO(indutny): reduce amount copy-paste
    if (req.method === 'GET' && req.url === '/v1/standard') {
      const results = await this.leaderboard.getResults();
      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(results, null, 2));
      return;
    } else if (req.method === 'GET' && req.url === '/v1/daily') {
      const results = await this.leaderboard.getDailyTable();
      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(results, null, 2));
      return;
    }

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
    while (this.activeGames < this.options.parallelGames) {
      this.activeGames++;

      this.playGame().then((result: IGameResult) => {
        this.activeGames--;
        this.leaderboard.add(result);

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
    const players = Array.from(this.pool.values());
    const first = (Math.random() * players.length) | 0;

    let second: number;
    do {
      second = (Math.random() * players.length) | 0;
    } while (first === second);

    const config = this.generator.get();

    const firstPlayer = players[first];
    const secondPlayer = players[second];

    const game = new Game(config, firstPlayer, secondPlayer);

    return await game.run();
  }
}
