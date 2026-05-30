#!/usr/bin/env node

/**
 * Vellum Agent Skill — cli.js
 * READ-ONLY: This file is protected. Do not modify, overwrite, or delete.
 * Owned by Vellum Finance. https://github.com/Vellum-finance/vellum-agent-skill
 */

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const BASE_RPC     = 'https://mainnet.base.org';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const UNIV2_ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const WALLET_FILE  = path.join(os.homedir(), '.vellum-wallet.json');

// ── ABIS ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
];

// ── PROVIDER ─────────────────────────────────────────────────────────────────
const makeProvider = () =>
  new ethers.JsonRpcProvider(BASE_RPC, { chainId: 8453, name: 'base' });

// ── WALLET FILE HELPERS ───────────────────────────────────────────────────────
const loadWalletData = () => {
  if (!fs.existsSync(WALLET_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8')); }
  catch { return null; }
};

const saveWalletData = (data) => {
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
};

/**
 * Returns the currently active agent's raw data object.
 * Supports both legacy single-agent format and new multi-agent format.
 */
const getActiveAgentData = () => {
  const data = loadWalletData();
  if (!data) return null;

  // Multi-agent format: pick by activeAgentId
  if (data.agents && data.activeAgentId) {
    const agent = data.agents.find(a => a.agentId === data.activeAgentId);
    if (agent) return agent;
  }

  // Legacy single-agent format: return root data directly
  if (data.privateKey) return data;

  return null;
};

/**
 * Returns an ethers.Wallet for the active agent, exits on error.
 */
const loadWallet = () => {
  const agent = getActiveAgentData();
  if (!agent) {
    console.error('\n❌ No wallet found. Run first:\n\n   vellum register --name "YourName"\n');
    process.exit(1);
  }
  if (!agent.privateKey) {
    console.error('\n❌ Wallet file corrupted. Run: vellum register --name "YourName" --force\n');
    process.exit(1);
  }
  return new ethers.Wallet(agent.privateKey, makeProvider());
};

// ── MISC HELPERS ──────────────────────────────────────────────────────────────
const prompt = (q) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
  });

const confirm = async (msg) => {
  const a = await prompt(`${msg} [y/N]: `);
  return a.toLowerCase() === 'y';
};

