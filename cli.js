#!/usr/bin/env node

/**
 * Vellum Agent Skill — cli.js  v1.2.0
 * READ-ONLY: This file is protected. Do not modify, overwrite, or delete.
 * Owned by Vellum Finance. https://github.com/Vellum-finance/vellum-agent-skill
 *
 * Supports Uniswap V2, V3, and V4 on Base Mainnet.
 * Auto-routing: tries V4 first (best liquidity), falls back to V3, then V2.
 * Use --dex v2|v3|v4 to force a specific router.
 */

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BASE_RPC      = 'https://mainnet.base.org';
const USDC_ADDRESS  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH_ADDRESS  = '0x4200000000000000000000000000000000000006';
const WALLET_FILE   = path.join(os.homedir(), '.vellum-wallet.json');

// ── ROUTER ADDRESSES (Base Mainnet — verified from docs.uniswap.org) ──────────
// Uniswap V2
const UNIV2_ROUTER  = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';

// Uniswap V3
const UNIV3_ROUTER  = '0x2626664c2603336E57B271c5C0b26F421741e481'; // SwapRouter02
const UNIV3_QUOTER  = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'; // QuoterV2
const UNIV3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';

// Uniswap V4
const UNIV4_POOL_MANAGER  = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const UNIV4_UNIVERSAL_ROUTER = '0x6fF5693b99212Da76ad316178A184AB56D299b43'; // handles V3+V4
const UNIV4_QUOTER        = '0x0d5e0f971ed27fbff6c2837bf31316121532048d';
const UNIV4_STATE_VIEW    = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
const PERMIT2             = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// ── ABIS ──────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// V2
const V2_ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
];

// V3 SwapRouter02
const V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
];

// V3 QuoterV2 — quoteExactInputSingle
const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// V3 Factory — getPool
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

// V4 Universal Router — execute(bytes commands, bytes[] inputs, uint256 deadline)
const V4_UNIVERSAL_ROUTER_ABI = [
  'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable',
];

// V4 Quoter — quoteExactInputSingle
const V4_QUOTER_ABI = [
  'function quoteExactInputSingle((address poolManager, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, uint160 sqrtPriceLimitX96, bytes hookData) params) external returns (uint256 amountOut, uint256 gasEstimate)',
];

// V4 StateView — getSlot0
const V4_STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)',
];

// ── COMMON V4 FEE TIERS & TICK SPACINGS ──────────────────────────────────────
// V4 uses same fee tiers as V3 but with dynamic tick spacings
const V4_FEE_TIERS = [
  { fee: 100,   tickSpacing: 1   },  // 0.01% — stable pairs
  { fee: 500,   tickSpacing: 10  },  // 0.05%
  { fee: 3000,  tickSpacing: 60  },  // 0.30% — default
  { fee: 10000, tickSpacing: 200 },  // 1.00% — exotic/meme tokens
];

// V3 fee tiers to probe
const V3_FEE_TIERS = [100, 500, 3000, 10000];

// ── UNIVERSAL ROUTER COMMANDS ─────────────────────────────────────────────────
// Commands byte values for the Universal Router
const COMMANDS = {
  V3_SWAP_EXACT_IN:  0x00,
  V4_SWAP:           0x10,
  WRAP_ETH:          0x0b,
  UNWRAP_WETH:       0x0c,
  SWEEP:             0x04,
};

// ── PROVIDER ──────────────────────────────────────────────────────────────────
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

const getActiveAgentData = () => {
  const data = loadWalletData();
  if (!data) return null;
  if (data.agents && data.activeAgentId) {
    const agent = data.agents.find(a => a.agentId === data.activeAgentId);
    if (agent) return agent;
  }
  if (data.privateKey) return data;
  return null;
};

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

