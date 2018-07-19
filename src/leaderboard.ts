import { IGameResult } from './game';

export interface ILeaderboardOptions {
}

interface IDefiniteLeaderboardOptions {
}

export class Leaderboard {
  private readonly options: IDefiniteLeaderboardOptions;

  constructor(options: ILeaderboardOptions = {}) {
    this.options = Object.assign({
    }, options);
  }

  public add(result: IGameResult): void {
    console.log(result);
  }
}
