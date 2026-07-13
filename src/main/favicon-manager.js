const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');

class FaviconManager {
  constructor() {
    this.faviconDir = path.join(app.getPath('userData'), 'favicons');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.faviconDir)) {
      fs.mkdirSync(this.faviconDir, { recursive: true });
    }
  }

  getLocalPath(siteId) {
    return path.join(this.faviconDir, `${siteId}.ico`);
  }

  hasLocalFavicon(siteId) {
    return fs.existsSync(this.getLocalPath(siteId));
  }

  getLocalUrl(siteId) {
    if (this.hasLocalFavicon(siteId)) {
      return `file://${this.getLocalPath(siteId).replace(/\\/g, '/')}`;
    }
    return null;
  }

  async fetchAndSave(url, siteId) {
    return new Promise((resolve, reject) => {
      if (!url || !siteId) {
        reject(new Error('URL and siteId are required'));
        return;
      }

      const request = net.request(url);
      const chunks = [];

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const localPath = this.getLocalPath(siteId);
            fs.writeFileSync(localPath, buffer);
            resolve(this.getLocalUrl(siteId));
          } catch (err) {
            reject(err);
          }
        });

        response.on('error', (err) => {
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });

      request.end();
    });
  }

  async fetchFaviconFromDomain(domain) {
    // Try common favicon locations
    const urls = [
      `https://${domain}/favicon.ico`,
      `https://${domain}/favicon.png`,
      `https://${domain}/apple-touch-icon.png`,
      `https://${domain}/apple-touch-icon-precomposed.png`
    ];

    for (const url of urls) {
      try {
        const result = await this.tryFetch(url);
        if (result) return url;
      } catch (err) {
        // Continue to next URL
      }
    }

    // Try Google's favicon service as fallback
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  async tryFetch(url) {
    return new Promise((resolve, reject) => {
      const request = net.request(url);

      request.on('response', (response) => {
        if (response.statusCode === 200) {
          resolve(url);
        } else {
          reject(new Error(`HTTP ${response.statusCode}`));
        }
        response.destroy();
      });

      request.on('error', (err) => {
        reject(err);
      });

      request.end();
    });
  }

  deleteLocal(siteId) {
    const localPath = this.getLocalPath(siteId);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  }
}

module.exports = new FaviconManager();