// ── APPROVE HELPER ────────────────────────────────────────────────────────────
async function ensureApproval(tokenContract, spender, amount, wallet) {
  const allowance = await withTimeout(
    tokenContract.allowance(wallet.address, spender), 8000, 0n
  );
  if (allowance < amount) {
    console.log(`  Approving ${spender.slice(0,6)}... to spend tokens...`);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log('  ✅ Approved.');
  }
}

// ── V3: FIND BEST POOL FEE ────────────────────────────────────────────────────
async function findBestV3Fee(tokenA, tokenB, provider) {
  const factory = new ethers.Contract(UNIV3_FACTORY, V3_FACTORY_ABI, provider);
  for (const fee of V3_FEE_TIERS) {
    try {
      const pool = await withTimeout(factory.getPool(tokenA, tokenB, fee), 5000, ethers.ZeroAddress);
      if (pool && pool !== ethers.ZeroAddress) return fee;
    } catch {}
  }
  return null;
}

// ── V3: GET QUOTE ─────────────────────────────────────────────────────────────
async function getV3Quote(tokenIn, tokenOut, amountIn, fee, provider) {
  try {
    const quoter = new ethers.Contract(UNIV3_QUOTER, V3_QUOTER_ABI, provider);
    const result = await withTimeout(
      quoter.quoteExactInputSingle.staticCall({
        tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n
      }), 10000
    );
    if (result) return result[0]; // amountOut
  } catch {}
  return null;
}

// ── V4: COMPUTE POOL ID ───────────────────────────────────────────────────────
function computeV4PoolId(currency0, currency1, fee, tickSpacing, hooks = ethers.ZeroAddress) {
  // Sort currencies: lower address first (or address(0) for native ETH)
  const c0 = currency0.toLowerCase() < currency1.toLowerCase() ? currency0 : currency1;
  const c1 = currency0.toLowerCase() < currency1.toLowerCase() ? currency1 : currency0;
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [c0, c1, fee, tickSpacing, hooks]
    )
  );
}

// ── V4: FIND ACTIVE POOL ──────────────────────────────────────────────────────
async function findBestV4Pool(currency0, currency1, provider) {
  const stateView = new ethers.Contract(UNIV4_STATE_VIEW, V4_STATE_VIEW_ABI, provider);
  // Normalize: address(0) = native ETH in V4
  const c0 = currency0 === WETH_ADDRESS ? ethers.ZeroAddress : currency0;
  const c1 = currency1 === WETH_ADDRESS ? ethers.ZeroAddress : currency1;

  for (const tier of V4_FEE_TIERS) {
    try {
      const poolId = computeV4PoolId(c0, c1, tier.fee, tier.tickSpacing);
      const [slot0, liq] = await Promise.all([
        withTimeout(stateView.getSlot0(poolId), 5000, null),
        withTimeout(stateView.getLiquidity(poolId), 5000, null),
      ]);
      if (slot0 && slot0[0] !== 0n && liq && liq > 0n) {
        return { fee: tier.fee, tickSpacing: tier.tickSpacing, poolId, liquidity: liq };
      }
    } catch {}
  }
  return null;
}

// ── V4: GET QUOTE ─────────────────────────────────────────────────────────────
async function getV4Quote(currency0, currency1, amountIn, pool, provider) {
  try {
    const quoter = new ethers.Contract(UNIV4_QUOTER, V4_QUOTER_ABI, provider);
    // Determine zeroForOne: if sorted order means currency0 is being sold
    const c0Norm = currency0 === WETH_ADDRESS ? ethers.ZeroAddress : currency0;
    const c1Norm = currency1 === WETH_ADDRESS ? ethers.ZeroAddress : currency1;
    const [sorted0, sorted1] = c0Norm.toLowerCase() < c1Norm.toLowerCase()
      ? [c0Norm, c1Norm] : [c1Norm, c0Norm];
    const zeroForOne = c0Norm.toLowerCase() === sorted0.toLowerCase();

    const result = await withTimeout(
      quoter.quoteExactInputSingle.staticCall({
        poolManager: UNIV4_POOL_MANAGER,
        poolKey: {
          currency0: sorted0,
          currency1: sorted1,
          fee: pool.fee,
          tickSpacing: pool.tickSpacing,
          hooks: ethers.ZeroAddress,
        },
        zeroForOne,
        exactAmount: amountIn,
        sqrtPriceLimitX96: 0n,
        hookData: '0x',
      }), 10000
    );
    if (result) return result[0]; // amountOut
  } catch {}
  return null;
}

