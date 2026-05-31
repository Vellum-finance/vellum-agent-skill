#!/usr/bin/env node
/**
 * install.js — Vellum Agent Skill v1.2.0
 * READ-ONLY: Do not modify or delete this file.
 *
 * Runs via postinstall. Sets up global `vellum` CLI.
 * Safe to fail — never blocks the main install.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI       = path.join(__dirname, 'cli.js');

// ── Detect environment ────────────────────────────────────────────────────────
const isTermux = process.env.PREFIX?.includes('com.termux') ||
                 process.env.HOME?.includes('com.termux') ||
                 fs.existsSync('/data/data/com.termux');
const isRoot   = process.getuid?.() === 0;
const platform = os.platform();

function log(msg)  { console.log(`  vellum: ${msg}`); }
function warn(msg) { console.warn(`  vellum ⚠️  ${msg}`); }

// ── Step 1: Fix cli.js permissions FIRST ─────────────────────────────────────
// chmod 755: owner=rwx, group=r-x, others=r-x
// This is the ROOT CAUSE of "Permission denied" — must run before anything else
function fixCliPermissions() {
  try {
    // 0o755 = -rwxr-xr-x : executable by everyone, writable only by owner
    fs.chmodSync(CLI, 0o755);
    log('cli.js → chmod 755 (executable for all users) ✅');
    return true;
  } catch (e) {
    warn(`chmod 755 failed: ${e.message}`);
    // Try via shell as fallback
    try {
      spawnSync('chmod', ['755', CLI], { timeout: 3000 });
      log('cli.js → chmod 755 via shell ✅');
      return true;
    } catch { return false; }
  }
}

// ── Step 2: Fix symlink permissions if it already exists ─────────────────────
function fixExistingSymlinks() {
  const prefix = getNpmPrefix();
  if (!prefix) return;

  const candidates = [
    path.join(prefix, 'bin', 'vellum'),
    '/usr/local/bin/vellum',
    '/usr/bin/vellum',
    process.env.PREFIX ? path.join(process.env.PREFIX, 'bin', 'vellum') : null,
  ].filter(Boolean);

  for (const linkPath of candidates) {
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink() || stat.isFile()) {
        // Fix permissions on the symlink target (cli.js) — already done above
        // But also ensure the symlink itself is accessible
        try { fs.chmodSync(linkPath, 0o755); } catch {}
        log(`Fixed permissions on existing symlink: ${linkPath}`);
      }
    } catch {}
  }
}

// ── Get npm global prefix safely ─────────────────────────────────────────────
function getNpmPrefix() {
  try {
    const r = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8', timeout: 8000 });
    return r.stdout?.trim() || null;
  } catch { return null; }
}

// ── Create symlink manually ───────────────────────────────────────────────────
function createSymlinkManually() {
  try {
    const prefix = getNpmPrefix();
    if (!prefix) return false;

    const binDir   = path.join(prefix, 'bin');
    const linkPath = path.join(binDir, 'vellum');

    // Ensure bin dir exists
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    // Remove stale entry (file, dir, or symlink)
    try {
      const existing = fs.lstatSync(linkPath);
      if (existing.isDirectory()) {
        fs.rmSync(linkPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(linkPath);
      }
    } catch {}

    // Create fresh symlink
    fs.symlinkSync(CLI, linkPath);
    // chmod the symlink target
    try { fs.chmodSync(linkPath, 0o755); } catch {}

    log(`Symlink: ${linkPath} → ${CLI} ✅`);
    return true;
  } catch (e) {
    warn(`Symlink failed: ${e.message}`);
    return false;
  }
}

// ── Write wrapper script (absolute fallback) ──────────────────────────────────
// Writes a small bash wrapper that calls `node cli.js`
// This sidesteps shebang/permission issues entirely
function writeWrapperScript(destDir) {
  try {
    const wrapperPath = path.join(destDir, 'vellum');
    const wrapper = `#!/bin/sh\nexec node "${CLI}" "$@"\n`;
    fs.writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
    log(`Wrapper script written: ${wrapperPath} ✅`);
    return true;
  } catch (e) {
    warn(`Wrapper script failed: ${e.message}`);
    return false;
  }
}

// ── Add shell alias ───────────────────────────────────────────────────────────
function addShellAlias() {
  const aliasLine = `alias vellum='node "${CLI}"'`;
  const shells = [
    path.join(os.homedir(), '.bashrc'),
    path.join(os.homedir(), '.zshrc'),
    path.join(os.homedir(), '.profile'),
    path.join(os.homedir(), '.bash_profile'),
  ];
  // Termux also checks PREFIX-based profile
  if (process.env.PREFIX) {
    shells.push(path.join(process.env.PREFIX, 'etc', 'bash.bashrc'));
  }

  for (const sh of shells) {
    try {
      const existing = fs.existsSync(sh) ? fs.readFileSync(sh, 'utf8') : '';
      if (!existing.includes('alias vellum=')) {
        fs.appendFileSync(sh, `\n# Vellum Agent Skill\n${aliasLine}\n`);
        log(`Alias added to ${sh}`);
        return sh;
      } else {
        log(`Alias already in ${sh}`);
        return sh;
      }
    } catch {}
  }
  return null;
}

// ── Main install flow ─────────────────────────────────────────────────────────
function installGlobal() {
  log('Setting up global vellum CLI...');

  // Strategy 1: npm link
  try {
    const r = spawnSync('npm', ['link', '--ignore-scripts'], {
      cwd: __dirname, encoding: 'utf8', timeout: 60000, stdio: 'pipe',
    });
    if (r.status === 0) {
      log('npm link succeeded ✅');
      return true;
    }
    warn(`npm link status ${r.status}: ${r.stderr?.trim()?.slice(0, 120)}`);
  } catch (e) { warn(`npm link error: ${e.message}`); }

  // Strategy 2: Manual symlink
  log('Trying manual symlink...');
  if (createSymlinkManually()) return true;

  // Strategy 3: Wrapper script in npm prefix bin
  const prefix = getNpmPrefix();
  if (prefix) {
    log('Trying wrapper script...');
    const binDir = path.join(prefix, 'bin');
    try { fs.mkdirSync(binDir, { recursive: true }); } catch {}
    if (writeWrapperScript(binDir)) return true;
  }

  // Strategy 4: Wrapper script in /usr/local/bin (Linux/proot)
  if (!isTermux) {
    for (const sysbin of ['/usr/local/bin', '/usr/bin']) {
      if (fs.existsSync(sysbin)) {
        log(`Trying wrapper in ${sysbin}...`);
        if (writeWrapperScript(sysbin)) return true;
      }
    }
  }

  // Strategy 5: Shell alias (works everywhere including Termux)
  log('Falling back to shell alias...');
  const aliasFile = addShellAlias();
  if (aliasFile) {
    console.log('\n  ✅ Vellum shell alias installed!');
    console.log(`  Activate now:  source ${aliasFile}`);
    console.log('  Then use:      vellum --help\n');
    return true;
  }

  return false;
}

// ── Protect read-only files (NEVER chmod cli.js to 444) ─────────────────────
// cli.js MUST stay 755 (executable). Only protect non-executable files.
function protectFiles() {
  // Read-only, non-executable files (444 = r--r--r--)
  const readonlyFiles = ['SKILL.md', 'install.js', 'package.json', 'README.md'];
  for (const f of readonlyFiles) {
    const fp = path.join(__dirname, f);
    try { if (fs.existsSync(fp)) fs.chmodSync(fp, 0o444); } catch {}
  }

  // cli.js: read+execute for all, write only for owner (755 = rwxr-xr-x)
  // This is critical — DO NOT set to 444, it would break `vellum` command
  try { fs.chmodSync(CLI, 0o755); } catch {}

  log('Files protected: SKILL.md, install.js, package.json, README.md → 444');
  log('cli.js → 755 (read+execute for all users) ✅');
}

// ── Entry point ───────────────────────────────────────────────────────────────
console.log('\n  ┌─ Vellum Agent Skill Setup ──────────────────┐');
console.log(`  │  v1.2.0  │  ${platform}  │  ${isTermux ? 'Termux' : isRoot ? 'root' : 'user'}`);
console.log(`  │  Node ${process.version}  │  ${__dirname.slice(0, 35)}...`);
console.log('  └─────────────────────────────────────────────┘\n');

// ALWAYS fix cli.js permissions first — this is the #1 root cause of errors
fixCliPermissions();
fixExistingSymlinks();

// Install global command if not already present
const alreadyInstalled = spawnSync('vellum', ['--version'],
  { encoding: 'utf8', timeout: 3000 }).status === 0;

if (alreadyInstalled) {
  log('vellum already works globally ✅');
} else {
  const ok = installGlobal();
  if (!ok) {
    console.log('\n  ──────────────────────────────────────────────');
    console.log('  Manual setup (copy & paste one of these):');
    console.log(`\n  Option A — alias:`);
    console.log(`    echo "alias vellum=\\'node \\"${CLI}\\"\\'" >> ~/.bashrc && source ~/.bashrc`);
    console.log(`\n  Option B — direct call:`);
    console.log(`    node ${CLI} --help`);
    console.log('  ──────────────────────────────────────────────\n');
  }
}

// Protect files last (after permissions are already correct)
protectFiles();
console.log('');
