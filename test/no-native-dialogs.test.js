const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

test('renderer code does not invoke browser-native alert, confirm, or prompt dialogs', () => {
  const rendererDirectory = path.join(__dirname, '..', 'src', 'renderer');
  const findings = [];

  for (const fileName of readdirSync(rendererDirectory).filter(name => name.endsWith('.js'))) {
    const lines = readFileSync(path.join(rendererDirectory, fileName), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/(?:\bwindow\s*\.\s*)?\b(?:alert|confirm|prompt)\s*\(/.test(line)) {
        findings.push(`${fileName}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(findings, [], `Native dialog calls remain:\n${findings.join('\n')}`);
});
