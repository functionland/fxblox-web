// GitHub Pages SPA fallback + version stamp.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(dist + 'index.html')) {
  console.error('postbuild: dist/index.html missing — run vite build first');
  process.exit(1);
}
copyFileSync(dist + 'index.html', dist + '404.html');
// Custom domain: only emit CNAME when the deploy is for blox.fx.land (repo variable PAGES_CNAME).
// Shipping it before the DNS record exists would make GitHub Pages redirect the github.io staging URL
// to a dead host.
if (process.env.PAGES_CNAME) {
  writeFileSync(dist + 'CNAME', process.env.PAGES_CNAME.trim() + '\n');
  console.log(`postbuild: wrote CNAME ${process.env.PAGES_CNAME.trim()}`);
}
writeFileSync(
  dist + 'version.json',
  JSON.stringify(
    {
      version: process.env.npm_package_version ?? '0.0.0',
      sha: (process.env.GITHUB_SHA ?? 'dev').slice(0, 7),
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log('postbuild: wrote 404.html and version.json');
