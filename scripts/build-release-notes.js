'use strict';
const fs = require('node:fs');
const path = require('node:path');

function extractReleaseNotes(history, tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) {
    throw new Error('Invalid release tag: ' + tag);
  }
  let fence = null;
  let found = false;
  const lines = [];
  for (const line of history.replace(/\r\n/g, '\n').split('\n')) {
    if (!fence && line.startsWith('## ')) {
      if (found) break;
      if (line.startsWith('## ' + tag.slice(1) + ' - ')) found = true;
      continue;
    }
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    const inFence = !!fence;
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    }
    if (found) lines.push(!inFence && !marker ? line.replace(/^### /, '## ') : line);
  }
  if (!found) throw new Error('Missing release notes for ' + tag);
  const body = lines.join('\n');
  if (!body.trim()) throw new Error('Empty release notes for ' + tag);
  return body.trim() + '\n';
}

if (require.main === module) {
  const [tag, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/build-release-notes.js vMAJOR.MINOR.PATCH output.md');
  const root = path.resolve(__dirname, '..');
  const history = fs.readFileSync(path.join(root, 'docs/releases/release-notes.md'), 'utf8');
  const destination = path.resolve(root, output);
  const notes = extractReleaseNotes(history, tag);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, notes, 'utf8');
  console.log('Release notes: ' + tag);
}

module.exports = { extractReleaseNotes };
