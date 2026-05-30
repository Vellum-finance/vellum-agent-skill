#!/usr/bin/env node

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import fs from 'fs';
import readline from 'readline';

const BASE_RPC = "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(BASE_RPC);
const UNISWAP_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

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
  .description('Buy meme coin with ETH on Base')
  .option('--amount <amount>', 'Amount of ETH', '0.1')
  .option('--token <address>', 'Token contract address')
  .argument('[token]', 'Token contract address')
  .action(async (tokenArg, options) => {
    const tokenAddress = options.token || tokenArg;

    if (!tokenAddress || !tokenAddress.startsWith('0x')) {
      console.error('❌ Error: Please provide a valid token contract address.');
      return;
    }

    console.log(`\n🔄 Preparing to buy ${options.amount} ETH worth of token: ${tokenAddress}`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const privateKey = await new Promise(resolve => rl.question('\nEnter your Private Key: ', resolve));
    rl.close();

    try {
      const wallet = new ethers.Wallet(privateKey, provider);
      const router = new ethers.Contract(UNISWAP_ROUTER, [
        "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])"
      ], wallet);

      const path = ["0x4200000000000000000000000000000000000006", tokenAddress];
      const amountIn = ethers.parseEther(options.amount);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.swapExactETHForTokens(0, path, wallet.address, deadline, { value: amountIn });

      console.log(`\n✅ Buy order executed successfully!`);
      console.log(`Transaction Hash : ${tx.hash}`);
      console.log(`View on Basescan : https://basescan.org/tx/${tx.hash}`);
    } catch (e) {
      console.error('❌ Transaction failed:', e.message);
    }
  });

program.parse();
