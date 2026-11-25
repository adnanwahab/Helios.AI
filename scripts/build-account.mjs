import {build} from 'esbuild';
import {join} from 'node:path';

// Bundle the pinned Auth SDK locally. No third-party script host, import map,
// or runtime CDN dependency is needed by the optional account controls.
export async function buildAccount(root, out) {
  await build({
    entryPoints: [join(root, 'public', 'account.js')],
    outfile: join(out, 'public', 'account.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    minify: true,
    legalComments: 'eof',
  });
}
