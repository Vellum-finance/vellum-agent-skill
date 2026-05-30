# Vellum Agent Skill

![Vellum](https://img.shields.io/badge/Vellum-Agent_Skill-blue?style=for-the-badge)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.1.0-orange.svg)](https://github.com/vellum-finance/vellum-agent-skill)
[![Platform](https://img.shields.io/badge/Network-Base_Blockchain-purple.svg)](https://base.org)
[![Protocol](https://img.shields.io/badge/Protocol-x402-gold.svg)](https://x402.org)

**The Official Vellum Skill for AI Agents** — On-chain payments, multi-agent switching, and token trading on Base via the x402 protocol. Works with Claude, Gemini, GPT, Hermes, Openclaw, and any MCP-compatible agent.

---

## Requirements

- Node.js **v18** or higher
- npm v8+

---

## Install as Global CLI (`vellum` command)

```bash
npm install -g https://github.com/Vellum-finance/vellum-agent-skill
```

Verify:

```bash
vellum --help
```

---

## Install as Agent Skill

```bash
npx skills add https://github.com/Vellum-finance/vellum-agent-skill
```

> The `postinstall` hook runs automatically and installs `vellum` globally for you.

---

## Commands

### Register — create wallet
```bash
vellum register --name "MyAgent"
vellum register --name "MyAgent" --description "Trading bot" --force
```

### List all registered agents ⭐
```bash
vellum agents
```

### Switch active agent ⭐
```bash
vellum use --id <agentId>
vellum switch --id <agentId>   # alias
```

### Info — show active agent details
```bash
vellum info
```

### Balance
```bash
vellum balance
vellum balance --token 0xTokenAddress
```

### Send ETH
```bash
vellum send --to 0xRecipient --amount 0.01 --token ETH
```

### Send USDC
```bash
vellum send --to 0xRecipient --amount 10 --token USDC
```

### Send any ERC-20
```bash
vellum send --to 0xRecipient --amount 100 --token 0xContractAddress
```

### Buy token with ETH
```bash
vellum buy --amount 0.01 --token 0xContractAddress
vellum buy --amount 0.01 --token 0xContractAddress --slippage 10
```

### Sell token for ETH
```bash
vellum sell --amount 1000 --token 0xContractAddress
vellum sell --amount 1000 --token 0xContractAddress --slippage 10
```

---

## Multi-Agent Workflow

```bash
# Register multiple agents
vellum register --name "TradingBot"
# → Agent ID: a1b2c3d4-xxxx-...

vellum register --name "PaymentBot"
# → Agent ID: e5f6g7h8-xxxx-...

# See all agents
vellum agents
# ▶ [ACTIVE] PaymentBot  e5f6g7h8-...
#            TradingBot  a1b2c3d4-...

# Switch to TradingBot
vellum use --id a1b2c3d4-xxxx-...

# Confirm
vellum info
# → Active: TradingBot
```

---

## How it works

| Step | What happens |
|------|-------------|
| `register` | Creates a non-custodial ETH wallet, saves to `~/.vellum-wallet.json` |
| `agents` | Lists all registered agents and shows which is active |
| `use` / `switch` | Switches active agent by agentId; all commands use that wallet |
| `balance` | Reads ETH + USDC (+ optional token) balance from Base RPC |
| `send` | Transfers ETH, USDC, or any ERC-20 directly on-chain |
| `buy` | Swaps ETH → token via Uniswap V2 on Base |
| `sell` | Approves + swaps token → ETH via Uniswap V2 on Base |

- Wallet stored at `~/.vellum-wallet.json` (persists across sessions, multi-agent)
- All transactions broadcast to **Base Mainnet**
- Trades route through **Uniswap V2** on Base
- Confirmation prompt before every transaction

---

## Repository Structure

```
vellum-agent-skill/
├── cli.js          ← Main CLI (all commands including use/switch/agents)
├── install.js      ← Auto global install + file protection
├── package.json    ← npm config + postinstall hook
├── SKILL.md        ← Agent skill manifest (read-only)
└── README.md       ← This file
```

---

## File Protection

After install, core files are marked **read-only** (`chmod 444`) to prevent
modification by agents or automated processes.

---

## License

MIT — free to use
