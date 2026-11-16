// npm run release: after the build, pack dist/ as release/TabNest-v<version>.zip, then mark
// the release in git: tag v<version> on the current commit of main and move the `release`
// branch to it (fast-forward only), both pushed. So `release` always shows the latest
// released code and each tag shows exactly what a version contained.
// npm run release -- --no-git only makes the zip. (See README → Releasing a new version.)
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

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const tag = `v${version}`;
if (process.argv.includes('--no-git')) {
  console.log('Skipped git (--no-git).');
} else {
  const stop = (why) => {
    console.error(`\nNot tagged: ${why}\nThe zip is made; fix this and run npm run release again.`);
    process.exit(1);
  };
  // A release is exactly one commit everyone can see: committed, on main, pushed.
  if (git('status', '--porcelain')) stop('there are uncommitted changes. Commit them first.');
  const head = git('rev-parse', 'HEAD');
  git('fetch', 'origin', 'main');
  if (git('rev-parse', 'origin/main') !== head) {
    try {
      git('merge-base', '--is-ancestor', 'origin/main', head);
    } catch {
      stop('this commit is not on main (or main moved on GitHub). Release from the latest main.');
    }
    git('push', 'origin', 'HEAD:refs/heads/main');
  }
  let tagged = '';
  try {
    tagged = git('rev-parse', `${tag}^{commit}`);
  } catch {
    /* no such tag yet */
  }
  if (tagged && tagged !== head) stop(`${tag} already marks an older commit. Raise the version in public/manifest.json and package.json.`);
  if (!tagged) git('tag', '-a', tag, '-m', `TabNest ${version}`);
  git('push', 'origin', tag);
  // Fast-forward only (no force): the release branch only ever moves on to newer releases.
  git('push', 'origin', 'HEAD:refs/heads/release');
  console.log(`Tagged ${tag} and moved the release branch to ${head.slice(0, 7)} (both pushed).`);
}

const repo = /github\.com\/([^/'"]+\/[^/'"#?]+)/.exec(readFileSync(resolve(root, 'src/about.ts'), 'utf8'))?.[1];
console.log('Next: publish the GitHub release and attach this zip:');
console.log(repo ? `  https://github.com/${repo}/releases/new?tag=${tag}&title=TabNest%20${version}` : `  GitHub → Releases → Draft a new release → tag ${tag}`);
