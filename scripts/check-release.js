'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extractReleaseNotes } = require('./build-release-notes');

const history = [
  '# History', '',
  '## 1.2.3 - 2026-11-26', '',
  '### \u{1f4e2} \u7248\u672c\u6982\u8ff0', '',
  'A supported fix.', '',
  '### Fixes', '',
  '```sh', '### This is a shell comment', '## This is code, not a release', '```', '',
  '~~~text', '### This is code too', '~~~', '',
  '## 1.2.2 - 2026-11-25', '', 'Older version.'
].join('\n');
const notes = extractReleaseNotes(history, 'v1.2.3');
assert(notes.startsWith('## \u{1f4e2} \u7248\u672c\u6982\u8ff0\n'));
assert(!notes.includes('## 1.2.3 -'));
assert(!notes.includes('Older version.'));
assert(notes.includes('\n## Fixes\n'));
assert(notes.includes('```sh\n### This is a shell comment\n## This is code, not a release\n```'));
assert(notes.includes('~~~text\n### This is code too\n~~~'));
assert.throws(() => extractReleaseNotes(history, 'v9.9.9'), /Missing release notes/);
assert.throws(() => extractReleaseNotes(history, '1.2.3'), /Invalid release tag/);
assert.throws(() => extractReleaseNotes('## 1.2.3 - 2026-11-26\n', 'v1.2.3'), /Empty release notes/);

const root = path.resolve(__dirname, '..');
const checks = fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8');
const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
assert.equal((checks.match(/ref: \$\{\{ inputs\.ref \|\| github\.ref \}\}/g) || []).length, 2,
  'Both complete checks must validate the requested release ref.');
assert(release.includes('ref: ${{ inputs.tag || github.ref }}'),
  'Manual release builds must run checks against the requested tag.');
assert(release.includes('--title "OpenWrt \u5237\u673a\u6307\u5357 $RELEASE_TAG"'));

const project = JSON.parse(fs.readFileSync(path.join(root, 'project-version.json'), 'utf8'));
const historyText = fs.readFileSync(path.join(root, 'docs/releases/release-notes.md'), 'utf8');
assert(extractReleaseNotes(historyText, 'v' + project.version).startsWith('## \u{1f4e2} \u7248\u672c\u6982\u8ff0\n'),
  'The current release body must start with the release template overview.');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openwrt-release-check-'));
try {
  const output = path.join(temporary, 'metadata.json');
  const script = path.join(root, 'scripts/build-release-metadata.js');
  const build = spawnSync(process.execPath, [script, '--version', 'v' + project.version, '--output', output], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const metadata = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(metadata.projectVersion, project.version);
  assert.equal(metadata.releaseUrl, project.releaseUrl);
  for (const tag of [project.version, 'v999.999.999']) {
    const rejected = spawnSync(process.execPath, [script, '--version', tag, '--output', output], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0, 'Invalid and mismatched project versions must fail before release.');
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log('PASS release template, fenced code, metadata versions and requested-tag checks');
