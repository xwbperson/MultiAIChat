function toShortcutString(input) {
  const parts = [];
  if (input.control) parts.push('Ctrl');
  if (input.alt) parts.push('Alt');
  if (input.shift) parts.push('Shift');
  if (input.meta) parts.push('Meta');

  let key = input.key || '';
  if (key === ' ') key = 'Space';
  else if (key === 'Escape') key = 'Esc';
  else if (key === 'Delete') key = 'Del';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

function getKeyboardCommand(input, sites, activeSiteId) {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.isComposing) return null;

  const shortcut = toShortcutString(input);
  const customSite = sites.find(site => site.shortcut === shortcut);
  if (customSite) return { type: 'switch-site', siteId: customSite.id };

  const key = String(input.key || '').toLowerCase();
  const orderedSites = [...sites].sort((left, right) => (left.order || 0) - (right.order || 0));
  if (input.control && key === 'tab' && orderedSites.length > 0) {
    const currentIndex = orderedSites.findIndex(site => site.id === activeSiteId);
    const offset = input.shift ? -1 : 1;
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + offset + orderedSites.length) % orderedSites.length;
    return { type: 'switch-site', siteId: orderedSites[nextIndex].id };
  }

  if (input.control && input.shift && key === 'r') return { type: 'force-refresh' };
  if (key === 'f5' || (input.control && key === 'r')) return { type: 'refresh' };
  if (input.alt && key === 'arrowleft') return { type: 'go-back' };
  if (input.alt && key === 'arrowright') return { type: 'go-forward' };
  if (input.control && key === 'l') return { type: 'focus-url' };
  if (input.control && (key === '+' || key === '=')) return { type: 'zoom', delta: 10 };
  if (input.control && key === '-') return { type: 'zoom', delta: -10 };
  if (input.control && key === '0') return { type: 'zoom-reset' };
  if (input.control && key === 'w') return { type: 'hibernate-current' };
  if (input.control && key === 'n') return { type: 'add-site' };
  if (input.control && key === 'q') return { type: 'quit' };
  return null;
}

module.exports = { getKeyboardCommand, toShortcutString };
