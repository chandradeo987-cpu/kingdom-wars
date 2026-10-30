# Kingdom Wars — Multiplayer Kingdom Strategy

A small real-time, turn-based browser game based on the four phases in the supplied chart:

1. **Lobby** — create a room and invite 1–5 other players with the room code.
2. **Playing** — each ruler submits exactly one kingdom order per round.
3. **Resolving** — the server resolves all submitted orders together and updates kingdoms.
4. **Game over** — first kingdom to 12 crowns wins, or the highest score after 12 rounds.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 in a browser. For a local multiplayer test, open the same address in two or more browser windows and join with the room code. For friends to join from other devices, deploy this folder to a Node.js host that supports WebSockets (Socket.IO), then share the public URL and room code.

## Actions

- Farm: +5 food, +1 gold
- Mine: +3 stone, +2 gold
- Lumber: +4 wood, +1 food
- Trade: spend 2 food to gain 4 gold (or 1 gold if short on food)
- Build: spend 3 wood, 2 stone and 3 gold to gain a castle level and 2 crowns
- Train guards: spend 3 food and 3 gold to gain 2 guards
- Festival: spend 4 food to gain 1 crown and 2 gold

Army upkeep consumes food after each round. Every third castle level earns an additional crown per round. The server is authoritative for room state and round resolution.

## Notes

This is a playable starter game, not a production-hardened service. Rooms are held in server memory and reset when the server restarts. Add persistent storage, reconnect/session recovery, rate limiting and deployment HTTPS before a public launch.
