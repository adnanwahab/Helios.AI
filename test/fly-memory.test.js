import {test, expect} from 'bun:test';
import {pinFlyMemory} from '../scripts/pin-fly-memory.mjs';

const config = [
  'app = "helios-ai-laws"',
  'primary_region = "ord"',
  '[build]',
  '  image = "old"',
  '[[mounts]]',
  '  source = "helios_data"',
  '  destination = "/data"',
  '[http_service]',
  '  internal_port = 8080',
  '  force_https = true',
  '[[vm]]',
  '  cpu_kind = "shared"',
  '  cpus = 1',
  '  memory_mb = 512',
  '',
].join('\n');

test('pins 1GB RAM and preserves mounts, port and build settings', () => {
  const next = pinFlyMemory(config);
  expect(next).toContain('memory_mb = 1024');
  expect(next).not.toContain('memory_mb = 512');
  expect(next).toContain('source = "helios_data"');
  expect(next).toContain('destination = "/data"');
  expect(next).toContain('internal_port = 8080');
  expect(next).toContain('image = "old"');
  expect(pinFlyMemory(next)).toBe(next);
});

test('removes conflicting older memory keys without altering later sections', () => {
  const before = config.replace('  memory_mb = 512', '  memory = "512mb"\n  memory_mb = 512') + '\n[env]\n  SAFE = "yes"\n';
  const next = pinFlyMemory(before);
  expect((next.match(/memory_mb = 1024/g) || []).length).toBe(1);
  expect(next).not.toContain('memory = ');
  expect(next).toContain('[env]\n  SAFE = "yes"');
});

test('refuses any config with the wrong app, missing data volume or wrong port', () => {
  expect(() => pinFlyMemory(config.replace('helios-ai-laws', 'other-app'))).toThrow(/different app/);
  expect(() => pinFlyMemory(config.replace('helios_data', 'other-volume'))).toThrow(/helios_data/);
  expect(() => pinFlyMemory(config.replace('internal_port = 8080', 'internal_port = 3000'))).toThrow(/8080/);
  expect(() => pinFlyMemory(config + '\n[[vm]]\n  memory_mb = 512\n')).toThrow(/Multiple VM/);
});
