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

export interface IGeneratorValuations {
  readonly first: Values;
  readonly second: Values;
};

export interface IGeneratorResult {
  readonly counts: Counts;
  readonly valuations: IGeneratorValuations;
  readonly maxRounds: number;
}

export class Generator {
  private readonly objSets: IObjectSet[] = [];

  constructor(private readonly types: number,
              private readonly minObj: number,
              private readonly maxObj: number,
              private readonly total: number,
              private readonly maxRounds: number){
    this.initSets(new Array(types) as number[], 0, 0);
    if (!this.objSets.length) {
      throw new Error('Constraints cannot be satisfied');
    }
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

  public get(): IGeneratorResult {
    const set = this.objSets[(Math.random() * this.objSets.length) | 0];

    const first = (Math.random() * set.valuations.length) | 0;
    let second: number;
    do {
      second = (Math.random() * set.valuations.length) | 0;
    } while (first === second);

    return {
      counts: set.counts,
      valuations: {
        first: set.valuations[first],
        second: set.valuations[second],
      },
      maxRounds: this.maxRounds,
    };
  }
}
