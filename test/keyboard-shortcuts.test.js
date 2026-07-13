const test = require('node:test');
const assert = require('node:assert/strict');

const { getKeyboardCommand } = require('../src/main/keyboard-shortcuts');

test('web content shortcuts honor custom mappings and ordered site cycling', () => {
  const sites = [
    { id: 'second', order: 1, shortcut: 'Ctrl+2' },
    { id: 'first', order: 0, shortcut: 'Ctrl+1' }
  ];

  assert.deepEqual(
    getKeyboardCommand({ type: 'keyDown', key: '1', control: true }, sites, 'second'),
    { type: 'switch-site', siteId: 'first' }
  );
  assert.deepEqual(
    getKeyboardCommand({ type: 'keyDown', key: 'Tab', control: true }, sites, 'first'),
    { type: 'switch-site', siteId: 'second' }
  );
  assert.deepEqual(
    getKeyboardCommand(
      { type: 'keyDown', key: 'Tab', control: true, shift: true },
      sites,
      'first'
    ),
    { type: 'switch-site', siteId: 'second' }
  );
});