// ── AUTO ROUTER: find best DEX for a swap ─────────────────────────────────────
async function autoRoute(tokenIn, tokenOut, amountIn, provider, forceDex = null) {
  const results = [];

  // ── V4 ──
  if (!forceDex || forceDex === 'v4') {
    const pool = await findBestV4Pool(tokenIn, tokenOut, provider);
    if (pool) {
      const quote = await getV4Quote(tokenIn, tokenOut, amountIn, pool, provider);
      if (quote) results.push({ dex: 'v4', quote, pool, fee: pool.fee });
    }
  }

  // ── V3 ──
  if (!forceDex || forceDex === 'v3') {
    const fee = await findBestV3Fee(tokenIn, tokenOut, provider);
    if (fee !== null) {
      const quote = await getV3Quote(tokenIn, tokenOut, amountIn, fee, provider);
      if (quote) results.push({ dex: 'v3', quote, fee });
    }
  }

  // ── V2 ──
  if (!forceDex || forceDex === 'v2') {
    try {
      const router = new ethers.Contract(UNIV2_ROUTER, V2_ROUTER_ABI, provider);
      const amounts = await withTimeout(
        router.getAmountsOut(amountIn, [tokenIn, tokenOut]), 8000
      );
      if (amounts) results.push({ dex: 'v2', quote: amounts[1] });
    } catch {}
  }

  if (results.length === 0) return null;
  // Return best quote (highest amountOut)
  return results.sort((a, b) => (b.quote > a.quote ? 1 : -1))[0];
}

// ── EXECUTE V4 SWAP (ETH → TOKEN) ─────────────────────────────────────────────
async function executeV4BuySwap(wallet, tokenOut, amountIn, amountOutMin, pool) {
  const router = new ethers.Contract(UNIV4_UNIVERSAL_ROUTER, V4_UNIVERSAL_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 600;

  // V4 Universal Router: command 0x10 = V4_SWAP
  // currency0 = address(0) for native ETH in V4
  const tokenOutNorm = tokenOut === WETH_ADDRESS ? ethers.ZeroAddress : tokenOut;
  const [c0, c1] = ethers.ZeroAddress.toLowerCase() < tokenOutNorm.toLowerCase()
    ? [ethers.ZeroAddress, tokenOutNorm] : [tokenOutNorm, ethers.ZeroAddress];
  const zeroForOne = ethers.ZeroAddress.toLowerCase() === c0.toLowerCase();

  const poolKey = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [c0, c1, pool.fee, pool.tickSpacing, ethers.ZeroAddress]
  );

  const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'bytes'],
    [
      poolKey,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'int256', 'uint160', 'bytes'],
        [zeroForOne, amountIn, 0n, '0x']
      )
    ]
  );

  const actions = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'int256', 'uint256', 'address', 'bytes'],
    [
      0x06, // SWAP_EXACT_IN_SINGLE
      amountIn,
      amountOutMin,
      wallet.address,
      swapParams,
    ]
  );

  const commands = '0x10'; // V4_SWAP
  const inputs = [actions];

  const tx = await router.execute(commands, inputs, deadline, { value: amountIn });
  return tx;
}

