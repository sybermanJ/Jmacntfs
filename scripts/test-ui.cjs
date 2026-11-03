// UI contract tests use an isolated browser and mocked IPC; no physical disk is touched.
// Run against `npm run dev` (http://127.0.0.1:1420). Set SCREENSHOT_DIR to save screenshots.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const URL = process.env.TEST_UI_URL || 'http://127.0.0.1:1420';
const SHOTS = process.env.SCREENSHOT_DIR || '/tmp/macntfs-qa';
const DEFAULT_VOLUMES = [
  {uuid: 'backup', parent: 'disk4', name: 'BackUp', id: 'disk4s1', size: 512100000000, free: 311800000000, mount: '/Volumes/BackUp', writable: true},
  {uuid: 'work', parent: 'disk5', name: '工作盘', id: 'disk5s2', size: 1000200000000, free: 266300000000, mount: '/Volumes/工作盘', writable: false},
  {uuid: 'work-2', parent: 'disk5', name: 'Archive', id: 'disk5s3', size: 200000000000, free: 0, mount: '', writable: false},
  {uuid: 'camera', parent: 'disk6', name: '相机卡', id: 'disk6s1', size: 64000000000, free: 0, mount: '', writable: false},
];

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined});
  const page = await browser.newPage({viewport: {width: 1060, height: 760}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(volumes => {
    const callbacks = new Map(); let serial = 0;
    let settings = JSON.parse(localStorage.getItem('qa-settings') || '{"backend":"Auto","dark":false,"auto_mount":true,"theme":"Stone","language":"zh-Hans"}');
    window.__QA_OPS = []; window.__QA_WINDOW = [];
    const env = () => Object.assign({runtime: true, fuse: true, service: true, microvm: true, os: '26.0', runtime_version: '0.4.0', fuse_version: '5.1.3', service_issue: ''}, JSON.parse(localStorage.getItem('qa-env') || '{}'));
    window.__TAURI_INTERNALS__ = {
      transformCallback(cb) { const id = ++serial; callbacks.set(id, cb); return id; },
      unregisterCallback(id) { callbacks.delete(id); },
      invoke: async (cmd, args) => {
        if (cmd === 'snapshot') return {version: '0.4.0', required_update: JSON.parse(localStorage.getItem('qa-required') || 'null'), update_blockers: Number(localStorage.getItem('qa-blockers') || 0), volumes: JSON.parse(localStorage.getItem('qa-volumes') || 'null') || volumes, settings, environment: env(), monitor: {busy: !!localStorage.getItem('qa-busy'), last_event: localStorage.getItem('qa-event') || '', last_error: ''}};
        if (cmd === 'diagnose') return {schema: 1, version: 'test', backend: settings.backend, checks: [{code: 'helper', title: '后台助手', status: 'pass', detail: '已验证助手连接与版本', action: ''}, {code: 'permission', title: '磁盘访问权限', status: 'unknown', detail: '助手连接不能证明磁盘访问权限；连接磁盘并尝试挂载后确认', action: 'permissions'}], volumes: [{index: 1, mounted: true, writable: true}]};
        if (cmd === 'set_auto_mount') { settings.auto_mount = args.enabled; localStorage.setItem('qa-settings', JSON.stringify(settings)); return null; }
        if (cmd === 'save_settings') { settings = args.settings; localStorage.setItem('qa-settings', JSON.stringify(settings)); return null; }
        if (cmd === 'operate') { if (localStorage.getItem('qa-error')) throw '模拟操作失败'; window.__QA_OPS.push(args); if (localStorage.getItem('qa-slow')) await new Promise(r => setTimeout(r, 600)); return '操作完成'; }
        if (cmd === 'check_updates') { if (localStorage.getItem('qa-check-error')) throw 'offline'; return JSON.parse(localStorage.getItem('qa-required') || 'null'); }
        if (cmd === 'install_update') { window.__QA_WINDOW.push('install'); throw 'simulated download failure'; }
        if (cmd === 'panel_action') { window.__QA_WINDOW.push(args.action); return null; }
        if (cmd === 'plugin:event|listen') return ++serial;
        if (cmd === 'plugin:event|unlisten') return null;
        throw new Error('Unexpected IPC ' + cmd);
      },
    };
  }, DEFAULT_VOLUMES);
  fs.mkdirSync(SHOTS, {recursive: true});
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({path: `${SHOTS}/${name}.png`}); };
  const ops = () => page.evaluate(() => window.__QA_OPS);
  const set = (k, v) => page.evaluate(([k, v]) => v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v), [k, v]);
  const noOverflow = async label => { if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(label + ' horizontal overflow'); };
  const cssVar = name => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

  await page.goto(URL);
  await page.getByRole('heading', {name: 'BackUp', exact: true}).waitFor();

  // Legacy Stone settings migrate to the 宣纸 scheme in light mode.
  if (await cssVar('--bg') !== '#F8F4ED') throw Error('legacy Stone did not map to xuan light');
  // Disk cards: free space, read-only reason, per-disk actions.
  await page.getByText('311.8 GB 可用').waitFor();
  await page.getByText('已以只读方式挂载').waitFor();
  await noOverflow('disks');
  await shot('disks-light');
  await page.getByRole('button', {name: '打开 Finder', exact: true}).click();
  if ((await ops()).at(-1).action !== 'open') throw Error('Finder action not sent');

  // Eject asks first and lists sibling partitions on the same physical disk.
  await page.locator('.disk').filter({hasText: '工作盘'}).getByRole('button', {name: '安全推出', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Archive (disk5s3)').waitFor();
  await shot('eject-confirm');
  await dialog.getByRole('button', {name: '取消', exact: true}).click();
  if ((await ops()).some(o => o.action === 'eject')) throw Error('eject ran without confirmation');
  await page.locator('.disk').filter({hasText: '工作盘'}).getByRole('button', {name: '安全推出', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: '安全推出', exact: true}).click();
  await page.waitForFunction(() => window.__QA_OPS.at(-1)?.action === 'eject');
  if ((await ops()).at(-1).volume.uuid !== 'work') throw Error('eject targeted wrong volume');

  // Busy state shows on the affected card only.
  await set('qa-slow', '1');
  await page.locator('.disk').filter({hasText: '相机卡'}).getByRole('button', {name: '开启读写', exact: true}).click();
  await page.locator('.disk[data-state=busy]').filter({hasText: '相机卡'}).waitFor();
  if (await page.locator('.disk[data-state=busy]').count() !== 1) throw Error('busy shown on more than one card');
  await page.locator('.disk[data-state=busy]').waitFor({state: 'detached'});
  await set('qa-slow', null);

  // Success notices clear themselves; the close button is labelled.
  await page.getByRole('button', {name: '关闭提示'}).waitFor();
  await page.getByRole('button', {name: '关闭提示'}).waitFor({state: 'detached', timeout: 7000});

  // Colour schemes recolour the whole UI and persist.
  await page.getByRole('button', {name: '设置与更新', exact: true}).click();
  await page.getByRole('radio', {name: /青瓷/}).click();
  if (await cssVar('--bg') !== '#EEF3EF' || await cssVar('--inset') !== '#E1EAE4') throw Error('scheme did not recolour backgrounds');
  await page.getByRole('radio', {name: '深色', exact: true}).click();
  if (await cssVar('--bg') !== '#141C18') throw Error('dark mode not applied');
  await shot('settings-qingci-dark');
  await page.reload();
  await page.getByRole('heading', {name: 'BackUp', exact: true}).waitFor();
  if (await cssVar('--bg') !== '#141C18') throw Error('scheme not persisted');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('qa-settings')));
  if (saved.scheme !== 'qingci' || saved.appearance !== 'dark') throw Error('scheme not sent to save_settings');
  await shot('disks-qingci-dark');
  for (const id of ['xuan', 'dailan', 'zhusha', 'songyan']) {
    await page.evaluate(id => { const s = JSON.parse(localStorage.getItem('qa-settings')); s.scheme = id; s.appearance = 'light'; localStorage.setItem('qa-settings', JSON.stringify(s)); }, id);
    await page.reload(); await page.getByRole('heading', {name: 'BackUp', exact: true}).waitFor();
    await shot(`disks-${id}-light`);
  }
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('qa-settings')); s.scheme = 'xuan'; s.appearance = 'system'; localStorage.setItem('qa-settings', JSON.stringify(s)); });
  await page.emulateMedia({colorScheme: 'dark'});
  await page.reload(); await page.getByRole('heading', {name: 'BackUp', exact: true}).waitFor();
  if (await cssVar('--bg') !== '#1A1A1A') throw Error('follow system did not pick dark');
  await page.emulateMedia({colorScheme: 'light'});
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#F8F4ED', null, {timeout: 3000}).catch(() => { throw Error('follow system did not react to OS change'); });

  // Mode switch asks first and is blocked while disks are mounted.
  await page.getByRole('button', {name: '设置与更新', exact: true}).click();
  await page.getByRole('tab', {name: '读写模式与权限'}).click();
  await page.getByRole('radio', {name: /免内核扩展模式/}).click();
  await page.getByRole('dialog').getByRole('button', {name: '切换', exact: true}).waitFor();
  if (!(await page.getByRole('dialog').getByRole('button', {name: '切换', exact: true}).isDisabled())) throw Error('mode switch allowed with mounted disks');
  await shot('mode-confirm');
  await page.keyboard.press('Escape');
  await set('qa-volumes', '[]'); await page.reload();
  await page.getByRole('heading', {name: '等待连接磁盘'}).waitFor();
  await shot('empty');
  await page.getByRole('button', {name: '设置与更新', exact: true}).click();
  await page.getByRole('tab', {name: '读写模式与权限'}).click();
  await page.getByRole('radio', {name: /免内核扩展模式/}).click();
  await page.getByRole('dialog').getByRole('button', {name: '切换', exact: true}).click();
  await page.locator('.mode-pill.exp').waitFor();
  if (JSON.parse(await page.evaluate(() => localStorage.getItem('qa-settings'))).backend !== 'Microvm') throw Error('backend not saved');
  await page.getByRole('radio', {name: /稳定模式/}).click();
  await page.getByRole('dialog').getByRole('button', {name: '切换', exact: true}).click();
  await page.locator('.mode-pill:not(.exp)').waitFor();

  // Diagnostics keep unconfirmed permission as unknown.
  await page.getByRole('tab', {name: '运行诊断'}).click();
  await page.getByRole('button', {name: '开始检查', exact: true}).click();
  await page.locator('.diagnostic-check').last().waitFor();
  if (await page.locator('.diagnostic-check[data-status=unknown]').count() !== 1) throw Error('unconfirmed disk permission marked green');

  // Setup opens automatically when something needs the user, at the first open step.
  await set('qa-volumes', null);
  await set('qa-env', '{"fuse":false}');
  await page.reload();
  await page.locator('.setup').waitFor();
  if (!(await page.locator('.step[aria-current=step]').textContent()).includes('允许驱动')) throw Error('setup did not open at first unfinished step');
  await page.locator('.alert-dot').waitFor();
  await shot('setup');
  await page.getByRole('button', {name: /磁盘访问/}).click();
  await page.getByRole('button', {name: '复制'}).waitFor();
  await set('qa-env', null);
  await page.reload();
  await page.getByRole('heading', {name: 'BackUp', exact: true}).waitFor();
  if (await page.locator('.alert-dot').count()) throw Error('setup marked incomplete when environment is ready');

  // Widths.
  for (const [w, h] of [[1440, 1024], [760, 600]]) { await page.setViewportSize({width: w, height: h}); await noOverflow(w + 'px'); }
  await page.setViewportSize({width: 1060, height: 760});

  // Tray panel.
  await page.setViewportSize({width: 420, height: 540});
  await page.goto(URL + '/?panel');
  await page.locator('.panel-volume').first().waitFor();
  if (!(await page.locator('.panel-volume').first().getByRole('button', {name: '开启读写', exact: true}).isDisabled())) throw Error('writable volume allows mount');
  await page.locator('.panel-volume').first().getByRole('button', {name: '打开 Finder', exact: true}).click();
  if ((await ops()).at(-1).action !== 'open') throw Error('panel Finder failed');
  await page.getByRole('switch', {name: '插入后自动开启读写'}).click();
  if (await page.getByRole('switch').getAttribute('aria-checked') !== 'false') throw Error('panel toggle not saved');
  if (!(await page.evaluate(() => [document.documentElement, document.body, document.querySelector('#app')].every(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')))) throw Error('opaque popup document');
  await page.getByRole('button', {name: '打开主窗口', exact: true}).click();
  await page.keyboard.press('Escape');
  if ((await page.evaluate(() => window.__QA_WINDOW)).join(',') !== 'show,hide') throw Error('panel navigation incorrect');
  await page.screenshot({path: `${SHOTS}/panel.png`, omitBackground: true});

  // Languages.
  await page.setViewportSize({width: 1060, height: 760});
  await page.goto(URL);
  for (const [label, heading, open] of [['English', 'Settings & updates', 'Open Finder'], ['繁體中文', '設置與更新', '打開 Finder'], ['日本語', '設定と更新', 'Finder で開く'], ['简体中文', '设置与更新', '打开 Finder']]) {
    await page.locator('aside .nav').nth(2).click();
    await page.getByRole('radio', {name: label, exact: true}).click();
    await page.getByRole('heading', {name: heading, exact: true}).waitFor();
    await page.locator('aside .nav').first().click();
    await page.getByRole('button', {name: open, exact: true}).first().waitFor();
    await noOverflow(label);
    if (label === 'English') await shot('disks-english');
  }

  // Required update gate.
  await set('qa-required', '{"version":"0.5.0"}');
  await set('qa-blockers', '1');
  await page.reload();
  await page.getByRole('dialog', {name: '需要更新'}).waitFor();
  if (!(await page.getByRole('button', {name: '立即更新', exact: true}).isDisabled())) throw Error('update allowed with active mounts');
  await shot('required-update');
  await set('qa-blockers', null); await page.reload();
  await page.getByRole('button', {name: '立即更新', exact: true}).click();
  await page.locator('.update-gate [role=alert]').getByText(/simulated download failure/).waitFor();
  if (!(await page.getByRole('dialog', {name: '需要更新'}).isVisible())) throw Error('failure cleared mandatory gate');
  await set('qa-required', null); await set('qa-check-error', '1');
  await page.reload();
  await page.getByRole('button', {name: '打开 Finder', exact: true}).waitFor();
  if (await page.getByRole('dialog').count()) throw Error('offline update check locked app');

  const resolved = await page.evaluate(async () => { const {resolveLanguage} = await import('/i18n.js'); return ['zh-CN', 'zh-TW', 'zh-HK', 'ja-JP', 'en-US', 'fr-FR'].map(l => resolveLanguage('auto', l)); });
  if (resolved.join(',') !== 'zh-Hans,zh-Hant,zh-Hant,ja,en,en') throw Error('system language mapping incorrect');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS: scheme migration/switch/persist/follow-system; disk cards, eject confirm, per-disk busy, auto-dismiss; mode confirm and block; diagnostics; setup auto-open; widths; tray panel; four languages; required update; no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
