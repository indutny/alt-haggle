export type Counts = ReadonlyArray<number>;
export type Values = ReadonlyArray<number>;

interface IObjectSet {
  readonly counts: Counts;
  readonly valuations: ReadonlyArray<Counts>;
}

interface IWritableObjectSet {
  readonly counts: number[];
  readonly valuations: Array<number[]>;
}

export interface IGeneratorResult {
  readonly counts: Counts;
  readonly valuations: ReadonlyArray<Counts>;
  readonly maxRounds: number;
}

export class Generator {
  private readonly objSets: IObjectSet[] = [];
  private readonly results: IGeneratorResult[] = [];

  constructor(private readonly types: number,
              private readonly minObj: number,
              private readonly maxObj: number,
              private readonly total: number,
              private readonly maxRounds: number){
    this.initSets(new Array(types) as number[], 0, 0);
    if (!this.objSets.length) {
      throw new Error('Constraints cannot be satisfied');
    }

    this.generateResults();
  }

  private initSets(counts: number[], i: number, totalCount: number): void {
    const min = Math.max(1, this.minObj - totalCount - this.types + i + 1);
    const max = this.maxObj - totalCount - this.types + i + 1;

    for (let j = min; j <= max; j++) {
      counts[i] = j;
      if (i < this.types - 1) {
        this.initSets(counts, i + 1, totalCount + j);
      } else {
        const objSet = { counts: Array.from(counts), valuations: [] };
        this.initValuations(objSet, new Array(this.types) as number[], 0, 0);
        if (objSet.valuations.length >= 2) {
          this.objSets.push(objSet);
        }
      }
    }
  }

  private initValuations(objSet: IWritableObjectSet, values: number[],
                         i: number, totalValue: number): void {
    const count = objSet.counts[i];
    const max = Math.floor((this.total - totalValue) / count);

    if (i === this.types - 1) {
      if (totalValue + max * count === this.total) {
        values[i] = max;
        objSet.valuations.push(Array.from(values));
      }
      return;
    }

    for (let j = 0; j <= max; j++) {
      values[i] = j;
      this.initValuations(objSet, values, i + 1, totalValue + j * count);
    }
  }

  private generateResults(): void {
    for (const s of this.objSets) {
      for (let i = 0; i < s.valuations.length; i++) {
        const left = s.valuations[i];
        for (let j = i + 1; j < s.valuations.length; j++) {
          const right = s.valuations[j];

          this.results.push({
            counts: s.counts,
            valuations: [ left, right ],
            maxRounds: this.maxRounds,
          });
        }
      }
    }
  }

  public get maxSeed(): number {
    return this.results.length * 2;
  }

  public get(seed: number): IGeneratorResult {
    const swap = seed % 2 === 1;
    seed >>>= 1;

    let res = this.results[seed];

    // Just to save some memory
    if (swap) {
      res = {
        counts: res.counts,
        valuations: [
          res.valuations[1], res.valuations[0],
        ],
        maxRounds: this.maxRounds,
      };
    }

    return res;
  }
}
