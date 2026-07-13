function getProtocol(value) {
  if (!value) return null;
  try {
    return new URL(String(value)).protocol;
  } catch {
    return null;
  }
}

function isRemoteUrl(value) {
  return ['http:', 'https:'].includes(getProtocol(value));
}

class FaviconCache {
  constructor({
    getSites,
    updateSite,
    getLocalUrl,
    fetchAndSave,
    resolveProxy,
    onUpdated = () => {}
  }) {
    this.getSites = getSites;
    this.updateSite = updateSite;
    this.getLocalUrl = getLocalUrl;
    this.fetchAndSave = fetchAndSave;
    this.resolveProxy = resolveProxy;
    this.onUpdated = onUpdated;
    this.pendingWarm = null;
  }

  getSitesForRenderer() {
    return this.getSites().map(site => {
      const hasFaviconConfiguration = Boolean(site.faviconUrl || site.faviconSourceUrl);
      let localUrl = null;
      if (hasFaviconConfiguration) {
        try {
          localUrl = this.getLocalUrl(site.id);
        } catch {
          localUrl = null;
        }
      }
      return { ...site, faviconUrl: localUrl };
    });
  }

  warm() {
    if (!this.pendingWarm) {
      this.pendingWarm = this.runWarm().finally(() => {
        this.pendingWarm = null;
      });
    }
    return this.pendingWarm;
  }

  async runWarm() {
    const candidates = this.getSites().filter(site => {
      const localUrl = this.safeGetLocalUrl(site.id);
      const configuredLocalIsReady = getProtocol(site.faviconUrl) === 'file:' && localUrl;
      return !configuredLocalIsReady && Boolean(this.getSourceUrl(site));
    });

    const results = await Promise.all(candidates.map(async site => {
      const sourceUrl = this.getSourceUrl(site);
      try {
        const localUrl = await this.fetchAndSave(
          sourceUrl,
          site.id,
          this.resolveProxy(site)
        );
        this.updateSite(site.id, {
          faviconUrl: localUrl,
          faviconSourceUrl: sourceUrl
        });
        return { siteId: site.id, success: true };
      } catch (error) {
        return { siteId: site.id, success: false, error };
      }
    }));

    const cachedSiteIds = results.filter(result => result.success).map(result => result.siteId);
    const failedSiteIds = results.filter(result => !result.success).map(result => result.siteId);
    if (cachedSiteIds.length > 0) {
      this.onUpdated({ reason: 'favicons-cached', siteIds: cachedSiteIds });
    }
    return { cachedSiteIds, failedSiteIds };
  }

  getSourceUrl(site) {
    if (isRemoteUrl(site.faviconSourceUrl)) return String(site.faviconSourceUrl);
    if (isRemoteUrl(site.faviconUrl)) return String(site.faviconUrl);
    return null;
  }

  safeGetLocalUrl(siteId) {
    try {
      return this.getLocalUrl(siteId);
    } catch {
      return null;
    }
  }
}

module.exports = FaviconCache;
