const { app, net, session } = require('electron');
const path = require('path');
const fs = require('fs');

const REQUEST_TIMEOUT_MS = 15000;

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
    const safeId = String(siteId || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(safeId)) {
      throw new Error('Invalid site ID for favicon storage');
    }
    return path.join(this.faviconDir, `${safeId}.ico`);
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

  async fetchAndSave(url, siteId, proxyConfig) {
    this.getLocalPath(siteId);
    const remoteUrl = this.normalizeRemoteUrl(url);
    const ses = await this.getRequestSession(`favicon-${siteId}`, proxyConfig);
    return new Promise((resolve, reject) => {
      const request = net.request({ url: remoteUrl, session: ses });
      const chunks = [];
      let size = 0;
      let settled = false;
      let timeoutId;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };

      timeoutId = setTimeout(() => {
        fail(new Error('Favicon request timed out'));
        request.abort();
      }, REQUEST_TIMEOUT_MS);

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          response.destroy();
          fail(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            response.destroy();
            fail(new Error('Favicon is larger than 2 MB'));
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          if (settled) return;
          try {
            const buffer = Buffer.concat(chunks);
            if (buffer.length === 0) throw new Error('Favicon response was empty');
            const localPath = this.getLocalPath(siteId);
            fs.writeFileSync(localPath, buffer);
            settled = true;
            clearTimeout(timeoutId);
            resolve(this.getLocalUrl(siteId));
          } catch (err) {
            fail(err);
          }
        });

        response.on('error', fail);
      });

      request.on('error', fail);

      request.end();
    });
  }

  async fetchFaviconFromDomain(domain, proxyConfig) {
    const safeDomain = this.normalizeDomain(domain);
    // Try common favicon locations
    const urls = [
      `https://${safeDomain}/favicon.ico`,
      `https://${safeDomain}/favicon.png`,
      `https://${safeDomain}/apple-touch-icon.png`,
      `https://${safeDomain}/apple-touch-icon-precomposed.png`
    ];

    for (const url of urls) {
      try {
        const result = await this.tryFetch(url, proxyConfig);
        if (result) return url;
      } catch (err) {
        // Continue to next URL
      }
    }

    // Try Google's favicon service as fallback
    return this.getGoogleFaviconUrl(safeDomain);
  }

  async tryFetch(url, proxyConfig) {
    const remoteUrl = this.normalizeRemoteUrl(url);
    const ses = await this.getRequestSession('favicon-detect', proxyConfig);
    return new Promise((resolve, reject) => {
      const request = net.request({ url: remoteUrl, session: ses });
      let settled = false;
      let timeoutId;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        callback(value);
      };

      timeoutId = setTimeout(() => {
        finish(reject, new Error('Favicon detection timed out'));
        request.abort();
      }, REQUEST_TIMEOUT_MS);

      request.on('response', (response) => {
        if (response.statusCode === 200) {
          finish(resolve, url);
        } else {
          finish(reject, new Error(`HTTP ${response.statusCode}`));
        }
        response.destroy();
      });

      request.on('error', (err) => {
        finish(reject, err);
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

  getGoogleFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(this.normalizeDomain(domain))}&sz=64`;
  }

  normalizeRemoteUrl(value) {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Favicon URL must use http or https');
    }
    return url.toString();
  }

  normalizeDomain(value) {
    const domain = String(value || '').trim().toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
      throw new Error('Invalid favicon domain');
    }
    return domain;
  }

  async getRequestSession(partition, proxyConfig) {
    const ses = session.fromPartition(partition);
    if (!proxyConfig || proxyConfig === 'system') {
      await ses.setProxy({ mode: 'system' });
    } else if (proxyConfig && proxyConfig !== 'direct') {
      await ses.setProxy({
        mode: 'fixed_servers',
        proxyRules: proxyConfig.startsWith('socks')
          ? proxyConfig
          : `http=${proxyConfig};https=${proxyConfig}`
      });
    } else if (proxyConfig === 'direct') {
      await ses.setProxy({ mode: 'direct' });
    }
    await ses.closeAllConnections?.();
    return ses;
  }
}

module.exports = new FaviconManager();
