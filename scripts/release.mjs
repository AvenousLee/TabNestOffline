// npm run release: after the build, pack dist/ as release/TabNest-v<version>.zip,
// ready to attach to a GitHub release tagged v<version> (see README → Releasing a new version).
// The version comes from public/manifest.json; users' "Check for updates" compares with it.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')).version;
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
if (pkgVersion !== version) console.warn(`Note: package.json says ${pkgVersion}, manifest.json says ${version}. The manifest's version is the one users see.`);

const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'manifest.json'))) throw new Error('dist/ has no build. Run "npm run build" first (npm run release does).');

const outDir = resolve(root, 'release');
mkdirSync(outDir, { recursive: true });
const zip = resolve(outDir, `TabNest-v${version}.zip`);
rmSync(zip, { force: true });

// Files at the top of the zip (manifest.json directly inside), so users can unzip over their TabNest folder.
if (process.platform === 'win32') {
  // Windows' own tar writes standard zip paths (PowerShell's Compress-Archive uses backslashes).
  const tar = resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zip, ...readdirSync(dist)], { cwd: dist, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zip, '.'], { cwd: dist, stdio: 'inherit' });
}

console.log(`\nMade ${zip}`);
console.log(`Next: on GitHub → Releases → Draft a new release → tag v${version} → attach this zip → Publish.`);