// ── EXECUTE V4 SWAP (TOKEN → ETH) ─────────────────────────────────────────────
async function executeV4SellSwap(wallet, tokenIn, amountIn, amountOutMin, pool) {
  // Ensure Permit2 approval
  const token = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
  await ensureApproval(token, PERMIT2, amountIn, wallet);

  // Also approve UniversalRouter via Permit2 (simplified: direct approve)
  await ensureApproval(token, UNIV4_UNIVERSAL_ROUTER, amountIn, wallet);

  const router = new ethers.Contract(UNIV4_UNIVERSAL_ROUTER, V4_UNIVERSAL_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const tokenInNorm = tokenIn === WETH_ADDRESS ? ethers.ZeroAddress : tokenIn;
  const [c0, c1] = tokenInNorm.toLowerCase() < ethers.ZeroAddress.toLowerCase()
    ? [tokenInNorm, ethers.ZeroAddress] : [ethers.ZeroAddress, tokenInNorm];
  const zeroForOne = tokenInNorm.toLowerCase() === c0.toLowerCase();

  const poolKey = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [c0, c1, pool.fee, pool.tickSpacing, ethers.ZeroAddress]
  );

  const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'bytes'],
    [
      poolKey,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'int256', 'uint160', 'bytes'],
        [zeroForOne, amountIn, 0n, '0x']
      )
    ]
  );

  const actions = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'int256', 'uint256', 'address', 'bytes'],
    [0x06, amountIn, amountOutMin, wallet.address, swapParams]
  );

  const commands = '0x10';
  const inputs = [actions];
  const tx = await router.execute(commands, inputs, deadline);
  return tx;
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
program
  .command('register')
  .description('Register a new agent and auto-create ETH wallet on Base')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description', '')
  .option('--force', 'Overwrite active agent (or add a new one)')
  .action(async (opts) => {
    const existing = loadWalletData();
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
      agentId, name: opts.name, description: opts.description,
      walletAddress: wallet.address, privateKey: wallet.privateKey,
      network: 'Base Mainnet', chainId: 8453,
      registeredAt: new Date().toISOString(),
    };

    let fileData = existing || {};
    if (!fileData.agents) {
      fileData.agents = fileData.agentId ? [{
        agentId: fileData.agentId, name: fileData.name || 'Agent',
        description: fileData.description || '', walletAddress: fileData.walletAddress,
        privateKey: fileData.privateKey, network: fileData.network || 'Base Mainnet',
        chainId: fileData.chainId || 8453, registeredAt: fileData.registeredAt || new Date().toISOString(),
      }] : [];
    }

    const idx = fileData.agents.findIndex(a => a.name.toLowerCase() === opts.name.toLowerCase());
    if (opts.force && idx >= 0) fileData.agents[idx] = newAgent;
    else fileData.agents.push(newAgent);

    Object.assign(fileData, {
      activeAgentId: agentId, agentId, name: opts.name, description: opts.description,
      walletAddress: wallet.address, privateKey: wallet.privateKey,
      network: 'Base Mainnet', chainId: 8453, registeredAt: newAgent.registeredAt,
    });

    saveWalletData(fileData);
    console.log('\n✅ Agent registered!\n');
    console.log(`  Agent ID     : ${agentId}`);
    console.log(`  Name         : ${opts.name}`);
    console.log(`  Address      : ${wallet.address}`);
    console.log(`  Saved to     : ${WALLET_FILE}`);
    console.log(`  Total agents : ${fileData.agents.length}`);
    console.log('\n  ⚠️  Send ETH on Base to this address before trading.');
    console.log(`  https://basescan.org/address/${wallet.address}\n`);
    console.log('  💡 Supports Uniswap V2, V3, and V4 (auto-routing)');
    console.log('  💡 Switch agents: vellum use --id <agentId>\n');
  });

