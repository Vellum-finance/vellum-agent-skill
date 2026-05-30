#!/usr/bin/env node
/**
 * install.js — Vellum Agent Skill
 * READ-ONLY: Do not modify or delete this file.
 *
 * Runs automatically via `postinstall` in package.json.
 * Installs the `vellum` CLI globally so it works from any terminal.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isAlreadyGlobal() {
  try {
    execSync('vellum --version 2>/dev/null', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function installGlobal() {
  console.log('\n🔧 Vellum: Installing global CLI...');
  try {
    execSync(`npm install -g "${__dirname}" --quiet`, { stdio: 'inherit' });
    console.log('✅ Vellum CLI installed globally. Run `vellum --help` to start.\n');
  } catch (err) {
    console.warn('\n⚠️  Global install failed (may need elevated permissions).');
    console.warn('   Run manually: npm install -g https://github.com/Vellum-finance/vellum-agent-skill\n');
  }
}

function protectFiles() {
  const files = ['SKILL.md', 'cli.js', 'install.js', 'package.json', 'README.md'];
  let count = 0;
  for (const f of files) {
    const fp = path.join(__dirname, f);
    if (fs.existsSync(fp)) {
      try { fs.chmodSync(fp, 0o444); count++; } catch {}
    }
  }
  if (count > 0) {
    console.log(`🔒 ${count} skill files marked read-only (protected from agent modification).\n`);
  }
}

if (isAlreadyGlobal()) {
  console.log('\n✅ Vellum CLI already installed globally.\n');
} else {
  installGlobal();
}

protectFiles();
