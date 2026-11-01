import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chooseSimulator } = require('../scripts/select-simulator.cjs');
const { prepareXcodeNode } = require('../scripts/prepare-xcode-node.cjs');

const older = '11111111-1111-1111-1111-111111111111';
const newer = '22222222-2222-2222-2222-222222222222';
const unavailable = '33333333-3333-3333-3333-333333333333';
const list = { devices: {
  'com.apple.CoreSimulator.SimRuntime.iOS-18-4': [{ name: 'iPhone 16', udid: older, state: 'Shutdown', isAvailable: true }],
  'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ name: 'iPhone 17', udid: newer, state: 'Shutdown', isAvailable: true }],
  'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [{ name: 'iPhone 18', udid: unavailable, state: 'Shutdown', isAvailable: false }],
} };
test('simulator selection prefers newest available iOS and excludes unavailable devices', () => {
  assert.equal(chooseSimulator(list), newer);
});
test('simulator selection respects booted phone and explicit valid choice', () => {
  const booted = structuredClone(list);
  booted.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-4'][0].state = 'Booted';
  assert.equal(chooseSimulator(booted), older);
  assert.equal(chooseSimulator(booted, newer), newer);
});
test('simulator selection rejects missing, unavailable, non-iPhone and invalid IDs', () => {
  assert.throws(() => chooseSimulator(list, unavailable), /available iPhone/);
  assert.throws(() => chooseSimulator({ devices: {} }), /No available iPhone/);
  assert.throws(() => chooseSimulator({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ name: 'iPad Pro', udid: newer }] } }), /No available iPhone/);
  assert.throws(() => chooseSimulator(list, '$(anything)'), /available iPhone/);
});
test('Xcode local Node path works with a minimal GUI PATH and existing custom config is preserved', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'larpit-xcode-node-'));
  try {
    assert.equal(prepareXcodeNode(dir), 'created');
    const localFile = path.join(dir, '.xcode.env.local');
    const child = spawnSync('/bin/bash', ['-c', '. "$1"; "$NODE_BINARY" -p process.execPath', 'test', localFile], {
      encoding: 'utf8', env: { PATH: '/usr/bin:/bin' },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(realpathSync(child.stdout.trim()), realpathSync(process.execPath));
    const custom = '# My existing version-manager setup\nexport NODE_BINARY=/custom/node\n';
    writeFileSync(localFile, custom);
    assert.equal(prepareXcodeNode(dir), 'preserved');
    assert.equal(readFileSync(localFile, 'utf8'), custom);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
