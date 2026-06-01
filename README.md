# Vellum Agent Skill

![Vellum](https://img.shields.io/badge/Vellum-Agent_Skill-blue?style=for-the-badge)
[![Version](https://img.shields.io/badge/Version-1.3.0-orange.svg)](https://github.com/vellum-finance/vellum-agent-skill)
[![Platform](https://img.shields.io/badge/Network-Base_Blockchain-purple.svg)](https://base.org)
[![Uniswap](https://img.shields.io/badge/DEX-V2+V3+V4-pink.svg)](https://uniswap.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**The Official Vellum Skill for AI Agents** — On-chain payments, token trading, and
Flaunch.gg token launches on Base via Uniswap V2, V3, and V4 with automatic best-price routing. Works with Claude, Gemini,
GPT, Hermes, Openclaw, and any MCP-compatible agent.

---

## Requirements

- Node.js **v18** or higher
- npm v8+

---

## Install as Agent Skill

```bash
npx skills add https://github.com/Vellum-Finance/vellum-agent-skill
```

---

## Commands

### Register — create wallet
```bash
vellum register --name "MyAgent"
vellum register --name "MyAgent" --description "Trading bot" --force
```

### List all agents ⭐
```bash
vellum agents
```

### Switch active agent ⭐
```bash
vellum use --id <agentId>
vellum switch --id <agentId>   # alias
```

### Info — show active agent
```bash
vellum info
```

### Balance
```bash
vellum balance
vellum balance --token 0xTokenAddress
```

### Buy token — auto-routes V4→V3→V2 ⭐
```bash
# Best price (auto)
vellum buy --amount 0.01 --token 0xTokenAddress

# Force specific DEX
vellum buy --amount 0.01 --token 0xTokenAddress --dex v4
vellum buy --amount 0.01 --token 0xTokenAddress --dex v3
vellum buy --amount 0.01 --token 0xTokenAddress --dex v2

# Custom slippage
vellum buy --amount 0.01 --token 0xTokenAddress --slippage 10
```

### Sell token — auto-routes V4→V3→V2 ⭐
```bash
vellum sell --amount 1000 --token 0xTokenAddress
vellum sell --amount 1000 --token 0xTokenAddress --dex v4
vellum sell --amount 1000 --token 0xTokenAddress --slippage 10
```


### Launch token on Flaunch.gg ⭐
```bash
# Requires the active Vellum wallet plus a Pinata JWT for SDK IPFS uploads
export PINATA_JWT="<pinata-jwt>"

vellum flaunch \
  --name "My Token" \
  --symbol MYTOK \
  --description "My token description" \
  --image ./token.png

# Optional launch parameters
vellum flaunch \
  --name "My Token" \
  --symbol MYTOK \
  --description "My token description" \
  --image ./token.png \
  --market-cap 10000 \
  --fair-launch-percent 60 \
  --fair-launch-duration 1800 \
  --creator-fee 80 \
  --website https://example.com \
  --twitter https://x.com/example
```

### Send ETH / USDC / ERC-20
```bash
vellum send --to 0xRecipient --amount 0.01 --token ETH
vellum send --to 0xRecipient --amount 10 --token USDC
vellum send --to 0xRecipient --amount 100 --token 0xContractAddress
```

---

## How it works

| Step | What happens |
|------|-------------|
| `register` | Creates a non-custodial ETH wallet, saves to `~/.vellum-wallet.json` |
| `agents` | Lists all registered agents and shows which is active |
| `use` / `switch` | Switches active agent by agentId |
| `balance` | Reads ETH + USDC (+ optional token) balance from Base RPC |
| `buy` | Auto-routes: probes V4 pools → V3 pools → V2, picks best quote |
| `sell` | Auto-routes: same logic, picks highest ETH output |
| `flaunch` | Uses the official Flaunch SDK to upload token metadata/image to IPFS and launch through Flaunch.gg |
| `send` | Transfers ETH, USDC, or any ERC-20 directly on-chain |

---

## DEX Routing Logic

```
buy/sell command
    │
    ├─ V4: checks PoolManager via StateView (fee tiers: 0.01%, 0.05%, 0.3%, 1%)
    │       if pool exists + has liquidity → get V4Quoter quote
    │
    ├─ V3: checks Factory for pool (fee tiers: 0.01%, 0.05%, 0.3%, 1%)
    │       if pool exists → get QuoterV2 quote
    │
    └─ V2: getAmountsOut via Router02
    
    → Best quote wins → execute on that DEX
```

---

## DEX Contracts (Base Mainnet)

| DEX | Contract | Address |
|-----|----------|---------|
| V2 | Router02 | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| V3 | SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| V3 | QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| V4 | PoolManager | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| V4 | UniversalRouter | `0x6fF5693b99212Da76ad316178A184AB56D299b43` |
| V4 | Quoter | `0x0d5e0f971ed27fbff6c2837bf31316121532048d` |
| V4 | StateView | `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` |

---

## Repository Structure

```
vellum-agent-skill/
├── cli.js
├── install.js
├── package.json
├── SKILL.md
└── README.md
```

---

## License

MIT — free to use, modify, fork, and distribute.
