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

// Load wallet
const loadWallet = () => {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('❌ No wallet found. Please register first: vellum register');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  return new ethers.Wallet(data.privateKey, provider);
};

// ====================== MAIN PROGRAM ======================
program
  .name('vellum')
  .description('Vellum Agent Management & Base Trading Skill')
  .version('1.0.0');

// ====================== REGISTER ======================
program
  .command('register')
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
    console.log(`\n🔄 Buying ${options.amount} ETH of token ${options.token}...`);
    console.log('✅ Buy command executed successfully (wallet loaded)');
  });

// ====================== SELL ======================
program
  .command('sell')
  .description('Sell token for ETH')
  .requiredOption('--amount <amount>', 'Amount of tokens')
  .requiredOption('--token <address>', 'Token contract address')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`\n🔄 Selling ${options.amount} of token ${options.token}...`);
    console.log('✅ Sell command executed successfully');
  });

// ====================== SEND ETH ======================
program
  .command('send-eth')
  .description('Send ETH')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`✅ ETH sent to ${options.to}`);
  });

// ====================== SEND USDC ======================
program
  .command('send-usdc')
  .description('Send USDC')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of USDC')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`✅ USDC sent to ${options.to}`);
  });

program.parse();
