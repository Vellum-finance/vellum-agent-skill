#!/usr/bin/env node
/**
 * install.js — Vellum Agent Skill v1.2.0
 * READ-ONLY: Do not modify or delete this file.
 *
 * Runs via postinstall. Sets up global `vellum` CLI.
 * Safe to fail — never blocks the main install.
 */

import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Detect environment ────────────────────────────────────────────────────────
const isTermux = process.env.PREFIX?.includes('com.termux') ||
                 process.env.HOME?.includes('com.termux') ||
                 fs.existsSync('/data/data/com.termux');

const isRoot   = process.getuid?.() === 0;
const platform = os.platform();

function log(msg)  { console.log(`  vellum: ${msg}`); }
function warn(msg) { console.warn(`  vellum ⚠️  ${msg}`); }

// ── Check if already globally installed ──────────────────────────────────────
function isAlreadyGlobal() {
  try {
    const r = spawnSync('vellum', ['--version'], { encoding: 'utf8', timeout: 5000 });
    return r.status === 0;
  } catch { return false; }
}

// ── Get npm global prefix safely ─────────────────────────────────────────────
function getNpmPrefix() {
  try {
    const r = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8', timeout: 8000 });
    return r.stdout?.trim() || null;
  } catch { return null; }
}

// ── Create symlink manually (avoids EISDIR rename bug) ───────────────────────
function createSymlinkManually() {
  try {
    const prefix = getNpmPrefix();
    if (!prefix) return false;

    const binDir  = path.join(prefix, 'bin');
    const linkPath = path.join(binDir, 'vellum');
    const target   = path.join(__dirname, 'cli.js');

    // Make cli.js executable
    try { fs.chmodSync(target, 0o755); } catch {}

    // Create bin dir if missing
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    // Remove stale link/file
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isSymbolicLink?.()) {
      try { fs.unlinkSync(linkPath); } catch {}
    }

    // Create symlink: vellum → cli.js
    fs.symlinkSync(target, linkPath);
    log(`Symlink created: ${linkPath} → ${target}`);
    return true;
  } catch (e) {
    warn(`Symlink failed: ${e.message}`);
    return false;
  }
}

// ── Install globally via npm ──────────────────────────────────────────────────
function installGlobal() {
  log('Installing global CLI command...');

  // Strategy 1: npm link (works best when already in the package folder)
  try {
    const r = spawnSync('npm', ['link', '--ignore-scripts'], {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: 60000,
      stdio: 'pipe',
    });
    if (r.status === 0) {
      log('✅ Global CLI installed via npm link.');
      return true;
    }
    warn(`npm link failed (status ${r.status}): ${r.stderr?.trim()}`);
  } catch (e) {
    warn(`npm link error: ${e.message}`);
  }

  // Strategy 2: Manual symlink (fixes Termux EISDIR + proot EISDIR errors)
  log('Trying manual symlink...');
  if (createSymlinkManually()) return true;

  // Strategy 3: Termux-specific — add alias to .bashrc/.zshrc
  if (isTermux) {
    log('Termux detected — adding shell alias...');
    const cliPath = path.join(__dirname, 'cli.js');
    const alias   = `\nalias vellum='node ${cliPath}'\n`;
    const shells  = [
      path.join(os.homedir(), '.bashrc'),
      path.join(os.homedir(), '.zshrc'),
      path.join(os.homedir(), '.profile'),
    ];
    let wrote = false;
    for (const sh of shells) {
      try {
        if (!fs.existsSync(sh) || !fs.readFileSync(sh, 'utf8').includes('alias vellum=')) {
          fs.appendFileSync(sh, alias);
          log(`Alias added to ${sh}`);
          wrote = true;
          break;
        }
      } catch {}
    }
    if (wrote) {
      console.log('\n  ✅ Vellum alias added!');
      console.log('  Run this to activate:  source ~/.bashrc');
      console.log('  Then use:              vellum --help\n');
      return true;
    }
  }

  return false;
}

// ── Protect files (read-only) ─────────────────────────────────────────────────
function protectFiles() {
  const files = ['SKILL.md', 'cli.js', 'install.js', 'package.json', 'README.md'];
  let n = 0;
  for (const f of files) {
    const fp = path.join(__dirname, f);
    if (fs.existsSync(fp)) {
      try { fs.chmodSync(fp, 0o444); n++; } catch {}
    }
  }
  if (n > 0) log(`${n} files marked read-only (protected).`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n  ┌─ Vellum Agent Skill Setup ─────────────────┐');
console.log(`  │  Platform : ${platform} (${isTermux ? 'Termux' : isRoot ? 'root' : 'user'})`);
console.log(`  │  Node     : ${process.version}`);
console.log(`  │  Path     : ${__dirname}`);
console.log('  └────────────────────────────────────────────┘\n');

if (isAlreadyGlobal()) {
  log('✅ vellum CLI already available globally.');
} else {
  const ok = installGlobal();
  if (!ok) {
    warn('Could not install globally automatically.');
    warn(`Run manually: node ${path.join(__dirname, 'cli.js')} --help`);
    warn(`Or add this alias to ~/.bashrc:  alias vellum='node ${path.join(__dirname, 'cli.js')}'`);
  }
}

protectFiles();
console.log('');
