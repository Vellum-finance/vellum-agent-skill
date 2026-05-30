#!/usr/bin/env node

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

// â”€â”€ CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BASE_RPC     = 'https://mainnet.base.org';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const UNIV2_ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const WALLET_FILE  = path.join(os.homedir(), '.vellum-wallet.json');

// â”€â”€ ABIS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ PROVIDER (no retry loop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const makeProvider = () =>
  new ethers.JsonRpcProvider(BASE_RPC, {
    chainId: 8453,
    name: 'base',
  });

// â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const loadWalletData = () => {
  if (!fs.existsSync(WALLET_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8')); }
  catch { return null; }
};

const loadWallet = () => {
  const data = loadWalletData();
  if (!data) {
    console.error('\nâŒ No wallet found. Run first:\n\n   vellum register --name "YourName"\n');
    process.exit(1);
  }
  if (!data.privateKey) {
    console.error('\nâŒ Wallet file corrupted. Run: vellum register --name "YourName" --force\n');
    process.exit(1);
  }
  return new ethers.Wallet(data.privateKey, makeProvider());
};

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

// â”€â”€ REGISTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('register')
  .description('Register agent and auto-create ETH wallet on Base')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description', '')
  .option('--force', 'Overwrite existing wallet')
  .action(async (opts) => {
    const existing = loadWalletData();
    if (existing && !opts.force) {
      console.log('\nâš ï¸  Wallet already exists.\n');
      console.log(`  Agent   : ${existing.name}`);
      console.log(`  Address : ${existing.walletAddress}`);
      console.log('\n  Use --force to overwrite.\n');
      process.exit(0);
    }

    const wallet  = ethers.Wallet.createRandom();
    const agentId = uuidv4();
    const data    = {
      agentId,
      name:          opts.name,
      description:   opts.description,
      walletAddress: wallet.address,
      privateKey:    wallet.privateKey,
      network:       'Base Mainnet',
      chainId:       8453,
      registeredAt:  new Date().toISOString(),
    };

    fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });

    console.log('\nâœ… Agent registered!\n');
    console.log(`  Agent ID   : ${agentId}`);
    console.log(`  Name       : ${opts.name}`);
    console.log(`  Address    : ${wallet.address}`);
    console.log(`  Saved to   : ${WALLET_FILE}`);
    console.log('\n  âš ï¸  Send ETH on Base to this address before trading.\n');
    console.log(`  https://basescan.org/address/${wallet.address}\n`);
  });

