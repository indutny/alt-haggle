import { promisify } from 'util';
import * as redis from 'redis';
import * as debugAPI from 'debug';

import { IGameResult } from './game';

const debug = debugAPI('alt-haggle:leaderboard');

export interface ILeaderboardOptions {
  readonly url?: string;
  readonly prefix?: string;
  readonly cacheTimeout?: number;
}

interface IDefiniteLeaderboardOptions {
  readonly url: string;
  readonly prefix: string;
  readonly cacheTimeout: number;
}

export interface ILeaderboardSingleResult {
  readonly timestamp: Date;
  readonly hashes: string[];
  readonly scores: number[];
  readonly meanScore: number[];
  readonly meanAgreedScore: number[];
  readonly agreements: number;
  readonly sessions: number;
}

export type LeaderboardResults = ReadonlyArray<ILeaderboardSingleResult>;

export class Leaderboard {
  private readonly options: IDefiniteLeaderboardOptions;
  private readonly db: redis.RedisClient;
  private cachedResults
    : LeaderboardResults | Promise<LeaderboardResults> | undefined = undefined;

  constructor(options: ILeaderboardOptions = {}) {
    this.options = Object.assign({
      url: 'redis://localhost:6379',
      prefix: 'ah/',
      cacheTimeout: 5000, // 5 secs
    }, options);

    this.db = redis.createClient(this.options.url);

    this.db.on('error', (err) => debug('db error %j', err));
  }

  public add(result: IGameResult): void {
    const results = [ {
      hash: result.firstHash,
      score: result.first,
    }, {
      hash: result.secondHash,
      score: result.second,
    } ];

    results.sort((a, b) => {
      return a.hash > b.hash ? 1 : a.hash < b.hash ? -1 : 0;
    });

    // Every hour gets different key
    const ts = Math.floor(Date.now() / (3600 * 1000)) * 3600 * 1000;
    const key = 's/' + ts + ':' + results[0].hash + ':' + results[1].hash;

    this.db.hincrby(this.options.prefix + key, 'sessions', 1);
    if (result.accept) {
      this.db.hincrby(this.options.prefix + key, 'agreements', 1);
    }

    this.db.hincrby(this.options.prefix + key, 'score0', results[0].score);
    this.db.hincrby(this.options.prefix + key, 'score1', results[1].score);
  }

  public async getResults(): Promise<LeaderboardResults> {
    if (this.cachedResults) {
      return await this.cachedResults;
    }

    const promise = this.fetchResults();
    this.cachedResults = promise;

    const res = await promise;
    this.cachedResults = res;

    setTimeout(() => {
      this.cachedResults = undefined;
    }, this.options.cacheTimeout);

    return res;
  }

  private async fetchResults(): Promise<LeaderboardResults> {
    const prefix = this.options.prefix + 's/';
    const keys = await promisify(this.db.keys).call(this.db, prefix + '*');

    const res: ILeaderboardSingleResult[] = [];

    // TODO(indutny): use hgetall
    await Promise.all(keys.map(async (key: string) => {
      const parts = key.slice(prefix.length).split(':');
      const timestamp = new Date(parseInt(parts[0], 10));
      const hashes = parts.slice(1);

      const hget = promisify(this.db.hget);

      const scores = [
        await hget.call(this.db, key, 'score0') | 0,
        await hget.call(this.db, key, 'score1') | 0,
      ];

      const sessions = await hget.call(this.db, key, 'sessions') | 0;
      const agreements = await hget.call(this.db, key, 'agreements') | 0;

      res.push({
        timestamp,
        hashes,
        scores,
        sessions,
        agreements,
        meanScore: scores.map((score) => score / sessions),
        meanAgreedScore: scores.map((score) => score / agreements),
      });
    }));

    // Fresh results on top
    res.sort((a, b) => {
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return res;
  }
}
