# alt-haggle

Alternative [haggle.js][0] server.

## Differences from main server

1. Agents maintain persistent connection to the server
2. For each game two agents are randomly sampled from the pool
3. Game stats are collected per agent pair, not per agent

## Key commands

To start client run:
```bash
npm install
./bin/client.ts --name your@email.com:random_static_id --script /path/to/script
```
_(NOTE: there're no logs on the client yet, but PRs are welcome!)_

To start server run (you need to have Redis running locally):
```bash
npm install
./bin/server.ts
```

## Key urls

Leaderboard (updates every 5 seconds):
```
http://host/v1/standard
```

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2018.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[0]: https://github.com/hola/challenge_haggling