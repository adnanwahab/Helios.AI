// Pin the existing Fly app's memory without replacing its mounts/services.
// Usage: node scripts/pin-fly-memory.mjs fly.toml
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const headings = text => {
  const headers = [...text.matchAll(/^[ \t]*(\[\[[^\]\r\n]+\]\]|\[[^\]\r\n]+\])[ \t]*(?:#[^\r\n]*)?$/gm)];
  return headers.map((match, i) => ({
    name: match[1],
    bodyStart: match.index + match[0].length,
    end: i + 1 < headers.length ? headers[i + 1].index : text.length,
    body: text.slice(match.index + match[0].length, i + 1 < headers.length ? headers[i + 1].index : text.length),
  }));
};
const field = (section, key, expected) => {
  const line = section.body.split(/\r?\n/).find(s => {
    const value = s.trimStart();
    return value.startsWith(key) && value.slice(key.length).trimStart().startsWith('=');
  });
  if (!line) return false;
  const raw = line.slice(line.indexOf('=') + 1).split('#')[0].trim();
  const value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
  return value === expected;
};

export function pinFlyMemory(text) {
  if (!/^\s*app\s*=\s*['"]helios-ai-laws['"](?:\s*#.*)?\s*$/m.test(text)) {
    throw new Error('Expected app = "helios-ai-laws"; refusing to modify a different app.');
  }
  const sections = headings(text);
  const mounts = sections.filter(s => ['[mounts]', '[[mounts]]'].includes(s.name));
  if (!mounts.some(s => field(s, 'source', 'helios_data') && field(s, 'destination', '/data'))) {
    throw new Error('Expected an existing helios_data volume mounted at /data; refusing to replace Fly config.');
  }
  const services = sections.filter(s => ['[http_service]', '[[services]]'].includes(s.name));
  if (!services.some(s => field(s, 'internal_port', '8080'))) {
    throw new Error('Expected an existing HTTP service on port 8080; refusing to replace Fly config.');
  }
  const vm = sections.filter(s => ['[vm]', '[[vm]]'].includes(s.name));
  if (vm.length > 1) throw new Error('Multiple VM blocks: edit memory per process group manually.');
  if (!vm.length) {
    return text.replace(/\s*$/, '\n\n') + '[[vm]]\n  cpu_kind = "shared"\n  cpus = 1\n  memory_mb = 1024\n';
  }
  if (/^[ \t]*memory_mb[ \t]*=[ \t]*1024[ \t]*(?:#.*)?$/m.test(vm[0].body) && !/^[ \t]*memory[ \t]*=/m.test(vm[0].body)) {
    return text;
  }
  // Preserve every other config line, including CPU settings and volume routing.
  const bodyWithoutMemory = vm[0].body.replace(/^[ \t]*(?:memory|memory_mb)[ \t]*=[^\r\n]*(?:\r?\n|$)/gm, '');
  const patched = bodyWithoutMemory.replace(/\s*$/, '\n') + '  memory_mb = 1024\n';
  return text.slice(0, vm[0].bodyStart) + patched + text.slice(vm[0].end);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const filename = resolve(process.argv[2] || 'fly.toml');
    const original = readFileSync(filename, 'utf8');
    const patched = pinFlyMemory(original);
    if (patched === original) {
      console.log('Fly VM is already pinned to 1024 MB; no changes made.');
    } else {
      const backup = filename + '.before-memory-pin.' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
      writeFileSync(backup, original, {flag: 'wx', mode: 0o600});
      writeFileSync(filename, patched, {mode: 0o600});
      console.log('Pinned Fly VM memory to 1024 MB; previous config saved as a local .bak file.');
    }
    console.log('Review mounts and port 8080 before deploying; the script does not call Fly.');
  } catch (error) {
    console.error('Fly memory pin failed:', error.message);
    process.exitCode = 1;
  }
}
