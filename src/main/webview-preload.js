// Webview preload - hide Electron detection markers
// This script runs in the context of AI websites

// Override navigator properties to look like regular Chrome
Object.defineProperty(navigator, 'webdriver', {
  get: () => false
});

// Remove Electron from user agent if present
const originalUserAgent = navigator.userAgent;
if (originalUserAgent.includes('Electron')) {
  Object.defineProperty(navigator, 'userAgent', {
    get: () => originalUserAgent.replace(/\sElectron\/\S+/, '')
  });
}

// Hide Node.js integration markers
if (window.process) {
  window.process = undefined;
}

if (window.require) {
  window.require = undefined;
}

if (window.module) {
  window.module = undefined;
}

if (window.__dirname) {
  window.__dirname = undefined;
}

if (window.__filename) {
  window.__filename = undefined;
}