// â”€â”€ INFO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('info')
  .description('Show registered agent info')
  .action(() => {
    const data = loadWalletData();
    if (!data) {
      console.log('\nâŒ No agent registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }
    console.log('\n  â”€â”€ Vellum Agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
    console.log(`  Agent ID   : ${data.agentId}`);
    console.log(`  Name       : ${data.name}`);
    console.log(`  Description: ${data.description || 'â€”'}`);
    console.log(`  Address    : ${data.walletAddress}`);
    console.log(`  Network    : ${data.network || 'Base Mainnet'}`);
    console.log(`  Chain ID   : ${data.chainId || 8453}`);
    console.log(`  Registered : ${data.registeredAt}`);
    console.log(`  Wallet file: ${WALLET_FILE}`);
    console.log(`  Explorer   : https://basescan.org/address/${data.walletAddress}`);
    console.log('  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
  });

// â”€â”€ BALANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('balance')
  .description('Show wallet balances (ETH, USDC, optional token)')
  .option('--token <address>', 'Also check an ERC-20 token by contract address')
  .action(async (opts) => {
    const data = loadWalletData();
    if (!data) {
      console.log('\nâŒ No agent registered.\n\n  Run: vellum register --name "YourName"\n');
      process.exit(1);
    }

    const provider = makeProvider();
    console.log(`\n  Agent   : ${data.name}`);
    console.log(`  Address : ${data.walletAddress}`);
    console.log(`  Network : Base Mainnet\n`);

    const ethBal = await withTimeout(
      provider.getBalance(data.walletAddress), 8000
    );
    if (ethBal !== null) {
      console.log(`  ETH     : ${ethers.formatEther(ethBal)} ETH`);
    } else {
      console.log('  ETH     : âš ï¸  Timeout (check your connection)');
    }

    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBal = await withTimeout(usdc.balanceOf(data.walletAddress), 8000);
    if (usdcBal !== null) {
      console.log(`  USDC    : ${ethers.formatUnits(usdcBal, 6)} USDC`);
    } else {
      console.log('  USDC    : âš ï¸  Timeout (check your connection)');
    }

    if (opts.token) {
      if (!ethers.isAddress(opts.token)) {
        console.log('  Token   : âŒ Invalid address');
      } else {
        const token = new ethers.Contract(opts.token, ERC20_ABI, provider);
        const [sym, dec, bal] = await Promise.all([
          withTimeout(token.symbol(), 8000, 'TOKEN'),
          withTimeout(token.decimals(), 8000, 18),
          withTimeout(token.balanceOf(data.walletAddress), 8000, null),
        ]);
        if (bal !== null) {
          console.log(`  ${String(sym).padEnd(6)}  : ${ethers.formatUnits(bal, Number(dec))} ${sym}`);
        } else {
          console.log(`  Token   : âš ï¸  Timeout fetching balance`);
        }
      }
    }

    console.log(`\n  Explorer: https://basescan.org/address/${data.walletAddress}\n`);
    process.exit(0);
  });

// â”€â”€ BUY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('buy')
  .description('Buy a token with ETH via Uniswap V2 on Base')
  .requiredOption('--amount <eth>', 'ETH amount to spend (e.g. 0.01)')
  .requiredOption('--token <address>', 'Token contract address to buy')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .action(async (opts) => {
    const wallet   = loadWallet();
    const provider = wallet.provider;
    const amountIn = ethers.parseEther(opts.amount);

    const ethBal = await withTimeout(provider.getBalance(wallet.address), 8000);
    if (ethBal === null) {
      console.error('\nâŒ Could not connect to Base RPC. Check your internet.\n');
      process.exit(1);
    }
    if (ethBal < amountIn) {
      console.error(`\nâŒ Insufficient ETH.\n  Have: ${ethers.formatEther(ethBal)} ETH\n  Need: ${opts.amount} ETH\n`);
      process.exit(1);
    }

    if (!ethers.isAddress(opts.token)) {
      console.error('\nâŒ Invalid token address.\n'); process.exit(1);
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
      console.log('\n  âš ï¸  Quote unavailable â€” pool may not exist on Uniswap V2.');
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
      console.log(`\n  â³ Submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  âœ… Buy successful! Block: ${receipt.blockNumber}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    } catch (e) {
      console.error(`\n  âŒ Failed: ${e.reason || e.shortMessage || e.message}\n`);
      process.exit(1);
    }
  });

// â”€â”€ SELL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('sell')
  .description('Sell a token for ETH via Uniswap V2 on Base')
  .requiredOption('--amount <amount>', 'Token amount to sell')
  .requiredOption('--token <address>', 'Token contract address')
  .option('--slippage <percent>', 'Slippage tolerance % (default: 5)', '5')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.token)) {
      console.error('\nâŒ Invalid token address.\n'); process.exit(1);
    }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const token    = new ethers.Contract(opts.token, ERC20_ABI, wallet);

    const sym = await withTimeout(token.symbol(), 5000, 'TOKEN');
    const dec = Number(await withTimeout(token.decimals(), 5000, 18));
    const amountIn = ethers.parseUnits(opts.amount, dec);

    const tokenBal = await withTimeout(token.balanceOf(wallet.address), 8000);
    if (!tokenBal) {
      console.error('\nâŒ Could not fetch token balance. Check connection.\n');
      process.exit(1);
    }
    if (tokenBal < amountIn) {
      console.error(`\nâŒ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(tokenBal, dec)}\n  Need: ${opts.amount}\n`);
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
      console.log('\n  âš ï¸  Quote unavailable.');
    }

    console.log(`\n  Selling  : ${opts.amount} ${sym}`);
    console.log(`  Token    : ${opts.token}`);
    console.log(`  Wallet   : ${short(wallet.address)}\n`);

    const ok = await confirm('  Confirm sell?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    try {
      // approve if needed
      const allowance = await withTimeout(token.allowance(wallet.address, UNIV2_ROUTER), 8000, 0n);
      if (allowance < amountIn) {
        console.log('  Approving router...');
        const appTx = await token.approve(UNIV2_ROUTER, ethers.MaxUint256);
        await appTx.wait();
        console.log('  âœ… Approved.');
      }

      const r        = new ethers.Contract(UNIV2_ROUTER, ROUTER_ABI, wallet);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx       = await r.swapExactTokensForETH(
        amountIn, amountOutMin, swapPath, wallet.address, deadline
      );
      console.log(`\n  â³ Submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  âœ… Sell successful! Block: ${receipt.blockNumber}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    } catch (e) {
      console.error(`\n  âŒ Failed: ${e.reason || e.shortMessage || e.message}\n`);
      process.exit(1);
    }
  });

// â”€â”€ SEND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .command('send')
  .description('Send ETH, USDC, or any ERC-20 token')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .requiredOption('--amount <amount>', 'Amount to send')
  .option('--token <address|ETH|USDC>', 'Asset: ETH, USDC, or contract address (default: ETH)', 'ETH')
  .action(async (opts) => {
    if (!ethers.isAddress(opts.to)) {
      console.error('\nâŒ Invalid recipient address.\n'); process.exit(1);
    }

    const wallet   = loadWallet();
    const provider = wallet.provider;
    const asset    = opts.token.toUpperCase();

    // â”€â”€ ETH â”€â”€
    if (asset === 'ETH') {
      const amount = ethers.parseEther(opts.amount);
      const bal    = await withTimeout(provider.getBalance(wallet.address), 8000);
      if (!bal) { console.error('\nâŒ RPC timeout.\n'); process.exit(1); }
      if (bal < amount) {
        console.error(`\nâŒ Insufficient ETH.\n  Have: ${ethers.formatEther(bal)}\n  Need: ${opts.amount}\n`);
        process.exit(1);
      }
      console.log(`\n  Sending : ${opts.amount} ETH â†’ ${opts.to}\n`);
      const ok = await confirm('  Confirm?');
      if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

      const tx = await wallet.sendTransaction({ to: opts.to, value: amount });
      console.log(`\n  â³ Submitted: ${tx.hash}`);
      await tx.wait();
      console.log(`  âœ… Sent ${opts.amount} ETH â†’ ${short(opts.to)}`);
      console.log(`  https://basescan.org/tx/${tx.hash}\n`);
      process.exit(0);
    }

    // â”€â”€ ERC-20 (USDC or custom) â”€â”€
    const tokenAddress = asset === 'USDC' ? USDC_ADDRESS : opts.token;
    if (!ethers.isAddress(tokenAddress)) {
      console.error('\nâŒ Invalid token address.\n'); process.exit(1);
    }

    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const sym   = await withTimeout(token.symbol(), 5000, asset === 'USDC' ? 'USDC' : 'TOKEN');
    const dec   = Number(await withTimeout(token.decimals(), 5000, asset === 'USDC' ? 6 : 18));
    const amount = ethers.parseUnits(opts.amount, dec);
    const bal    = await withTimeout(token.balanceOf(wallet.address), 8000);

    if (!bal) { console.error('\nâŒ RPC timeout.\n'); process.exit(1); }
    if (bal < amount) {
      console.error(`\nâŒ Insufficient ${sym}.\n  Have: ${ethers.formatUnits(bal, dec)}\n  Need: ${opts.amount}\n`);
      process.exit(1);
    }

    console.log(`\n  Sending : ${opts.amount} ${sym} â†’ ${opts.to}\n`);
    const ok = await confirm('  Confirm?');
    if (!ok) { console.log('\n  Cancelled.\n'); process.exit(0); }

    const tx = await token.transfer(opts.to, amount);
    console.log(`\n  â³ Submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`  âœ… Sent ${opts.amount} ${sym} â†’ ${short(opts.to)}`);
    console.log(`  https://basescan.org/tx/${tx.hash}\n`);
    process.exit(0);
  });

// â”€â”€ META â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
program
  .name('vellum')
  .description('Vellum Agent Skill â€” Payments & Trading on Base via x402')
  .version('1.1.0');

program.parse();
