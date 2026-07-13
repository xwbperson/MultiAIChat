const DEFAULT_SITES = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10a37f',
    icon: '🤖',
    proxy: '',
    order: 0,
    accounts: [
      { id: 'chatgpt-default', label: '默认', partition: 'persist:chatgpt-default', isDefault: true }
    ]
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    color: '#d4a574',
    icon: '🧠',
    proxy: '',
    order: 1,
    accounts: [
      { id: 'claude-default', label: '默认', partition: 'persist:claude-default', isDefault: true }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    color: '#4d6bfe',
    icon: '🔷',
    proxy: '',
    order: 2,
    accounts: [
      { id: 'deepseek-default', label: '默认', partition: 'persist:deepseek-default', isDefault: true }
    ]
  },
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn',
    color: '#6236d9',
    icon: '🌙',
    proxy: '',
    order: 3,
    accounts: [
      { id: 'kimi-default', label: '默认', partition: 'persist:kimi-default', isDefault: true }
    ]
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com',
    color: '#fe694a',
    icon: '🤖',
    proxy: '',
    order: 4,
    accounts: [
      { id: 'doubao-default', label: '默认', partition: 'persist:doubao-default', isDefault: true }
    ]
  },
  {
    id: 'copilot',
    name: 'Copilot',
    url: 'https://copilot.microsoft.com',
    color: '#7c3aed',
    icon: '🪟',
    proxy: '',
    order: 5,
    accounts: [
      { id: 'copilot-default', label: '默认', partition: 'persist:copilot-default', isDefault: true }
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    color: '#4285f4',
    icon: '💎',
    proxy: '',
    order: 6,
    accounts: [
      { id: 'gemini-default', label: '默认', partition: 'persist:gemini-default', isDefault: true }
    ]
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    color: '#20b2aa',
    icon: '🔍',
    proxy: '',
    order: 7,
    accounts: [
      { id: 'perplexity-default', label: '默认', partition: 'persist:perplexity-default', isDefault: true }
    ]
  }
];

module.exports = { DEFAULT_SITES };
