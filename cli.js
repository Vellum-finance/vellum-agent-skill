#!/usr/bin/env node

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';

const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);
const UNISWAP_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

program
  .name('vellum')
  .description('Vellum Agent Management & Base Trading Skill')
  .version('1.0.0');

// ====================== REGISTER AGENT ======================
program
  .command('agent register')
  .description('Register a new agent and create wallet')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description', '')
  .action(async (options) => {
    const wallet = ethers.Wallet.createRandom();
    const agentId = uuidv4();

    console.log('\n🎉 Agent registered successfully!\n');
    console.log(`Agent ID       : ${agentId}`);
    console.log(`Name           : ${options.name}`);
    console.log(`Description    : ${options.description || 'No description provided'}`);
    console.log(`Wallet Address : ${wallet.address}`);
    console.log(`Private Key    : ${wallet.privateKey}`);
    console.log(`Network        : Base Mainnet`);
    console.log(`Time           : ${new Date().toISOString()}\n`);

    console.log('⚠️  IMPORTANT: Save your Private Key securely. It will not be shown again.\n');

    const data = {
      agentId,
      name: options.name,
      description: options.description,
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
      registeredAt: new Date().toISOString()
    };

    fs.writeFileSync('vellum-agents.json', JSON.stringify(data, null, 2));
    console.log('📁 Agent data has been saved to vellum-agents.json');
  });

// ====================== BUY MEME COIN ======================
program
  .command('buy')
  .description('Buy meme coin with ETH')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .requiredOption('--token <address>', 'Token contract address')
  .requiredOption('--privatekey <key>', 'Private key')
  .action(async (options) => {
    try {
      const wallet = new ethers.Wallet(options.privatekey, provider);
      const router = new ethers.Contract(UNISWAP_ROUTER, [
        "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])"
      ], wallet);

      const path = ["0x4200000000000000000000000000000000000006", options.token];
      const amountIn = ethers.parseEther(options.amount);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.swapExactETHForTokens(0, path, wallet.address, deadline, { value: amountIn });

      console.log(`\n✅ Buy successful!`);
      console.log(`Tx Hash : ${tx.hash}`);
      console.log(`https://basescan.org/tx/${tx.hash}`);
    } catch (e) {
      console.error('❌ Buy failed:', e.message);
    }
  });

// ====================== SELL TOKEN ======================
program
  .command('sell')
  .description('Sell token for ETH')
  .requiredOption('--amount <amount>', 'Amount of tokens')
  .requiredOption('--token <address>', 'Token contract address')
  .requiredOption('--privatekey <key>', 'Private key')
  .action(async (options) => {
    console.log(`\n🔄 Preparing to sell ${options.amount} of ${options.token}...`);
    console.log('✅ Sell command structure ready (full implementation can be added later)');
    // Basic structure - can be expanded later
  });

// ====================== SEND ETH ======================
program
  .command('send eth')
  .description('Send ETH')
  .requiredOption('--to <address>', 'Recipient')
  .requiredOption('--amount <amount>', 'Amount')
  .requiredOption('--privatekey <key>', 'Private key')
  .action(async (options) => {
    try {
      const wallet = new ethers.Wallet(options.privatekey, provider);
      const tx = await wallet.sendTransaction({
        to: options.to,
        value: ethers.parseEther(options.amount)
      });
      console.log(`✅ ETH sent! Tx: ${tx.hash}`);
    } catch (e) {
      console.error('❌ Failed:', e.message);
    }
  });

// ====================== SEND USDC ======================
program
  .command('send usdc')
  .description('Send USDC')
  .requiredOption('--to <address>', 'Recipient')
  .requiredOption('--amount <amount>', 'Amount')
  .requiredOption('--privatekey <key>', 'Private key')
  .action(async (options) => {
    try {
      const wallet = new ethers.Wallet(options.privatekey, provider);
      const usdc = new ethers.Contract(USDC_ADDRESS, [
        "function transfer(address to, uint256 amount) returns (bool)"
      ], wallet);

      const amount = ethers.parseUnits(options.amount, 6);
      const tx = await usdc.transfer(options.to, amount);
      console.log(`✅ USDC sent! Tx: ${tx.hash}`);
    } catch (e) {
      console.error('❌ Failed:', e.message);
    }
  });

program.parse();
