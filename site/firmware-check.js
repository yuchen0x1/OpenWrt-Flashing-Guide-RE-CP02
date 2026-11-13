(function () {
  'use strict';
  const form = document.getElementById('firmware-check');
  const fileInput = document.getElementById('firmware-file');
  const select = document.getElementById('firmware-expected');
  const result = document.getElementById('firmware-result');
  const submit = document.getElementById('firmware-verify');
  const retry = document.getElementById('firmware-reload');
  const tools = window.GuideTools;
  let entries = [];
  let generation = 0;

  function status(message, kind = '') {
    result.textContent = message;
    result.dataset.state = kind;
  }
  function changed() {
    generation++;
    submit.disabled = !entries.length;
    form.setAttribute('aria-busy', 'false');
    status('已更改选择，请重新校验。');
  }
  async function loadManifest() {
    retry.disabled = true;
    submit.disabled = true;
    status('正在读取仓库 SHA256 清单…');
    try {
      entries = tools.parseChecksums(await tools.createTextLoader(window.fetch.bind(window))('../firmware/SHA256SUMS.txt'));
      select.replaceChildren(new Option('选择要核对的清单条目', ''));
      entries.forEach((entry, index) => select.add(new Option(entry.name, String(index))));
      select.disabled = false;
      submit.disabled = false;
      retry.hidden = true;
      status('清单已就绪，共 ' + entries.length + ' 项。选择本地文件开始校验。');
    } catch (error) {
      status('清单读取失败：' + error.message, 'error');
      retry.hidden = false;
    } finally { retry.disabled = false; }
  }
  fileInput.addEventListener('change', () => {
    changed();
    const index = entries.findIndex(entry => entry.name === fileInput.files[0]?.name);
    select.value = index >= 0 ? String(index) : '';
  });
  select.addEventListener('change', changed);
  retry.addEventListener('click', loadManifest);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const file = fileInput.files[0];
    const expected = select.value === '' ? null : entries[Number(select.value)];
    if (!file || !expected) { status('请选择文件，并选择对应的清单条目。', 'error'); return; }
    const request = ++generation;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status('正在本地读取并计算 SHA256：' + file.name + '…');
    try {
      const digest = await tools.hashFile(file, window.crypto?.subtle);
      if (request !== generation) return;
      const state = tools.compareFile(file, digest, expected);
      const message = state === 'match' ? '文件名与 SHA256 均匹配。'
        : state === 'renamed' ? 'SHA256 匹配，但文件名不同；请核对文件用途与来源。'
          : 'SHA256 不匹配，请停止使用此文件。';
      status(message + '\n实际：' + digest + '\n预期：' + expected.sha256, state);
    } catch (error) {
      if (request === generation) status('无法完成校验：' + error.message, 'error');
    } finally {
      if (request === generation) { submit.disabled = false; form.setAttribute('aria-busy', 'false'); }
    }
  });
  loadManifest();
})();
