import * as crypto from 'crypto';

import { Generator, Counts, Values } from './generator';
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

  constructor(private readonly first: Player, private readonly second: Player) {
  }

  public async run(): Promise<IGameResult> {
    return {
      accept: false,
      first: 0,
      second: 0,
    };
  }
}
