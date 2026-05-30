# Vellum Agent Skill

![Vellum](https://img.shields.io/badge/Vellum-Agent_Skill-blue?style=for-the-badge)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.1.0-orange.svg)](https://github.com/vellum-finance/vellum-agent-skill)
[![Platform](https://img.shields.io/badge/Network-Base_Blockchain-purple.svg)](https://base.org)
[![Protocol](https://img.shields.io/badge/Protocol-x402-gold.svg)](https://x402.org)

**The Official Vellum Skill for AI Agents** â€” On-chain payments and token trading on Base via the x402 protocol. Works with Claude, Gemini, GPT, Hermes, Openclaw, and any MCP-compatible agent.

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

---

## Commands

### Register â€” create wallet
```bash
vellum register --name "MyAgent"
vellum register --name "MyAgent" --description "Trading bot" --force
```

### Balance
```bash
vellum balance
vellum balance --token 0xTokenAddress
```

### Info â€” show agent details
```bash
vellum info
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

## How it works

| Step | What happens |
|------|-------------|
| `register` | Creates a non-custodial ETH wallet, saves to `~/.vellum-wallet.json` |
| `balance` | Reads ETH + USDC (+ optional token) balance from Base RPC |
| `send` | Transfers ETH, USDC, or any ERC-20 directly on-chain |
| `buy` | Swaps ETH â†’ token via Uniswap V2 on Base |
| `sell` | Approves + swaps token â†’ ETH via Uniswap V2 on Base |

- Wallet is stored globally at `~/.vellum-wallet.json`
- All transactions broadcast to **Base Mainnet**
- Trades route through **Uniswap V2** on Base
- Confirmation prompt before every transaction

---

## Repository Structure

```
vellum-agent-skill/
├── cli.js
├── package.json
├── SKILL.md
└── README.md
```

---

## License

MIT â€” free to use, modify, fork, and distribute.
