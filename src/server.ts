import * as ws from 'ws';
import * as debugAPI from 'debug';
import * as http from 'http';
import { parse as parseURL } from 'url';

import { Verifier } from 'proof-of-work';
import { Buffer } from 'buffer';

import { Generator } from './generator';
import { Player } from './player';
import { Game, IGameResult } from './game';
import { Leaderboard, ILeaderboardOptions } from './leaderboard';
import { CachedStat } from './cached-stat';

const debug = debugAPI('alt-haggle:server');

const POW_PREFIX = Buffer.from('alt-haggle');

export interface IServerOptions {
  readonly complexity?: number;
  readonly powInterval?: number;

  readonly initTimeout?: number;
  readonly timeout?: number;
  readonly parallelGames?: number;
  readonly rehashEvery?: number;

  readonly leaderboard?: ILeaderboardOptions;
  readonly cacheTimeout?: number;

  readonly types?: number;
  readonly minObj?: number;
  readonly maxObj?: number;
  readonly total?: number;
  readonly maxRounds?: number;
}

interface IDefiniteServerOptions {
  readonly complexity: number;
  readonly powInterval: number;

  readonly initTimeout: number;
  readonly timeout: number;
  readonly parallelGames: number;
  readonly rehashEvery: number;

  readonly leaderboard?: ILeaderboardOptions;
  readonly cacheTimeout: number;

  readonly types: number;
  readonly minObj: number;
  readonly maxObj: number;
  readonly total: number;
  readonly maxRounds: number;
}

interface IPlayerWrap {
  readonly player: Player;
  rehashIn: number;
  activeGames: number;
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
  private readonly pool: Map<string, IPlayerWrap> = new Map();
  private readonly options: IDefiniteServerOptions;
  private activeGames: number = 0;
  private resultCache: Map<string, Promise<CachedStat> | CachedStat> =
      new Map();

  constructor(options: IServerOptions = {}) {
    super();

    this.options = Object.assign({
      complexity: 19, // proof-of-work
      powInterval: 300000,

      initTimeout: 120000, // 2 min
      timeout: 30000, // 30 seconds
      parallelGames: 1000,
      rehashEvery: 10000, // get new proof-of-work every 1000 games

      cacheTimeout: 1000, // 1 second

      types: 3,
      minObj: 1,
      maxObj: 6,
      total: 10,
      maxRounds: 5,
    }, options);

    this.leaderboard = new Leaderboard(this.options.leaderboard);

    this.pow = new Verifier({
      size: 4 * 1024 * 1024,
      n: 23,
      complexity: this.options.complexity,
      prefix: POW_PREFIX,
    });

    setInterval(() => {
      this.pow.reset();
    }, this.options.powInterval);

    // TODO(indutny): just pass the object
    this.generator = new Generator(this.options.types, this.options.minObj,
      this.options.maxObj, this.options.total, this.options.maxRounds);

    this.on('request', (req, res) => {
      this.onRequest(req, res).catch((error) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.stack }));
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

  private onConnection(socket: ws) {
    const p = new Player(socket, {
      complexity: this.options.complexity,
      prefix: POW_PREFIX,

      initTimeout: this.options.initTimeout,
      timeout: this.options.timeout,
    });

    this.rehashPlayer(p).then(() => {
      p.once('close', () => {
        this.pool.delete(p.hash);
      });
    }).catch((e) => {
      debug('Unexpected error', e);
    });
  }

  private async rehashPlayer(p: Player) {
    try {
      await p.init(this.pow);
    } catch (e) {
      debug('Failed to init player due to error', e);
      return;
    }

    if (this.pool.has(p.hash)) {
      p.close(new Error('duplicate hash'));
      return;
    }

    debug('Challenge passed!');
    this.pool.set(p.hash, {
      player: p,
      rehashIn: this.options.rehashEvery,
      activeGames: 0,
    });

    this.maybePlay();
  }

  private async maybeRehash(w: IPlayerWrap) {
    debug('player %j has %d games before rehash, %d active',
      w.player.hash, w.rehashIn, w.activeGames);

    w.rehashIn = Math.max(0, w.rehashIn - 1);
    if (w.rehashIn !== 0) {
      return;
    }

    // Remove player from pool to prevent new games
    this.pool.delete(w.player.hash);

    // Wait for current games to complete
    if (w.activeGames !== 0) {
      return;
    }

    // Rehash
    debug('player %j rehash', w.player.hash);
    await this.rehashPlayer(w.player);
  }

  private async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method === 'GET') {
      await this.handleGET(req, res);
      return;
    }

