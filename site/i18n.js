(function () {
  const messages = {
    'zh-CN': {
      quickNav: '快速导航', overview: '总览', journey: '流程', firmware: '固件', docs: '文档',
      commandSearch: '命令 / 搜索',
      heroTitle: '把一台路由器，<br><span><em>变成你的网络实验室。</em></span>',
      heroLede: '面向 JDCloud RE-CP-02 的 OpenWrt 刷机、恢复与家庭网关配置指南。每一步都标注前置条件、风险等级与可验证结果。',
      startSetup: '开始配置 <span>↗</span>', viewFirmware: '查看固件 <span>↓</span>',
      journeyTitle: '你现在在哪一步？', journeyLead: '选择当前状态，直接进入对应的操作路径。',
      firmwareTitle: '固件，先确认再写入。', firmwareLead: '官方基线优先，个人构建和历史文件单独标注。所有镜像都必须核对设备型号与 SHA256。',
      docsTitle: '从准备到持续升级，逐章展开。', browseDocs: '浏览全部文档 <span>↗</span>'
    },
    'en-US': {
      quickNav: 'Quick navigation', overview: 'Overview', journey: 'Workflow', firmware: 'Firmware', docs: 'Docs',
      commandSearch: 'Commands / Search',
      heroTitle: 'Turn a router into<br><span><em>your network lab.</em></span>',
      heroLede: 'A practical OpenWrt flashing, recovery, and gateway configuration guide for JDCloud RE-CP-02. Each step includes prerequisites, risk level, and a verifiable result.',
      startSetup: 'Start setup <span>↗</span>', viewFirmware: 'View firmware <span>↓</span>',
      journeyTitle: 'Where are you now?', journeyLead: 'Choose your current state to open the matching path.',
      firmwareTitle: 'Confirm firmware before writing.', firmwareLead: 'The official baseline comes first. Personal builds and historical files are marked separately. Always verify the device model and SHA256.',
      docsTitle: 'Follow the guide from preparation to upgrades.', browseDocs: 'Browse all docs <span>↗</span>'
    }
  };
  const storageKey = 're-cp-02-locale';
  function resolve(setting) {
    if (setting === 'zh-CN' || setting === 'en-US') return setting;
    const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'zh-CN']);
    for (const value of candidates) {
      const normalized = String(value).toLowerCase();
      if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
      if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
    }
    return 'zh-CN';
  }
  function readSetting() {
    try { const value = localStorage.getItem(storageKey); return value === 'zh-CN' || value === 'en-US' ? value : 'auto'; } catch { return 'auto'; }
  }
  function translate(key) {
    return messages[document.documentElement.lang]?.[key] ?? messages['zh-CN'][key] ?? key;
  }
  function apply(setting) {
    const locale = resolve(setting);
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      const value = messages[locale][key];
      if (value != null) element.innerHTML = value;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      const spec = element.dataset.i18nAttr || '';
      const [attribute, key] = spec.split(':');
      if (attribute && key && messages[locale][key] != null) element.setAttribute(attribute, messages[locale][key]);
    });
    const select = document.getElementById('locale-toggle');
    if (select) select.value = setting;
    try { localStorage.setItem(storageKey, setting); } catch { /* private mode */ }
  }
  window.SiteI18n = { apply, resolve, readSetting, translate };
  const start = () => {
    const select = document.getElementById('locale-toggle');
    const setting = readSetting();
    apply(setting);
    select?.addEventListener('change', () => apply(select.value));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
