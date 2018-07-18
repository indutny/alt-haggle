import * as crypto from 'crypto';

import { IGeneratorResult, Generator, Counts, Values } from './generator';
import { Player } from './player';

type Offer = Counts;

export { Offer };

export interface IConfig {
  readonly counts: Counts;
  readonly values: Values;
  readonly maxRounds: number;
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
    // Send configuration to both players
    await Promise.all([
      () => {
        return this.first.start(this.id, {
          counts: this.config.counts,
          values: this.config.valuations.first,
          maxRounds: this.config.maxRounds
        });
      },
      () => {
        return this.second.start(this.id, {
          counts: this.config.counts,
          values: this.config.valuations.first,
          maxRounds: this.config.maxRounds
        });
      },
    ]);

    let offer: Offer | undefined = undefined;
    for (let i = 0; i < this.config.maxRounds; i++) {
      let counterOffer = await this.first.step(this.id, offer);
      if (counterOffer === undefined) {
        if (i === 0) {
          throw new Error('Invalid first offer');
        }

        return this.result(offer!, this.invertOffer(offer!));
      }
      this.validateOffer(counterOffer);
      offer = this.invertOffer(counterOffer);

      counterOffer = await this.second.step(this.id, offer);
      if (counterOffer === undefined) {
        return this.result(this.invertOffer(offer!), offer!);
      }
      this.validateOffer(counterOffer);
      offer = this.invertOffer(counterOffer);
    }

    // Round limit
    return {
      accept: false,
      first: 0,
      second: 0,
    };
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
