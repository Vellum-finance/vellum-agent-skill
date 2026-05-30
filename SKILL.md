---
name: vellum
description: >
  Vellum Agent Skill â€” Execute blockchain payments and token trading on Base
  network via the x402 protocol. Use when the user wants to register a wallet,
  check balances, send ETH/USDC/tokens, or buy/sell tokens on Base.
version: 1.1.0
tags: agent, base, payments, x402, trading, wallet, crypto, blockchain, mcp
---

# Vellum Skill

Vellum is a CLI skill for AI agents that enables on-chain payments and token
trading on the **Base** network using the **x402** protocol.

## When to Use

- User wants to create or register a crypto wallet
- User wants to check ETH or token balances
- User wants to send ETH, USDC, or any ERC-20 token
- User wants to buy or sell a token on Base (Uniswap V2)
- User asks about blockchain payments on Base

---

## Commands

### Register agent & create wallet
```bash
vellum register --name "MyAgent"
vellum register --name "MyAgent" --description "Trading bot" --force
```

### Check balances
```bash
vellum balance
vellum balance --token 0xTokenAddress
```

### Show agent info
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

## Notes

- Wallet is stored at `~/.vellum-wallet.json` (persists across sessions)
- All transactions require ETH on Base for gas
- Default slippage is 5% for buy/sell
- Trades route through Uniswap V2 on Base
- Always ask user to confirm before executing any transaction
