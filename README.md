# 🎯 Guess My Number

A real-time **1v1 multiplayer** number guessing game built with Node.js, Express, and Socket.IO. Two players go head-to-head — each picks a secret number, then takes turns trying to crack the other's code using hot/cold hints.

---

## 🕹️ How It Works

1. **Match up** — find a random opponent or create a private room and share the code with a friend
2. **Set your secret** — each player picks a number between **1 and 100**, hidden from the other
3. **Take turns guessing** — the guesser throws out a number; the opponent responds with **Higher**, **Lower**, or **Correct**
4. **First to crack it wins** — whoever correctly identifies their opponent's number first takes the round

---

## ✨ Features

- ⚡ **Real-time gameplay** via WebSockets (Socket.IO)
- 🎲 **Quick Match** — auto-pairs you with any available online player
- 🔐 **Private Rooms** — create a room and share a 6-character code with a friend
- 📜 **Live guess history** — full log of every guess and response, updated in real time
- 🔄 **Rematch system** — both players can vote to play again instantly
- 📡 **Disconnect handling** — game ends gracefully if a player drops
- 📱 **Responsive UI** — works on desktop and mobile

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Server | Express |
| Real-time | Socket.IO |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Google Fonts (Syne, Space Mono) |
| Styling | Tailwind CSS (CDN) + Custom CSS |

---

## 🚀 Getting Started (if you want it ofline or localhost)

### Prerequisites

- Node.js v16 or higher
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/yahya111;/guess-my-number.git
cd guess-my-number

# Install dependencies
npm install
```

### Running the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Then open your browser at **http://localhost:3000**

---

## 📁 Project Structure

```
guess-my-number/
├── public/
│   └── index.html       # Game UI (single-page)
├── server.js            # Express + Socket.IO server
├── package.json
└── README.md
```

---

## 🔌 Socket Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `find_match` | `{ name }` | Join the random matchmaking queue |
| `cancel_match` | — | Leave the queue |
| `create_room` | `{ name }` | Create a private room |
| `join_room` | `{ name, roomCode }` | Join a room by code |
| `set_secret` | `{ number }` | Lock in your secret number |
| `make_guess` | `{ guess }` | Send a guess to your opponent |
| `send_response` | `{ response }` | Reply with `higher`, `lower`, or `correct` |
| `request_rematch` | — | Vote for a rematch |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `room_state` | `{ state, yourTurn, ... }` | Full room state update |
| `waiting_for_match` | — | Placed in matchmaking queue |
| `room_created` | `{ roomCode }` | Private room created |
| `respond_to_guess` | `{ guess, guesserName }` | Opponent made a guess — respond |
| `got_response` | `{ response, responderName }` | Your guess got a response |
| `game_over` | `{ winnerId, secretNumbers, ... }` | Game ended, reveal secrets |
| `opponent_wants_rematch` | — | Opponent voted for rematch |
| `opponent_disconnected` | — | Opponent left the game |
| `join_error` | `{ message }` | Room join failed |

---

## 🌐 Deployment

The server binds to `0.0.0.0` and reads the port from the `PORT` environment variable, so it's ready to deploy on any platform:

```bash
PORT=8080 npm start
```

Compatible with **Railway**, **Render**, **Fly.io**, **Heroku**, and any VPS.

---

## 📄 License

MIT — free to use, modify, and distribute.
