const { session } = require('electron');

const sessions = new Map();

function getSession(partition) {
  if (!sessions.has(partition)) {
    const ses = session.fromPartition(partition);
    sessions.set(partition, ses);
  }
  return sessions.get(partition);
}

async function setProxy(partition, proxyConfig) {
  const ses = getSession(partition);

  if (!proxyConfig || proxyConfig === 'direct') {
    await ses.setProxy({ mode: 'direct' });
  } else if (proxyConfig === 'system') {
    await ses.setProxy({ mode: 'system' });
  } else if (proxyConfig.startsWith('socks')) {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyConfig
    });
  } else {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http=${proxyConfig};https=${proxyConfig}`
    });
  }
}

function clearSessionData(partition) {
  const ses = getSession(partition);
  return ses.clearStorageData();
}

module.exports = { getSession, setProxy, clearSessionData };
