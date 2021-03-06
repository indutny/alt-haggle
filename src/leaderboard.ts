import { promisify } from 'util';
import * as redis from 'redis';
import * as debugAPI from 'debug';
import * as LRU from 'lru-cache';

import { IGameResult } from './game';

const debug = debugAPI('alt-haggle:leaderboard');

export interface ILeaderboardOptions {
  readonly url?: string;
  readonly prefix?: string;
  readonly expire?: number;
  readonly period?: number;
  readonly lruSize?: number;
}

interface IDefiniteLeaderboardOptions {
  readonly url: string;
  readonly prefix: string;
  readonly expire: number;
  readonly period: number;
  readonly lruSize: number;
}

export interface IRawResultSingle {
  readonly timestamp: Date;
  readonly hashes: string[];
  readonly scores: number[];
  readonly meanScores: number[];
  readonly meanAgreedScores: number[];
  readonly agreements: number;
  readonly sessions: number;
}

export type RawResults = ReadonlyArray<IRawResultSingle>;

interface IAggregatedSingle {
  readonly hash: string;
  readonly opponent: string;
  readonly score: number;
  readonly agreements: number;
  readonly sessions: number;
}

export interface IAggregatedTableEntry {
  readonly hash: string;
  readonly meanScore: number;
  readonly meanAgreedScore: number;
  readonly meanAcceptance: number;
  readonly meanSessions: number;
  readonly opponents: ReadonlyArray<[ string, number ]>;
}

export type AggregatedTable = ReadonlyArray<IAggregatedTableEntry>;

interface IParsedKey {
  readonly raw: string;
  readonly timestamp: Date;
  readonly hashes: string[];
}

interface IRedisObject {
  readonly sessions: number;
  readonly agreements: number;
  readonly score0: number;
  readonly score1: number;
}

export class Leaderboard {
  private readonly options: IDefiniteLeaderboardOptions;
  private readonly db: redis.RedisClient;
  private readonly lru: LRU.Cache<string, IRedisObject>;

  constructor(options: ILeaderboardOptions = {}) {
    this.options = Object.assign({
      url: 'redis://localhost:6379',
      prefix: 'ah/',
      expire: 3600 * 24 * 7, // 7 days before expiration
      period: 1000 * 60 * 15, // 15 minutes
      lruSize: 100000,
    }, options);

    this.db = redis.createClient(this.options.url);

    this.db.on('error', (err) => debug('db error %j', err));

    this.lru = new LRU({
      max: this.options.lruSize,
      maxAge: Infinity,
    });
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

    const ts = this.timestampToKey(Date.now());
    const key = this.options.prefix +
      's/' + ts + ':' + results[0].hash + ':' + results[1].hash;

    const promises: Promise<any>[] = [];

    this.db.hincrby(key, 'sessions', 1);
    if (result.accept) {
      this.db.hincrby(key, 'agreements', 1);
    }

    this.db.hincrby(key, 'score0', results[0].score);
    this.db.hincrby(key, 'score1', results[1].score);

    this.db.expire(key, this.options.expire);
  }

  private async getRedisObject(key: IParsedKey): Promise<IRedisObject> {
    const cached = this.lru.get(key.raw);
    if (cached) {
      return cached;
    }

    const hgetall = promisify(this.db.hgetall);
    const obj: IRedisObject = await hgetall.call(this.db, key.raw);

    // Cache old results, they're not updated anyway
    const cutoff = Date.now() - this.options.period;
    if (key.timestamp.getTime() < cutoff) {
      this.lru.set(key.raw, obj);
    }
    return obj;
  }

  public async getRaw(timeSpan: number = Infinity): Promise<RawResults> {
    const prefix = this.options.prefix + 's/';
    const keys = await promisify(this.db.keys).call(this.db, prefix + '*');

    const parsedKeys: IParsedKey[] = keys.map((key: string) => {
      const parts = key.slice(prefix.length).split(':');
      const timestamp = new Date(parseInt(parts[0], 10));
      const hashes = parts.slice(1);

      return { timestamp, hashes, raw: key };
    });

    const startTime = Date.now() - timeSpan;

    const filteredKeys = parsedKeys.filter((key) => {
      return key.timestamp.getTime() >= startTime;
    });

    const res: IRawResultSingle[] = [];

    await Promise.all(filteredKeys.map(async (key) => {
      const entry = await this.getRedisObject(key);

      const scores: number[] = [
        entry.score0! | 0,
        entry.score1! | 0,
      ];

      const sessions = entry.sessions | 0;
      const agreements = entry.agreements | 0;

      res.push({
        timestamp: key.timestamp,
        hashes: key.hashes,
        scores,
        sessions,
        agreements,
        meanScores: scores.map((score) => score / sessions),
        meanAgreedScores: scores.map((score) => score / agreements),
      });
    }));

    // Fresh results on top
    res.sort((a, b) => {
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return res;
  }

  public async getAggregated(timeSpan: number): Promise<AggregatedTable> {
    const results = await this.getRaw(timeSpan);

    const map: Map<string, Map<string, IAggregatedSingle>> = new Map();

    const add = (interim: IAggregatedSingle) => {
      let submap: Map<string, IAggregatedSingle>;
      if (map.has(interim.hash)) {
        submap = map.get(interim.hash)!;
      } else {
        submap = new Map();
        map.set(interim.hash, submap);
      }

      let entry: IAggregatedSingle;
      if (submap.has(interim.opponent)) {
        entry = submap.get(interim.opponent)!;
        submap.set(interim.opponent, {
          hash: interim.hash,
          opponent: interim.opponent,
          score: entry.score + interim.score,
          agreements: entry.agreements + interim.agreements,
          sessions: entry.sessions + interim.sessions,
        });
      } else {
        submap.set(interim.opponent, interim);
      }
    };

    for (const entry of results) {
      const sessions = entry.sessions;
      const agreements = entry.agreements;

      entry.hashes.forEach((hash, index) => {
        add({
          hash,
          opponent: entry.hashes[entry.hashes.length - index - 1],
          score: entry.scores[index],
          agreements,
          sessions,
        });
      });
    }

    const res: IAggregatedTableEntry[] = [];

    map.forEach((submap, hash) => {
      let meanScore = 0;
      let meanAgreedScore = 0;
      let acceptance = 0;
      let sessions = 0;

      const opponents: Array<[string, number]> = [];

      for (const single of submap.values()) {
        meanScore += single.score / single.sessions;
        meanAgreedScore += single.score / single.agreements;
        acceptance += single.agreements / single.sessions;
        sessions += single.sessions;

        opponents.push([ single.opponent, single.score / single.sessions ]);
      }

      opponents.sort((a, b) => {
        return b[1] - a[1];
      });

      meanScore /= submap.size;
      meanAgreedScore /= submap.size;
      acceptance /= submap.size;
      sessions /= submap.size;

      res.push({
        hash,
        meanScore,
        meanAgreedScore,
        meanAcceptance: acceptance,
        meanSessions: sessions,
        opponents,
      });
    });

    res.sort((a, b) => {
      return b.meanScore - a.meanScore;
    });

    return res;
  }

  private timestampToKey(timestamp: number): string {
    const period = this.options.period;
    const ts = Math.floor(timestamp / period) * period;

    let res = ts.toString();
    while (res.length < 16) {
      res = '0' + res;
    }
    return res;
  }
}
