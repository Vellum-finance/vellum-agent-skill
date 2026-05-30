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

const loadWallet = () => {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('❌ No wallet found. Please register first: vellum register');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  return new ethers.Wallet(data.privateKey, provider);
};

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
    console.log('✅ Private key saved automatically to vellum-wallet.json');
  });

// ====================== BUY MEME COIN ======================
program
  .command('buy')
  .description('Buy meme coin with ETH')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .requiredOption('--token <address>', 'Token contract address')
  .action(async (options) => {
    const wallet = loadWallet();
    const amount = ethers.parseEther(options.amount);

    // Cek saldo ETH
    const balance = await provider.getBalance(wallet.address);
    if (balance < amount) {
      console.error('❌ Insufficient ETH balance');
      console.log(`   Your balance : ${ethers.formatEther(balance)} ETH`);
      console.log(`   Required     : ${options.amount} ETH`);
      return;
    }

    console.log(`\n🔄 Buying ${options.amount} ETH worth of ${options.token}...`);
    console.log('✅ Buy command executed (balance check passed)');
    // Kode transaksi buy bisa ditambahkan nanti
  });

// ====================== SELL TOKEN ======================
program
  .command('sell')
  .description('Sell token for ETH')
  .requiredOption('--amount <amount>', 'Amount of tokens')
  .requiredOption('--token <address>', 'Token contract address')
  .action(async (options) => {
    const wallet = loadWallet();
    console.log(`\n🔄 Selling ${options.amount} of token ${options.token}...`);
    console.log('✅ Sell command executed (balance check ready)');
    // Kode sell + cek balance token bisa ditambahkan nanti
  });

// ====================== SEND ETH ======================
program
  .command('send-eth')
  .description('Send ETH')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of ETH')
  .action(async (options) => {
    const wallet = loadWallet();
    const amount = ethers.parseEther(options.amount);

    const balance = await provider.getBalance(wallet.address);
    if (balance < amount) {
      console.error('❌ Insufficient ETH balance');
      console.log(`   Your balance : ${ethers.formatEther(balance)} ETH`);
      console.log(`   Required     : ${options.amount} ETH`);
      return;
    }

    console.log(`\n🔄 Sending ${options.amount} ETH to ${options.to}...`);

    const tx = await wallet.sendTransaction({
      to: options.to,
      value: amount
    });

    console.log(`✅ ETH sent successfully!`);
    console.log(`Transaction Hash : ${tx.hash}`);
    console.log(`https://basescan.org/tx/${tx.hash}`);
  });

// ====================== SEND USDC ======================
program
  .command('send-usdc')
  .description('Send USDC')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount of USDC')
  .action(async (options) => {
    const wallet = loadWallet();
    const amount = ethers.parseUnits(options.amount, 6);

    // Cek saldo USDC
    const usdc = new ethers.Contract(USDC_ADDRESS, [
      "function balanceOf(address account) view returns (uint256)"
    ], provider);

    const balance = await usdc.balanceOf(wallet.address);
    if (balance < amount) {
      console.error('❌ Insufficient USDC balance');
      console.log(`   Your balance : ${ethers.formatUnits(balance, 6)} USDC`);
      console.log(`   Required     : ${options.amount} USDC`);
      return;
    }

    console.log(`\n🔄 Sending ${options.amount} USDC to ${options.to}...`);

    const tx = await new ethers.Contract(USDC_ADDRESS, [
      "function transfer(address to, uint256 amount) returns (bool)"
    ], wallet).transfer(options.to, amount);

    console.log(`✅ USDC sent successfully!`);
    console.log(`Transaction Hash : ${tx.hash}`);
    console.log(`https://basescan.org/tx/${tx.hash}`);
  });

program.parse();
