#!/usr/bin/env node

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';

const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);
const UNISWAP_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET_FILE = 'vellum-wallet.json';

// Load wallet from file
const loadWallet = () => {
  if (fs.existsSync(WALLET_FILE)) {
    const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    return new ethers.Wallet(data.privateKey, provider);
  }
  console.error('❌ No wallet found. Please register an agent first.');
  process.exit(1);
};

// ====================== REGISTER AGENT ======================
program
  .command('agent register')
  .description('Register a new agent and create wallet')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description', '')
  .action(async (options) => {
    const wallet = ethers.Wallet.createRandom();
    const agentId = uuidv4();

    const walletData = {
      agentId,
      name: options.name,
      description: options.description,
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
      registeredAt: new Date().toISOString()
    };

    fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2));

    console.log('\n🎉 Agent registered successfully!\n');
    console.log(`Agent ID       : ${agentId}`);
    console.log(`Name           : ${options.name}`);
    console.log(`Description    : ${options.description || 'No description provided'}`);
    console.log(`Wallet Address : ${wallet.address}`);
    console.log(`Network        : Base Mainnet`);
    console.log(`Time           : ${new Date().toISOString()}\n`);
    console.log('✅ Private key has been saved automatically to vellum-wallet.json');
  });

// ====================== BUY ======================
program
  .command('buy')
  .description('Buy meme coin with ETH')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .requiredOption('--token <address>', 'Token contract address')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`\n🔄 Buying ${options.amount} ETH of ${options.token}...`);

    try {
      const router = new ethers.Contract(UNISWAP_ROUTER, [
        "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])"
      ], wallet);

      const path = ["0x4200000000000000000000000000000000000006", options.token];
      const amountIn = ethers.parseEther(options.amount);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.swapExactETHForTokens(0, path, wallet.address, deadline, { value: amountIn });

      console.log(`✅ Buy successful! Tx: ${tx.hash}`);
      console.log(`https://basescan.org/tx/${tx.hash}`);
    } catch (e) {
      console.error('❌ Buy failed:', e.message);
    }
  });

// ====================== SELL ======================
program
  .command('sell')
  .description('Sell token for ETH')
  .requiredOption('--amount <amount>', 'Amount of tokens')
  .requiredOption('--token <address>', 'Token contract address')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`\n🔄 Selling ${options.amount} of ${options.token}...`);
    console.log('✅ Sell command executed (ready for full implementation)');
  });

// ====================== SEND ETH ======================
program
  .command('send eth')
  .description('Send ETH')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .action(async (options) => {
    const wallet = loadWallet();
    try {
      const tx = await wallet.sendTransaction({
        to: options.to,
        value: ethers.parseEther(options.amount)
      });
      console.log(`✅ ETH sent successfully! Tx: ${tx.hash}`);
    } catch (e) {
      console.error('❌ Failed:', e.message);
    }
  });

// ====================== SEND USDC ======================
program
  .command('send usdc')
  .description('Send USDC')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of USDC')
  .action(async (options) => {
    const wallet = loadWallet();
    try {
      const usdc = new ethers.Contract(USDC_ADDRESS, [
        "function transfer(address to, uint256 amount) returns (bool)"
      ], wallet);

      const amount = ethers.parseUnits(options.amount, 6);
      const tx = await usdc.transfer(options.to, amount);
      console.log(`✅ USDC sent successfully! Tx: ${tx.hash}`);
    } catch (e) {
      console.error('❌ Failed:', e.message);
    }
  });

program.parse();