// ── INFO ──────────────────────────────────────────────────────────────────────
program
  .command('info')
  .description('Show currently active agent info')
  .action(() => {
    const root = loadWalletData();
    if (!root) { console.log('\n❌ No agent registered.\n\n  Run: vellum register --name "YourName"\n'); process.exit(1); }
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
    console.log(`  Total agents: ${total}`);
    console.log(`  DEX support: Uniswap V2 + V3 + V4 (auto-routing)`);
    console.log(`  Explorer   : https://basescan.org/address/${data.walletAddress}`);
    console.log('  ─────────────────────────────────────────\n');
    if (total > 1) console.log('  💡 Run `vellum agents` to see all registered agents.\n');
  });

// ── AGENTS ────────────────────────────────────────────────────────────────────
program
  .command('agents')
  .description('List all registered agents')
  .action(() => {
    const root = loadWalletData();
    if (!root) { console.log('\n❌ No agents registered.\n\n  Run: vellum register --name "YourName"\n'); process.exit(1); }
    const agents = root.agents || [];
    if (agents.length === 0 && root.agentId) {
      agents.push({ agentId: root.agentId, name: root.name || 'Agent', walletAddress: root.walletAddress, description: root.description || '', registeredAt: root.registeredAt || '—' });
    }
    const activeId = root.activeAgentId || root.agentId;
    console.log(`\n  ── Registered Agents (${agents.length}) ─────────────────`);
    for (const a of agents) {
      const marker = a.agentId === activeId ? '▶ [ACTIVE]' : '          ';
      console.log(`\n  ${marker} ${a.name}`);
      console.log(`    ID      : ${a.agentId}`);
      console.log(`    Address : ${a.walletAddress}`);
      if (a.description) console.log(`    Desc    : ${a.description}`);
      console.log(`    Created : ${a.registeredAt || '—'}`);
    }
    console.log('\n  ─────────────────────────────────────────');
    console.log('  Switch with: vellum use --id <agentId>\n');
  });

// ── USE ───────────────────────────────────────────────────────────────────────
program
  .command('use')
  .description('Switch the active agent by agentId')
  .requiredOption('--id <agentId>', 'Agent ID to switch to')
  .action((opts) => {
    const root = loadWalletData();
    if (!root) { console.log('\n❌ No agents registered.\n'); process.exit(1); }
    const agents = root.agents || [];
    if (agents.length === 0 && root.agentId) agents.push(root);
    const target = agents.find(a => a.agentId === opts.id);
    if (!target) { console.error(`\n❌ No agent found with ID: ${opts.id}\n  Run \`vellum agents\` to list IDs.\n`); process.exit(1); }
    Object.assign(root, {
      activeAgentId: opts.id, agentId: target.agentId, name: target.name,
      description: target.description, walletAddress: target.walletAddress,
      privateKey: target.privateKey, network: target.network || 'Base Mainnet', chainId: target.chainId || 8453,
    });
    saveWalletData(root);
    console.log(`\n✅ Switched to: ${target.name}\n  ID: ${target.agentId}\n  Address: ${target.walletAddress}\n`);
  });

// ── SWITCH (alias) ────────────────────────────────────────────────────────────
program
  .command('switch')
  .description('Alias for `vellum use` — switch active agent by agentId')
  .requiredOption('--id <agentId>', 'Agent ID to switch to')
  .action((opts) => {
    const root = loadWalletData();
    if (!root) { console.log('\n❌ No agents registered.\n'); process.exit(1); }
    const agents = root.agents || [];
    if (agents.length === 0 && root.agentId) agents.push(root);
    const target = agents.find(a => a.agentId === opts.id);
    if (!target) { console.error(`\n❌ No agent found with ID: ${opts.id}\n`); process.exit(1); }
    Object.assign(root, {
      activeAgentId: opts.id, agentId: target.agentId, name: target.name,
      description: target.description, walletAddress: target.walletAddress,
      privateKey: target.privateKey, network: target.network || 'Base Mainnet', chainId: target.chainId || 8453,
    });
    saveWalletData(root);
    console.log(`\n✅ Switched to: ${target.name}\n  ID: ${target.agentId}\n  Address: ${target.walletAddress}\n`);
  });

