#!/usr/bin/env node
/**
 * bin.js — Vellum entry point wrapper
 * 
 * This file is what npm's "bin" field points to.
 * It auto-fixes cli.js permissions then imports it.
 * Using a wrapper means: even if cli.js has wrong permissions,
 * THIS file just needs to be readable (not executable) to work,
 * because npm creates its own wrapper that calls `node bin.js`.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, 'cli.js');

// Auto-fix permissions on cli.js every time vellum is called
// This ensures it's always executable regardless of how it was installed
try { fs.chmodSync(CLI, 0o755); } catch {}

// Now import and run cli.js
await import(CLI);
