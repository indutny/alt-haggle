import * as debugAPI from 'debug';
import * as crypto from 'crypto';

import { IGeneratorResult, Generator, Counts, Values } from './generator';
import { Player } from './player';

const debug = debugAPI('alt-haggle:game');

type Offer = Counts;

export { Offer };

export interface IConfig {
  readonly isFirst: boolean;

  readonly counts: Counts;
  readonly values: Values;
  readonly maxRounds: number;
}

export interface IOpponentResult {
  readonly accept: boolean;
  readonly score: number;
  readonly opponentScore: number;
  readonly opponentValues: Values;
}

export interface IGameResult {
  readonly accept: boolean;
  readonly first: number;
  readonly second: number;
}

export class Game {
  private readonly id: string = crypto.randomBytes(16).toString('hex');

  constructor(private readonly config: IGeneratorResult,
              private readonly first: Player,
              private readonly second: Player) {
  }

  public async run(): Promise<IGameResult> {
    debug('running game %s', this.id);

    // Send configuration to both players
    await Promise.all([
      this.first.start(this.id, {
        isFirst: true,
        counts: this.config.counts,
        values: this.config.valuations.first,
        maxRounds: this.config.maxRounds
      }),

      this.second.start(this.id, {
        isFirst: false,
        counts: this.config.counts,
        values: this.config.valuations.second,
        maxRounds: this.config.maxRounds
      }),
    ]);

    debug('game=%s started both players', this.id);

    let result: IGameResult = {
      accept: false,
      first: 0,
      second: 0,
    };

    let err: Error | undefined = undefined;

    try {
      let offer: Offer | undefined = undefined;
      for (let i = 0; i < this.config.maxRounds; i++) {
        let counterOffer = await this.first.step(this.id, offer);
        if (counterOffer === undefined) {
          if (i === 0) {
            throw new Error('Invalid first offer');
          }

          result = this.result(offer!, this.invertOffer(offer!));
          break;
        }
        this.validateOffer(counterOffer);
        offer = this.invertOffer(counterOffer);

        counterOffer = await this.second.step(this.id, offer);
        if (counterOffer === undefined) {
          result = this.result(this.invertOffer(offer!), offer!);
          break;
        }
        this.validateOffer(counterOffer);
        offer = this.invertOffer(counterOffer);
      }
    } catch (e) {
      err = e;
    }

    // Send configuration to both players
    await Promise.all([
      this.first.end(this.id, {
        accept: result.accept,
        score: result.first,
        opponentScore: result.second,
        opponentValues: this.config.valuations.second,
      }),

      this.second.end(this.id, {
        accept: result.accept,
        score: result.second,
        opponentScore: result.first,
        opponentValues: this.config.valuations.first,
      }),
    ]);

    // Throw error after ending games
    if (err) {
      throw err;
    }

    // Round limit
    return result;
  }

  private validateOffer(offer: Offer): void {
    if (offer.length !== this.config.counts.length) {
      throw new Error('Invalid offer');
    }
  }

  private invertOffer(offer: Offer): Offer {
    const res = Array.from(offer);
    for (let i = 0; i < res.length; i++) {
      res[i] = this.config.counts[i] - res[i];
    }
    return res;
  }

  private offerValue(offer: Offer, values: Values): number {
    let res = 0;
    for (let i = 0; i < offer.length; i++) {
      res += offer[i] * values[i];
    }
    return res;
  }

  private result(first: Offer, second: Offer): IGameResult {
    return {
      accept: true,
      first: this.offerValue(first, this.config.valuations.first),
      second: this.offerValue(second, this.config.valuations.second),
    };
  }
}