// ── BALANCE ───────────────────────────────────────────────────────────────────
program
  .command('balance')
  .description('Show wallet balances (ETH, USDC, optional token)')
  .option('--token <address>', 'Also check an ERC-20 token by contract address')
  .action(async (opts) => {
    const agent = getActiveAgentData();
    if (!agent) { console.log('\n❌ No agent registered.\n\n  Run: vellum register --name "YourName"\n'); process.exit(1); }
    const provider = makeProvider();
    console.log(`\n  Agent   : ${agent.name}\n  Address : ${agent.walletAddress}\n  Network : Base Mainnet\n`);
    const ethBal = await withTimeout(provider.getBalance(agent.walletAddress), 8000);
    console.log(ethBal !== null ? `  ETH     : ${ethers.formatEther(ethBal)} ETH` : '  ETH     : ⚠️  Timeout');
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBal = await withTimeout(usdc.balanceOf(agent.walletAddress), 8000);
    console.log(usdcBal !== null ? `  USDC    : ${ethers.formatUnits(usdcBal, 6)} USDC` : '  USDC    : ⚠️  Timeout');
    if (opts.token) {
      if (!ethers.isAddress(opts.token)) { console.log('  Token   : ❌ Invalid address'); }
      else {
        const token = new ethers.Contract(opts.token, ERC20_ABI, provider);
        const [sym, dec, bal] = await Promise.all([
          withTimeout(token.symbol(), 8000, 'TOKEN'), withTimeout(token.decimals(), 8000, 18),
          withTimeout(token.balanceOf(agent.walletAddress), 8000, null),
        ]);
        console.log(bal !== null ? `  ${String(sym).padEnd(6)}  : ${ethers.formatUnits(bal, Number(dec))} ${sym}` : '  Token   : ⚠️  Timeout');
      }
    }
    console.log(`\n  Explorer: https://basescan.org/address/${agent.walletAddress}\n`);
    process.exit(0);
  });

