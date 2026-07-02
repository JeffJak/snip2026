#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const bundleRoot = path.join(repoRoot, 'bundle');
const backendRoot = path.join(repoRoot, 'backend');
const frontendRoot = path.join(repoRoot, 'frontend');
const cliRoot = path.join(repoRoot, 'cli');
const push = process.argv.includes('--push');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
}

function hasStagedChanges(pathSpec) {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--', pathSpec], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  return result.stdout.trim().length > 0;
}

function ensureCleanRepo(repoDir, branchName) {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: repoDir,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Not a git repo: ${repoDir}`);
  }
  const branch = runCapture('git', ['branch', '--show-current'], { cwd: repoDir });
  if (branch && branch !== branchName) {
    run('git', ['checkout', branchName], { cwd: repoDir });
  }
}

function updateSubmodules() {
  run('git', ['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli'], { cwd: repoRoot });
}

function buildFrontend() {
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: frontendRoot });
  run('npx', ['ng', 'build'], { cwd: frontendRoot, env: { ...process.env, PATH: `${process.env.PATH}:${path.join(os.homedir(), '.npm-global', 'bin')}` } });
  const indexHtml = path.join(frontendRoot, 'dist', 'snip-frontend', 'browser', 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`Expected frontend build output at ${indexHtml}`);
  }
}

function prepareBundleDirs() {
  if (existsSync(bundleRoot)) {
    run('git', ['-C', bundleRoot, 'reset', '--hard']);
    for (const entry of readdirSync(bundleRoot)) {
      if (entry === '.git') continue;
      rmSync(path.join(bundleRoot, entry), { recursive: true, force: true });
    }
  } else {
    mkdirSync(bundleRoot, { recursive: true });
  }
  mkdirSync(path.join(bundleRoot, 'public'), { recursive: true });
}

function copyBundleFiles() {
  cpSync(path.join(backendRoot, 'server.js'), path.join(bundleRoot, 'server.js'));
  cpSync(path.join(cliRoot, 'cli.js'), path.join(bundleRoot, 'cli.js'));
  cpSync(path.join(frontendRoot, 'dist', 'snip-frontend', 'browser'), path.join(bundleRoot, 'public'), { recursive: true });
}

function writeBundleFiles() {
  writeFileSync(path.join(bundleRoot, '.env'), 'PUBLIC_DIR=./public\n');
  writeFileSync(path.join(bundleRoot, 'package.json'), JSON.stringify({
    name: 'snip-bundle',
    private: true,
    scripts: { start: 'bun server.js' },
  }, null, 2));
  writeFileSync(path.join(bundleRoot, 'Dockerfile'), [
    'FROM oven/bun:1-alpine',
    'COPY . .',
    'ENV PORT=3000',
    'EXPOSE 3000',
    'CMD bun server.js',
    '',
  ].join('\n'));
  writeFileSync(path.join(bundleRoot, '.dockerignore'), ['node_modules', 'dist', '.git', ''].join('\n'));
  writeFileSync(path.join(bundleRoot, 'railway.json'), JSON.stringify({
    build: { builder: 'DOCKERFILE' },
  }, null, 2));
}

function commitBundle() {
  const repo = bundleRoot;
  const status = runCapture('git', ['-C', repo, 'status', '--porcelain']);
  if (!status.trim()) {
    console.log('Nothing to commit in bundle/.');
    return false;
  }
  run('git', ['-C', repo, 'add', '.']);
  const staged = runCapture('git', ['-C', repo, 'diff', '--cached', '--name-only']);
  if (!staged.trim()) {
    console.log('Nothing staged in bundle/.');
    return false;
  }
  run('git', ['-C', repo, 'commit', '-m', 'Assemble bundle']);
  return true;
}

function updateSubmodulePointers() {
  const submodulePaths = ['backend', 'frontend', 'cli'];
  for (const submodulePath of submodulePaths) {
    const submoduleRoot = path.join(repoRoot, submodulePath);
    const status = runCapture('git', ['-C', repoRoot, 'status', '--short', '--', submodulePath]);
    if (status.trim()) {
      run('git', ['-C', repoRoot, 'add', submodulePath]);
    }
  }
  const staged = runCapture('git', ['-C', repoRoot, 'diff', '--cached', '--name-only']);
  if (!staged.trim()) {
    return false;
  }
  run('git', ['-C', repoRoot, 'commit', '-m', 'Update submodule pointers']);
  return true;
}

function pushIfRequested() {
  if (!push) return;
  run('git', ['-C', bundleRoot, 'push', 'origin', 'HEAD:bundle']);
  run('git', ['-C', repoRoot, 'push', 'origin', 'main']);
}

function main() {
  ensureCleanRepo(repoRoot, 'main');
  run('git', ['-C', repoRoot, 'checkout', 'main']);
  updateSubmodules();
  buildFrontend();
  prepareBundleDirs();
  copyBundleFiles();
  writeBundleFiles();
  const bundleCommitted = commitBundle();
  const submodulePointersCommitted = updateSubmodulePointers();
  if (!bundleCommitted && !submodulePointersCommitted) {
    console.log('No changes were required.');
  } else {
    console.log('Bundle assembly complete.');
  }
  pushIfRequested();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
