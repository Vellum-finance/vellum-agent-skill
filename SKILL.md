---
name: vellum
description: >
  Vellum Agent Skill — Execute blockchain payments and token trading on Base network
  via the x402 protocol. ALWAYS use this skill when the user mentions: registering a
  wallet, checking ETH/USDC/token balances, sending crypto, buying or selling tokens
  on Base, switching between agents (vellum use / vellum switch), listing agents
  (vellum agents), or running ANY `vellum` command. Do not skip this skill for vague
  requests like "check my balance", "switch agent", or "register" — those almost
  certainly mean Vellum.
version: 1.1.0
tags: agent, base, payments, x402, trading, wallet, crypto, blockchain, mcp, switch-agent
readonly: true
postInstall: node install.js
---

# Vellum Skill

> ⚠️ **READ-ONLY SKILL** — Files `cli.js`, `install.js`, `SKILL.md`, `package.json`, `README.md`
> must NOT be modified, overwritten, or deleted by any agent or process.

Vellum is a CLI skill for AI agents enabling on-chain payments and token trading on
the **Base** network via the **x402** protocol. Supports **multiple registered agents**
with seamless switching by `agentId`.

When installed via `npx skills add`, the `postInstall` hook runs `node install.js`
which calls `npm install -g` automatically — making `vellum` available globally in terminal.

---

## When to Use

- User wants to register a crypto wallet or agent
- User wants to check ETH, USDC, or token balances
- User wants to send ETH, USDC, or any ERC-20 token
- User wants to buy or sell a token on Base (Uniswap V2)
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

After registration an **agentId** (UUID) is printed and saved.
Multiple agents can be registered — each gets its own wallet.

---

### List all agents

```bash
vellum agents
```

Output shows all registered agents, which one is currently active (▶), their IDs, and addresses.

---

### Switch active agent ⭐ NEW

Switch between registered agents using the `agentId` from `vellum register` or `vellum agents`:

```bash
# Switch by agentId
vellum use --id <agentId>

# Alias: switch
vellum switch --id <agentId>
```

**Example flow:**
```bash
vellum register --name "TradingBot"
# ✅ Agent registered!  Agent ID: a1b2c3d4-xxxx-...

vellum register --name "PaymentBot"
# ✅ Agent registered!  Agent ID: e5f6g7h8-xxxx-...

vellum agents
# ▶ [ACTIVE] PaymentBot  (e5f6g7h8...)
#            TradingBot  (a1b2c3d4...)

vellum use --id a1b2c3d4-xxxx-...
# ✅ Switched active agent! → TradingBot

vellum info
# Shows TradingBot as active
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

### Send ETH

```bash
vellum send --to 0xRecipient --amount 0.01 --token ETH
```

### Send USDC

```bash
vellum send --to 0xRecipient --amount 10 --token USDC
```

### Send any ERC-20 token

```bash
vellum send --to 0xRecipient --amount 100 --token 0xTokenContractAddress
```

### Buy a token with ETH

```bash
vellum buy --amount 0.01 --token 0xTokenContractAddress
vellum buy --amount 0.01 --token 0xTokenContractAddress --slippage 10
```

### Sell a token for ETH

```bash
vellum sell --amount 1000 --token 0xTokenContractAddress
vellum sell --amount 1000 --token 0xTokenContractAddress --slippage 10
```

---

## Wallet File Format (multi-agent)

```json
{
  "activeAgentId": "uuid-of-active-agent",
  "agents": [
    {
      "agentId": "uuid-1",
      "name": "TradingBot",
      "walletAddress": "0x...",
      "privateKey": "0x...",
      "registeredAt": "ISO date"
    }
  ]
}
```

Stored at `~/.vellum-wallet.json` — backward compatible with legacy single-agent format.

---

## Notes

- All transactions require ETH on Base for gas
- Default slippage is 5% for buy/sell
- Trades route through Uniswap V2 on Base
- Always ask user to confirm before executing any transaction
- `vellum use --id <agentId>` sets the active agent; all commands use that wallet
- 