// ── BUY ───────────────────────────────────────────────────────────────────────
program
  .command('buy')
  .description('Buy a token with ETH — auto-routes V4 → V3 → V2 for best price')
  .requiredOption('--amount <amount>', 'ETH amount to spend')
  .requiredOption('--token <address>', 'Token contract address to buy')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .option('--dex <v2|v3|v4>', 'Force specific DEX (default: auto — best price)')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.token)) { console.error('\n❌ Invalid token address.\n'); process.exit(1); }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const amountIn = ethers.parseEther(opts.amount);
    const forceDex = opts.dex?.toLowerCase() || null;

    // Validate --dex flag
    if (forceDex && !['v2','v3','v4'].includes(forceDex)) {
      console.error('\n❌ --dex must be v2, v3, or v4\n'); process.exit(1);
    }

    let sym = 'TOKEN', dec = 18;
    try {
      const t = new ethers.Contract(opts.token, ERC20_ABI, provider);
      [sym, dec] = await Promise.all([
        withTimeout(t.symbol(), 5000, 'TOKEN'),
        withTimeout(t.decimals(), 5000, 18).then(Number),
      ]);
    } catch {}

    console.log(`\n  🔍 Finding best price for ${sym}${forceDex ? ` (forced: ${forceDex.toUpperCase()})` : ' (auto-routing V4→V3→V2)'}...\n`);

    const best = await autoRoute(WETH_ADDRESS, opts.token, amountIn, provider, forceDex);
    if (!best) {
      console.error(`\n❌ No liquidity found on any DEX for this token.\n  Check the token address or try a different amount.\n`);
      process.exit(1);
    }

    const slipBps = BigInt(Math.floor(parseFloat(opts.slippage) * 100));
    const amountOutMin = best.quote * (10000n - slipBps) / 10000n;

    console.log(`  Best route : Uniswap ${best.dex.toUpperCase()}${best.fee ? ` (fee: ${best.fee/10000}%)` : ''}`);
    console.log(`  Quote      : ~${ethers.formatUnits(best.quote, dec)} ${sym}`);
    console.log(`  Min out    : ${ethers.formatUnits(amountOutMin, dec)} ${sym} (${opts.slippage}% slippage)`);
    console.log(`  Spending   : ${opts.amount} ETH`);
    console.log(`  Wallet     : ${short(wallet.address)}\n`);

    const ok = await confirm('  Confirm buy?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    try {
      let tx;
      if (best.dex === 'v4') {
        tx = await executeV4BuySwap(wallet, opts.token, amountIn, amountOutMin, best.pool);
      } else if (best.dex === 'v3') {
        const router = new ethers.Contract(UNIV3_ROUTER, V3_ROUTER_ABI, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600;
        tx = await router.exactInputSingle({
          tokenIn: WETH_ADDRESS, tokenOut: opts.token, fee: best.fee,
          recipient: wallet.address, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n,
        }, { value: amountIn });
      } else {
        const router = new ethers.Contract(UNIV2_ROUTER, V2_ROUTER_ABI, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600;
        tx = await router.swapExactETHForTokens(amountOutMin, [WETH_ADDRESS, opts.token], wallet.address, deadline, { value: amountIn });
      }

      console.log(`\n  ⏳ Submitted (${best.dex.toUpperCase()}): ${tx.hash}`);
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
  .description('Sell a token for ETH — auto-routes V4 → V3 → V2 for best price')
  .requiredOption('--amount <amount>', 'Token amount to sell')
  .requiredOption('--token <address>', 'Token contract address')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .option('--dex <v2|v3|v4>', 'Force specific DEX (default: auto — best price)')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.token)) { console.error('\n❌ Invalid token address.\n'); process.exit(1); }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const forceDex = opts.dex?.toLowerCase() || null;

    if (forceDex && !['v2','v3','v4'].includes(forceDex)) {
      console.error('\n❌ --dex must be v2, v3, or v4\n'); process.exit(1);
    }

    const token = new ethers.Contract(opts.token, ERC20_ABI, wallet);
    const sym = await withTimeout(token.symbol(), 5000, 'TOKEN');
    const dec = Number(await withTimeout(token.decimals(), 5000, 18));
    const amountIn = ethers.parseUnits(opts.amount, dec);

    const tokenBal = await withTimeout(token.balanceOf(wallet.address), 8000);
    if (!tokenBal) { console.error('\n❌ Could not fetch token balance.\n'); process.exit(1); }
    if (tokenBal < amountIn) {
      console.error(`\n❌ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(tokenBal, dec)}\n  Need: ${opts.amount}\n`);
      process.exit(1);
    }

    console.log(`\n  🔍 Finding best price${forceDex ? ` (forced: ${forceDex.toUpperCase()})` : ' (auto-routing V4→V3→V2)'}...\n`);
    const best = await autoRoute(opts.token, WETH_ADDRESS, amountIn, provider, forceDex);
    if (!best) {
      console.error(`\n❌ No liquidity found for ${sym} on any DEX.\n`);
      process.exit(1);
    }

    const slipBps = BigInt(Math.floor(parseFloat(opts.slippage) * 100));
    const amountOutMin = best.quote * (10000n - slipBps) / 10000n;

    console.log(`  Best route : Uniswap ${best.dex.toUpperCase()}${best.fee ? ` (fee: ${best.fee/10000}%)` : ''}`);
    console.log(`  Quote      : ~${ethers.formatEther(best.quote)} ETH`);
    console.log(`  Min out    : ${ethers.formatEther(amountOutMin)} ETH (${opts.slippage}% slippage)`);
    console.log(`  Selling    : ${opts.amount} ${sym}`);
    console.log(`  Wallet     : ${short(wallet.address)}\n`);

    const ok = await confirm('  Confirm sell?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    try {
      let tx;
      if (best.dex === 'v4') {
        tx = await executeV4SellSwap(wallet, opts.token, amountIn, amountOutMin, best.pool);
      } else if (best.dex === 'v3') {
        await ensureApproval(token, UNIV3_ROUTER, amountIn, wallet);
        const router = new ethers.Contract(UNIV3_ROUTER, V3_ROUTER_ABI, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600;
        tx = await router.exactInputSingle({
          tokenIn: opts.token, tokenOut: WETH_ADDRESS, fee: best.fee,
          recipient: wallet.address, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n,
        });
      } else {
        await ensureApproval(token, UNIV2_ROUTER, amountIn, wallet);
        const router = new ethers.Contract(UNIV2_ROUTER, V2_ROUTER_ABI, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600;
        tx = await router.swapExactTokensForETH(amountIn, amountOutMin, [opts.token, WETH_ADDRESS], wallet.address, deadline);
      }

      console.log(`\n  ⏳ Submitted (${best.dex.toUpperCase()}): ${tx.hash}`);
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
    if (!ethers.isAddress(opts.to)) { console.error('\n❌ Invalid recipient address.\n'); process.exit(1); }
    const wallet   = loadWallet();
    const provider = wallet.provider;
    const asset    = opts.token.toUpperCase();

    if (asset === 'ETH') {
      const amount = ethers.parseEther(opts.amount);
      const bal    = await withTimeout(provider.getBalance(wallet.address), 8000);
      if (!bal) { console.error('\n❌ RPC timeout.\n'); process.exit(1); }
      if (bal < amount) { console.error(`\n❌ Insufficient ETH.\n  Have: ${ethers.formatEther(bal)}\n  Need: ${opts.amount}\n`); process.exit(1); }
      console.log(`\n  Sending : ${opts.amount} ETH → ${opts.to}\n`);
      if (!await confirm('  Confirm?')) { console.log('\n  Cancelled.\n'); process.exit(0); }
      const tx = await wallet.sendTransaction({ to: opts.to, value: amount });
      console.log(`\n  ⏳ Submitted: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ Sent ${opts.amount} ETH → ${short(opts.to)}\n  https://basescan.org/tx/${tx.hash}\n`);
      process.exit(0);
    }

    const tokenAddress = asset === 'USDC' ? USDC_ADDRESS : opts.token;
    if (!ethers.isAddress(tokenAddress)) { console.error('\n❌ Invalid token address.\n'); process.exit(1); }
    const token  = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const sym    = await withTimeout(token.symbol(), 5000, asset === 'USDC' ? 'USDC' : 'TOKEN');
    const dec    = Number(await withTimeout(token.decimals(), 5000, asset === 'USDC' ? 6 : 18));
    const amount = ethers.parseUnits(opts.amount, dec);
    const bal    = await withTimeout(token.balanceOf(wallet.address), 8000);
    if (!bal) { console.error('\n❌ RPC timeout.\n'); process.exit(1); }
    if (bal < amount) { console.error(`\n❌ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(bal, dec)}\n  Need: ${opts.amount}\n`); process.exit(1); }
    console.log(`\n  Sending : ${opts.amount} ${sym} → ${opts.to}\n`);
    if (!await confirm('  Confirm?')) { console.log('\n  Cancelled.\n'); process.exit(0); }
    const tx = await token.transfer(opts.to, amount);
    console.log(`\n  ⏳ Submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Sent ${opts.amount} ${sym} → ${short(opts.to)}\n  https://basescan.org/tx/${tx.hash}\n`);
    process.exit(0);
  });

// ── META ──────────────────────────────────────────────────────────────────────
program
  .name('vellum')
  .description('Vellum Agent Skill — Payments & Trading on Base (V2 + V3 + V4 auto-routing)')
  .version('1.2.0');

program.parse();
