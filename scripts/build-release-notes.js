'use strict';
const fs = require('node:fs');
const path = require('node:path');
const [tag, output] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag || '') || !output) {
  throw new Error('Usage: node scripts/build-release-notes.js vMAJOR.MINOR.PATCH output.md');
}
const root = path.resolve(__dirname, '..');
const history = fs.readFileSync(path.join(root, 'docs/releases/release-notes.md'), 'utf8');
const blocks = history.split(/(?=^## )/m);
const notes = blocks.find(block => block.startsWith('## ' + tag.slice(1) + ' - '));
if (!notes) throw new Error('Missing release notes for ' + tag);
const destination = path.resolve(root, output);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, notes.trim() + '\n', 'utf8');
console.log('Release notes: ' + tag);
