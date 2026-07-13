const APPLICATION_PRODUCT_PATTERN = /\s(?:AI\s+Workspace|ai-workspace|MultiAIChat|Multi\s+AI\s+Chat)\/[^\s]+/gi;

function toChromeUserAgent(userAgent) {
  if (typeof userAgent !== 'string') return '';

  return userAgent
    .replace(/\sElectron\/[^\s]+/gi, '')
    .replace(APPLICATION_PRODUCT_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

module.exports = { toChromeUserAgent };
