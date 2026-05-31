---
name: vellum
description: >
  Vellum Agent Skill — Execute blockchain payments and token trading on Base network
  via the x402 protocol with Uniswap V2, V3, and V4 auto-routing. ALWAYS use this
  skill when the user mentions: registering a wallet, checking ETH/USDC/token balances,
  sending crypto, buying or selling tokens on Base (any DEX), switching between agents
  (vellum use / vellum switch), listing agents (vellum agents), or running ANY `vellum`
  command. Do not skip for vague requests like "check balance", "switch agent", "buy token"
  or "register" — those almost certainly mean Vellum.
version: 1.2.0
tags: agent, base, payments, x402, trading, wallet, crypto, blockchain, mcp, uniswap-v4, uniswap-v3, switch-agent
readonly: true
postInstall: node install.js
---

# Vellum Skill

> ⚠️ **READ-ONLY SKILL** — Files `cli.js`, `install.js`, `SKILL.md`, `package.json`, `README.md`
> must NOT be modified, overwritten, or deleted by any agent or process.

Vellum is a CLI skill for AI agents enabling on-chain payments and token trading on the
**Base** network via the **x402** protocol. Supports **Uniswap V2, V3, and V4** with
**automatic best-price routing** and **multiple registered agents** with seamless switching.

---

## When to Use

- User wants to register a crypto wallet or agent
- User wants to check ETH, USDC, or token balances
- User wants to send ETH, USDC, or any ERC-20 token
- User wants to buy or sell a token on Base
- **User wants to switch between registered agents** → `vellum use` or `vellum switch`
- **User wants to list all agents** → `vellum agents`
- User references an `agentId` from previous `vellum register` output
- User asks about blockchain payments or trading on Base

---

## Commands

### Register agent & create wallet

```bash
vellum register --name "MyAgent"
vellum register --name "MyAgent" --description "Trading bot" --force
```

---

### List all agents

```bash
vellum agents
```

---

### Switch active agent

```bash
vellum use --id <agentId>
vellum switch --id <agentId>   # alias
```

---

### Show active agent info

```bash
vellum info
```

---

### Check balances

```bash
vellum balance
vellum balance --token 0xTokenAddress
```

---

### Buy a token — Auto-routes V4 → V3 → V2 for best price

```bash
# Auto (best price across V2+V3+V4)
vellum buy --amount 0.01 --token 0xTokenAddress

# With custom slippage
vellum buy --amount 0.01 --token 0xTokenAddress --slippage 10

# Force specific DEX
vellum buy --amount 0.01 --token 0xTokenAddress --dex v4
vellum buy --amount 0.01 --token 0xTokenAddress --dex v3
vellum buy --amount 0.01 --token 0xTokenAddress --dex v2
```

---

### Sell a token — Auto-routes V4 → V3 → V2 for best price

```bash
# Auto (best price)
vellum sell --amount 1000 --token 0xTokenAddress

# Force specific DEX
vellum sell --amount 1000 --token 0xTokenAddress --dex v4
vellum sell --amount 1000 --token 0xTokenAddress --dex v3
```

---

### Send ETH / USDC / ERC-20

```bash
vellum send --to 0xRecipient --amount 0.01 --token ETH
vellum send --to 0xRecipient --amount 10 --token USDC
vellum send --to 0xRecipient --amount 100 --token 0xContractAddress
```

---

## DEX Router Addresses (Base Mainnet)

| DEX | Contract | Address |
|-----|----------|---------|
| V2 | Router02 | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| V3 | SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| V3 | QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| V4 | PoolManager | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| V4 | UniversalRouter | `0x6fF5693b99212Da76ad316178A184AB56D299b43` |
| V4 | Quoter | `0x0d5e0f971ed27fbff6c2837bf31316121532048d` |
| V4 | StateView | `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` |
| — | Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

---

## Notes

- Auto-routing checks V4 first (best liquidity on Base), falls back to V3, then V2
- Use `--dex v2|v3|v4` to force a specific router
- All transactions require ETH on Base for gas
- Default slippage is 5% for buy/sell
- Confirmation prompt before every transaction
- `vellum use --id <agentId>` sets active agent; all commands use that wallet