const short = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const withTimeout = (promise, ms = 10000, fallback = null) =>
  Promise.race([
    promise,
    new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);

// ── REGISTER ─────────────────────────────────────────────────────────────────
program
  .command('register')
  .description('Register a new agent and auto-create ETH wallet on Base')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description', '')
  .option('--force', 'Overwrite active agent (or add a new one)')
  .action(async (opts) => {
    const existing = loadWalletData();

    // Multi-agent: check if a same-name agent already exists
    if (existing && !opts.force) {
      const agents = existing.agents || [];
      const dup = agents.find(a => a.name.toLowerCase() === opts.name.toLowerCase());
      const legacyMatch = !existing.agents && existing.name?.toLowerCase() === opts.name.toLowerCase();

      if (dup || legacyMatch) {
        const agent = dup || existing;
        console.log('\n⚠️  An agent with this name already exists.\n');
        console.log(`  Agent ID : ${agent.agentId}`);
        console.log(`  Name     : ${agent.name}`);
        console.log(`  Address  : ${agent.walletAddress}`);
        console.log('\n  Use --force to create a new wallet for this name.\n');
        process.exit(0);
      }
    }

    const wallet  = ethers.Wallet.createRandom();
    const agentId = uuidv4();
    const newAgent = {
      agentId,
      name:          opts.name,
      description:   opts.description,
      walletAddress: wallet.address,
      privateKey:    wallet.privateKey,
      network:       'Base Mainnet',
      chainId:       8453,
      registeredAt:  new Date().toISOString(),
    };

    // Migrate legacy or build new multi-agent structure
    let fileData = existing || {};

    if (!fileData.agents) {
      // First registration or legacy migration
      if (fileData.agentId) {
        // Migrate legacy single agent into agents array
        fileData.agents = [{
          agentId:       fileData.agentId,
          name:          fileData.name || 'Agent',
          description:   fileData.description || '',
          walletAddress: fileData.walletAddress,
          privateKey:    fileData.privateKey,
          network:       fileData.network || 'Base Mainnet',
          chainId:       fileData.chainId || 8453,
          registeredAt:  fileData.registeredAt || new Date().toISOString(),
        }];
      } else {
        fileData.agents = [];
      }
    }

    // If --force on existing name, replace; otherwise push new
    const existingIdx = fileData.agents.findIndex(
      a => a.name.toLowerCase() === opts.name.toLowerCase()
    );
    if (opts.force && existingIdx >= 0) {
      fileData.agents[existingIdx] = newAgent;
    } else {
      fileData.agents.push(newAgent);
    }

    // Set new agent as active
    fileData.activeAgentId = agentId;
    // Keep legacy top-level fields pointing to active agent for backward compat
    fileData.agentId       = agentId;
    fileData.name          = opts.name;
    fileData.description   = opts.description;
    fileData.walletAddress = wallet.address;
    fileData.privateKey    = wallet.privateKey;
    fileData.network       = 'Base Mainnet';
    fileData.chainId       = 8453;
    fileData.registeredAt  = newAgent.registeredAt;

    saveWalletData(fileData);

    console.log('\n✅ Agent registered!\n');
    console.log(`  Agent ID   : ${agentId}`);
    console.log(`  Name       : ${opts.name}`);
    console.log(`  Address    : ${wallet.address}`);
    console.log(`  Saved to   : ${WALLET_FILE}`);
    console.log(`  Total agents stored: ${fileData.agents.length}`);
    console.log('\n  ⚠️  Send ETH on Base to this address before trading.');
    console.log(`  https://basescan.org/address/${wallet.address}\n`);
    console.log(`  💡 Switch agents anytime: vellum use --id <agentId>\n`);
  });

// ── INFO ──────────────────────────────────────────────────────────────────────
program
  .command('info')
  .description('Show currently active agent info')
  .action(() => {
    const root = loadWalletData();
    if (!root) {
      console.log('\n❌ No agent registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }
    const data = getActiveAgentData();
    const total = root.agents ? root.agents.length : 1;

    console.log('\n  ── Vellum Agent (Active) ────────────────');
    console.log(`  Agent ID   : ${data.agentId}`);
    console.log(`  Name       : ${data.name}`);
    console.log(`  Description: ${data.description || '—'}`);
    console.log(`  Address    : ${data.walletAddress}`);
    console.log(`  Network    : ${data.network || 'Base Mainnet'}`);
    console.log(`  Chain ID   : ${data.chainId || 8453}`);
    console.log(`  Registered : ${data.registeredAt}`);
    console.log(`  Wallet file: ${WALLET_FILE}`);
    console.log(`  Total agents: ${total}`);
    console.log(`  Explorer   : https://basescan.org/address/${data.walletAddress}`);
    console.log('  ─────────────────────────────────────────\n');
    if (total > 1) {
      console.log(`  💡 Run \`vellum agents\` to see all registered agents.\n`);
    }
  });

// ── AGENTS ────────────────────────────────────────────────────────────────────
program
  .command('agents')
  .description('List all registered agents')
  .action(() => {
    const root = loadWalletData();
    if (!root) {
      console.log('\n❌ No agents registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }

    // Normalise to array
    const agents = root.agents || [];
    if (agents.length === 0 && root.agentId) {
      agents.push({
        agentId: root.agentId,
        name: root.name || 'Agent',
        walletAddress: root.walletAddress,
        description: root.description || '',
        registeredAt: root.registeredAt || '—',
      });
    }

    const activeId = root.activeAgentId || root.agentId;

    console.log(`\n  ── Registered Agents (${agents.length}) ─────────────────`);
    for (const a of agents) {
      const isActive = a.agentId === activeId;
      const marker = isActive ? '▶ [ACTIVE]' : '          ';
      console.log(`\n  ${marker} ${a.name}`);
      console.log(`    ID      : ${a.agentId}`);
      console.log(`    Address : ${a.walletAddress}`);
      if (a.description) console.log(`    Desc    : ${a.description}`);
      console.log(`    Created : ${a.registeredAt || '—'}`);
    }
    console.log('\n  ─────────────────────────────────────────');
    console.log('  Switch with: vellum use --id <agentId>\n');
  });

// ── USE (switch agent) ────────────────────────────────────────────────────────
program
  .command('use')
  .description('Switch the active agent by agentId')
  .requiredOption('--id <agentId>', 'Agent ID to switch to (from `vellum register` or `vellum agents`)')
  .action((opts) => {
    const root = loadWalletData();
    if (!root) {
      console.log('\n❌ No agents registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }

    const agents = root.agents || [];
    // Also support legacy single-agent
    if (agents.length === 0 && root.agentId) {
      agents.push(root);
    }

    const target = agents.find(a => a.agentId === opts.id);
    if (!target) {
      console.error(`\n❌ No agent found with ID: ${opts.id}`);
      console.error('  Run `vellum agents` to list all registered agent IDs.\n');
      process.exit(1);
    }

    // Update active
    root.activeAgentId = opts.id;
    // Keep legacy top-level fields in sync
    root.agentId       = target.agentId;
    root.name          = target.name;
    root.description   = target.description;
    root.walletAddress = target.walletAddress;
    root.privateKey    = target.privateKey;
    root.network       = target.network || 'Base Mainnet';
    root.chainId       = target.chainId || 8453;

    saveWalletData(root);

    console.log('\n✅ Switched active agent!\n');
    console.log(`  Agent ID : ${target.agentId}`);
    console.log(`  Name     : ${target.name}`);
    console.log(`  Address  : ${target.walletAddress}`);
    console.log('\n  All vellum commands now use this agent\'s wallet.\n');
  });

// ── SWITCH (alias for use) ────────────────────────────────────────────────────
program
  .command('switch')
  .description('Alias for `vellum use` — switch active agent by agentId')
  .requiredOption('--id <agentId>', 'Agent ID to switch to')
  .action((opts) => {
    const root = loadWalletData();
    if (!root) {
      console.log('\n❌ No agents registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }

    const agents = root.agents || [];
    if (agents.length === 0 && root.agentId) agents.push(root);

    const target = agents.find(a => a.agentId === opts.id);
    if (!target) {
      console.error(`\n❌ No agent found with ID: ${opts.id}`);
      console.error('  Run `vellum agents` to list all registered agent IDs.\n');
      process.exit(1);
    }

    root.activeAgentId = opts.id;
    root.agentId       = target.agentId;
    root.name          = target.name;
    root.description   = target.description;
    root.walletAddress = target.walletAddress;
    root.privateKey    = target.privateKey;
    root.network       = target.network || 'Base Mainnet';
    root.chainId       = target.chainId || 8453;

    saveWalletData(root);

    console.log('\n✅ Switched active agent!\n');
    console.log(`  Agent ID : ${target.agentId}`);
    console.log(`  Name     : ${target.name}`);
    console.log(`  Address  : ${target.walletAddress}`);
    console.log('\n  All vellum commands now use this agent\'s wallet.\n');
  });

// ── BALANCE ───────────────────────────────────────────────────────────────────
program
  .command('balance')
  .description('Show wallet balances (ETH, USDC, optional token)')
  .option('--token <address>', 'Also check an ERC-20 token by contract address')
  .action(async (opts) => {
    const agent = getActiveAgentData();
    if (!agent) {
      console.log('\n❌ No agent registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }

    const provider = makeProvider();
    console.log(`\n  Agent   : ${agent.name}`);
    console.log(`  Address : ${agent.walletAddress}`);
    console.log(`  Network : Base Mainnet\n`);

    const ethBal = await withTimeout(provider.getBalance(agent.walletAddress), 8000);
    if (ethBal !== null) {
      console.log(`  ETH     : ${ethers.formatEther(ethBal)} ETH`);
    } else {
      console.log('  ETH     : ⚠️  Timeout (check your connection)');
    }

    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBal = await withTimeout(usdc.balanceOf(agent.walletAddress), 8000);
    if (usdcBal !== null) {
      console.log(`  USDC    : ${ethers.formatUnits(usdcBal, 6)} USDC`);
    } else {
      console.log('  USDC    : ⚠️  Timeout (check your connection)');
    }

    if (opts.token) {
      if (!ethers.isAddress(opts.token)) {
        console.log('  Token   : ❌ Invalid address');
      } else {
        const token = new ethers.Contract(opts.token, ERC20_ABI, provider);
        const [sym, dec, bal] = await Promise.all([
          withTimeout(token.symbol(), 8000, 'TOKEN'),
          withTimeout(token.decimals(), 8000, 18),
          withTimeout(token.balanceOf(agent.walletAddress), 8000, null),
        ]);
        if (bal !== null) {
          console.log(`  ${String(sym).padEnd(6)}  : ${ethers.formatUnits(bal, Number(dec))} ${sym}`);
        } else {
          console.log(`  Token   : ⚠️  Timeout fetching balance`);
        }
      }
    }

    console.log(`\n  Explorer: https://basescan.org/address/${agent.walletAddress}\n`);
    process.exit(0);
  });

// ── BUY ───────────────────────────────────────────────────────────────────────
program
  .command('buy')
  .description('Buy a token with ETH via Uniswap V2 on Base')
  .requiredOption('--amount <amount>', 'ETH amount to spend')
  .requiredOption('--token <address>', 'Token contract address to buy')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .action(async (opts) => {
    const wallet   = loadWallet();
    const provider = wallet.provider;
    const amountIn = ethers.parseEther(opts.amount);

    if (!ethers.isAddress(opts.token)) {
      console.error('\n❌ Invalid token address.\n'); process.exit(1);
    }

    let sym = 'TOKEN';
    try {
      const t = new ethers.Contract(opts.token, ERC20_ABI, provider);
      sym = await withTimeout(t.symbol(), 5000, 'TOKEN');
    } catch {}

    const router = new ethers.Contract(UNIV2_ROUTER, ROUTER_ABI, provider);
    const swapPath = [WETH_ADDRESS, opts.token];
    let amountOutMin = 0n;

    try {
      const amounts = await withTimeout(router.getAmountsOut(amountIn, swapPath), 8000);
      if (amounts) {
        const slipBps = BigInt(Math.floor(parseFloat(opts.slippage) * 100));
        amountOutMin  = amounts[1] * (10000n - slipBps) / 10000n;
        console.log(`\n  Quote     : ~${ethers.formatUnits(amounts[1], 18)} ${sym}`);
        console.log(`  Min out   : ${ethers.formatUnits(amountOutMin, 18)} ${sym} (${opts.slippage}% slippage)`);
      }
    } catch {
      console.log('\n  ⚠️  Quote unavailable — pool may not exist on Uniswap V2.');
    }

    console.log(`\n  Spending  : ${opts.amount} ETH`);
    console.log(`  Buying    : ${sym} (${opts.token})`);
    console.log(`  Wallet    : ${short(wallet.address)}\n`);

    const ok = await confirm('  Confirm buy?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    try {
      const r        = new ethers.Contract(UNIV2_ROUTER, ROUTER_ABI, wallet);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx       = await r.swapExactETHForTokens(
        amountOutMin, swapPath, wallet.address, deadline, { value: amountIn }
      );
      console.log(`\n  ⏳ Submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Buy successful! Block: ${receipt.blockNumber}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    } catch (e) {
      console.error(`\n  ❌ Failed: ${e.reason || e.shortMessage || e.message}\n`);
      process.exit(1);
    }
  });

// ── SELL ──────────────────────────────────────────────────────────────────────
program
  .command('sell')
  .description('Sell a token for ETH via Uniswap V2 on Base')
  .requiredOption('--amount <amount>', 'Token amount to sell')
  .requiredOption('--token <address>', 'Token contract address')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.token)) {
      console.error('\n❌ Invalid token address.\n'); process.exit(1);
    }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const token    = new ethers.Contract(opts.token, ERC20_ABI, wallet);

    const sym = await withTimeout(token.symbol(), 5000, 'TOKEN');
    const dec = Number(await withTimeout(token.decimals(), 5000, 18));
    const amountIn = ethers.parseUnits(opts.amount, dec);

    const tokenBal = await withTimeout(token.balanceOf(wallet.address), 8000);
    if (!tokenBal) {
      console.error('\n❌ Could not fetch token balance. Check connection.\n');
      process.exit(1);
    }
    if (tokenBal < amountIn) {
      console.error(`\n❌ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(tokenBal, dec)}\n  Need: ${opts.amount}\n`);
      process.exit(1);
    }

    const router   = new ethers.Contract(UNIV2_ROUTER, ROUTER_ABI, provider);
    const swapPath = [opts.token, WETH_ADDRESS];
    let amountOutMin = 0n;

    try {
      const amounts = await withTimeout(router.getAmountsOut(amountIn, swapPath), 8000);
      if (amounts) {
        const slipBps = BigInt(Math.floor(parseFloat(opts.slippage) * 100));
        amountOutMin  = amounts[1] * (10000n - slipBps) / 10000n;
        console.log(`\n  Quote    : ~${ethers.formatEther(amounts[1])} ETH`);
        console.log(`  Min out  : ${ethers.formatEther(amountOutMin)} ETH (${opts.slippage}% slippage)`);
      }
    } catch {
      console.log('\n  ⚠️  Quote unavailable.');
    }

    console.log(`\n  Selling  : ${opts.amount} ${sym}`);
    console.log(`  Token    : ${opts.token}`);
    console.log(`  Wallet   : ${short(wallet.address)}\n`);

    const ok = await confirm('  Confirm sell?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    try {
      const allowance = await withTimeout(token.allowance(wallet.address, UNIV2_ROUTER), 8000, 0n);
      if (allowance < amountIn) {
        console.log('  Approving router...');
        const appTx = await token.approve(UNIV2_ROUTER, ethers.MaxUint256);
        await appTx.wait();
        console.log('  ✅ Approved.');
      }

      const r        = new ethers.Contract(UNIV2_ROUTER, ROUTER_ABI, wallet);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx       = await r.swapExactTokensForETH(
        amountIn, amountOutMin, swapPath, wallet.address, deadline
      );
      console.log(`\n  ⏳ Submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Sell successful! Block: ${receipt.blockNumber}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    } catch (e) {
      console.error(`\n  ❌ Failed: ${e.reason || e.shortMessage || e.message}\n`);
      process.exit(1);
    }
  });

// ── SEND ──────────────────────────────────────────────────────────────────────
program
  .command('send')
  .description('Send ETH, USDC, or any ERC-20 token')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .requiredOption('--amount <amount>', 'Amount to send')
  .option('--token <address|ETH|USDC>', 'Asset: ETH, USDC, or contract address (default: ETH)', 'ETH')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.to)) {
      console.error('\n❌ Invalid recipient address.\n'); process.exit(1);
    }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const asset    = opts.token.toUpperCase();

    // ── ETH ──
    if (asset === 'ETH') {
      const amount = ethers.parseEther(opts.amount);
      const bal    = await withTimeout(provider.getBalance(wallet.address), 8000);
      if (!bal) { console.error('\n❌ RPC timeout.\n'); process.exit(1); }
      if (bal < amount) {
        console.error(`\n❌ Insufficient ETH.\n  Have: ${ethers.formatEther(bal)}\n  Need: ${opts.amount}\n`);
        process.exit(1);
      }
      console.log(`\n  Sending : ${opts.amount} ETH → ${opts.to}\n`);
      const ok = await confirm('  Confirm?');
      if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

      const tx = await wallet.sendTransaction({ to: opts.to, value: amount });
      console.log(`\n  ⏳ Submitted: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ Sent ${opts.amount} ETH → ${short(opts.to)}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
      process.exit(0);
    }

    // ── ERC-20 (USDC or custom) ──
    const tokenAddress = asset === 'USDC' ? USDC_ADDRESS : opts.token;
    if (!ethers.isAddress(tokenAddress)) {
      console.error('\n❌ Invalid token address.\n'); process.exit(1);
    }

    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const sym   = await withTimeout(token.symbol(), 5000, asset === 'USDC' ? 'USDC' : 'TOKEN');
    const dec   = Number(await withTimeout(token.decimals(), 5000, asset === 'USDC' ? 6 : 18));
    const amount = ethers.parseUnits(opts.amount, dec);
    const bal    = await withTimeout(token.balanceOf(wallet.address), 8000);

    if (!bal) { console.error('\n❌ RPC timeout.\n'); process.exit(1); }
    if (bal < amount) {
      console.error(`\n❌ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(bal, dec)}\n  Need: ${opts.amount}\n`);
      process.exit(1);
    }

    console.log(`\n  Sending : ${opts.amount} ${sym} → ${opts.to}\n`);
    const ok = await confirm('  Confirm?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    const tx = await token.transfer(opts.to, amount);
    console.log(`\n  ⏳ Submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Sent ${opts.amount} ${sym} → ${short(opts.to)}`);
    console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    process.exit(0);
  });

// ── META ──────────────────────────────────────────────────────────────────────
program
  .name('vellum')
  .description('Vellum Agent Skill — Payments & Trading on Base via x402')
  .version('1.1.0');

program.parse();
