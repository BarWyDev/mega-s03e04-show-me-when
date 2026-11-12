// Builds dist/ from app/ and stamps the git sha into it (R6): <meta name="build"> and the footer.
// Refuses a dirty tree, because then the sha would name a build that is not the one on screen.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
if (sh('git status --porcelain') !== '' && !process.argv.includes('--allow-dirty')) {
  console.error('Working tree is dirty: commit first, so the sha names this build.');
  process.exit(1);
}
const sha = sh('git rev-parse HEAD');
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8');
const stamped = html
  .replace('<meta name="build" content="dev" />', `<meta name="build" content="${sha}" />`)
  .replace('<span data-testid="build-sha">dev</span>', `<span data-testid="build-sha">${sha}</span>`);
if (stamped.split(sha).length !== 3) {
  console.error('Build stamp failed: index.html does not have both placeholders.');
  process.exit(1);
}
writeFileSync('dist/index.html', stamped);
console.log(sha);
