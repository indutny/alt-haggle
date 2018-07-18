import * as ws from 'ws';
import * as http from 'http';

import { Connection } from './connection';

export interface IServerOptions {
  readonly timeout?: number;
  readonly parallelGames?: number;
}

interface IDefiniteServerOptions {
  readonly timeout: number;
  readonly parallelGames: number;
}

export class Server extends http.Server {
  private readonly ws: ws.Server = new ws.Server({ server: this });
  private readonly pool: Set<Connection> = new Set();
  private readonly options: IDefiniteServerOptions;
  private activeGames: number = 0;

  constructor(options: IServerOptions = {}) {
    super();

    this.options = Object.assign({
      timeout: 2000,
      parallelGames: 1000,
    }, options);

    this.ws.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: ws): void {
    const conn = new Connection(socket);

    conn.once('ready', () => {
      this.pool.add(conn);
      this.maybePlay();
    });

    conn.once('close', () => {
      this.pool.delete(conn);
    });
  }

  private maybePlay(): void {
    // Not enough players yet
    if (this.pool.size < 2) {
      return;
    }

    if (this.activeGames >= this.options.parallelGames) {
      return;
    }
  }
}