    res.writeHead(400);
    res.end('Invalid method');
  }

  private async handleGET(req: http.IncomingMessage, res: http.ServerResponse) {
    let key: string;
    let fetch: () => Promise<any> | any;
    const { pathname, query } = parseURL(req.url!, true);
    if (pathname === '/v1/standard') {
      key = 'raw';
      fetch = () => this.leaderboard.getRaw();
    } else if (pathname === '/v1/daily' || pathname === '/v1/6h' ||
               pathname === '/v1/hourly' || pathname === '/v1/15m') {
      let timeSpan: number;
      if (pathname === '/v1/daily') {
        timeSpan = 24 * 3600 * 1000;
      } else if (pathname === '/v1/6h') {
        timeSpan = 6 * 3600 * 1000;
      } else if (pathname === '/v1/hourly') {
        timeSpan = 3600 * 1000;
      } else if (pathname === '/v1/15m') {
        timeSpan = 15 * 60 * 1000;
      } else {
        throw new Error('Unexpected');
      }
      key = 'aggr-' + timeSpan + '-' + (query.compact ? 'compact' : 'full');
      fetch = async () => {
        const res = await this.leaderboard.getAggregated(timeSpan);

        if (query.compact) {
          return res.map((entry) => {
            return {
              hash: entry.hash,
              meanScore: entry.meanScore,
              meanAgreedScore: entry.meanAgreedScore,
              meanAcceptance: entry.meanAcceptance,
              meanSessions: entry.meanSessions,
            };
          });
        }

        return res;
      };
    } else {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const cached = await this.getCachedStat(key, fetch);

    const encoding = req.headers['accept-encoding'] || '';

    const headers: { [key: string]: string | number } = {
      'content-type': 'application/json',
    };

    let body: Buffer;
    if (encoding.includes('deflate')) {
      headers['content-encoding'] = 'deflate';
      body = cached.deflate;
    } else {
      body = cached.raw;
    }

    res.writeHead(200, headers);
    res.end(body);
  }

  private async getCachedStat(key: string, fetch: () => Promise<any> | any)
      : Promise<CachedStat> {
    if (this.resultCache.has(key)) {
      return await this.resultCache.get(key)!;
    }

    const promise = fetch().then((obj: any) => {
      return new CachedStat(Buffer.from(JSON.stringify(obj, null, 2)));
    });
    this.resultCache.set(key, promise);

    const res = await promise;
    this.resultCache.set(key, res);

    setTimeout(() => {
      this.resultCache.delete(key);
    }, this.options.cacheTimeout);

    return res;
  }

  private maybePlay() {
    const players = Array.from(this.pool.values());

    // Not enough players yet
    if (players.length < 2) {
      return;
    }

    // Enough games, though!
    while (this.activeGames < this.options.parallelGames) {
      this.activeGames++;

      this.playGame(players).then((result: IGameResult) => {
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

  private async playGame(players: ReadonlyArray<IPlayerWrap>)
    : Promise<IGameResult> {
    // Pick two players
    // TODO(indutny): take in account number of games played?
    const first = (Math.random() * players.length) | 0;

    let second: number;
    do {
      second = (Math.random() * players.length) | 0;
    } while (first === second);

    const config = this.generator.get();

    const firstPlayer = players[first];
    const secondPlayer = players[second];

    firstPlayer.activeGames++;
    secondPlayer.activeGames++;

    const game = new Game(config, firstPlayer.player, secondPlayer.player);

    let res: IGameResult
    try {
      res = await game.run();
    } catch (e) {
      throw e;
    } finally {
      firstPlayer.activeGames--;
      secondPlayer.activeGames--;
    }

    Promise.all([
      this.maybeRehash(firstPlayer),
      this.maybeRehash(secondPlayer),
    ]).catch((e) => {
      debug('Rehash error', e);
    });

    return res;
  }
}
