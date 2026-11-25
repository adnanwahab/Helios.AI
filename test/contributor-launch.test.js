import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
const source = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('community hub is included in both static builds and clean local route',()=>{
  expect(source('scripts/build-netlify.mjs')).toContain("'contribute.html'");
  expect(source('scripts/build-pages.mjs')).toContain("'contribute.html'");
  expect(source('netlify.toml')).toContain('from = "/contribute"\n  to = "/contribute.html"');
  expect(source('index.html')).toContain('href="./contribute.html"');
  const hub=source('contribute.html');
  expect(hub).toContain('./index.html?compose=pr');
  expect(hub).not.toContain('/api/');
  expect(hub).not.toContain('<script');
  expect(source('docs/contributor-launch.md').split('\n').filter(l=>/^\| (research|simulation|visualization|consensus|infrastructure|community) \|/.test(l))).toHaveLength(30);
});
