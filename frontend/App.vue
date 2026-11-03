<script setup>
import {tr, locale, setLanguage} from './i18n';
import {ref, computed, onMounted, onUnmounted, watch, nextTick} from 'vue';
import {version as appVersion} from '../package.json';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import SetupGuide from './SetupGuide.vue';
import Diagnostics from './Diagnostics.vue';
import driveImage from './assets/drive.png';
import {applyTheme, migrate, SCHEME_LIST, swatch, resolvedMode} from './theme';
import {setupSteps} from './setup';
import {HardDrive, RefreshCw, ArrowUpRight, ShieldCheck, ListChecks, Settings, Download, FolderOpen, LogOut, CheckCircle2, X, ChevronRight} from 'lucide-vue-next';

const state = ref(null), page = ref('disks'), tab = ref('general');
const busy = ref(false), pendingUuid = ref(''), notice = ref(''), error = ref(false);
const backend = ref('Auto'), autoMount = ref(true), scheme = ref('xuan'), appearance = ref('system');
const update = ref(null), updateStatus = ref('checking'), updateError = ref(''), updating = ref(false), progress = ref(0);
const dialog = ref(null);
let firstLoad = true, noticeTimer;

const experimental = computed(() => backend.value === 'Microvm');
const volumes = computed(() => state.value?.volumes || []);
const steps = computed(() => setupSteps(state.value, backend.value));
const setupIncomplete = computed(() => steps.value.some(s => s.status === 'todo'));
const locked = computed(() => busy.value || !!state.value?.monitor.busy);
const required = computed(() => state.value?.required_update || update.value);
const blockers = computed(() => volumes.value.filter(v => v.mount));
const updateText = computed(() => updateStatus.value === 'available' ? tr('需要更新') + ' ' + update.value?.version : updateStatus.value === 'latest' ? tr('已是最新版本') : updateStatus.value === 'offline' ? tr('暂时无法检查更新，离线功能可继续使用') : updateStatus.value === 'error' ? tr('检查更新失败') + ': ' + updateError.value : tr('正在检查更新…'));
watch(() => required.value?.version, async version => { if (version) { await nextTick(); document.querySelector('.update-gate button:not(:disabled)')?.focus(); } });

async function refresh() {
  try {
    state.value = await invoke('snapshot');
    const s = state.value.settings;
    backend.value = s.backend; autoMount.value = s.auto_mount;
    ({scheme: scheme.value, appearance: appearance.value} = migrate(s));
    applyTheme(scheme.value, appearance.value);
    setLanguage(s.language || 'auto');
    if (firstLoad) { firstLoad = false; if (setupIncomplete.value) page.value = 'setup'; }
  } catch (e) { show(e, true); }
}
function show(message, isError = false) {
  notice.value = String(message); error.value = isError;
  clearTimeout(noticeTimer);
  if (!isError && notice.value) noticeTimer = setTimeout(() => { notice.value = ''; }, 5000);
}
async function act(action, volume = null) {
  if (locked.value) return;
  busy.value = true; pendingUuid.value = volume?.uuid || ''; notice.value = '';
  try { show(await invoke('operate', {action, volume, backend: backend.value})); }
  catch (e) { show(e, true); }
  finally { busy.value = false; pendingUuid.value = ''; await refresh(); }
}
async function save() {
  try {
    await invoke('save_settings', {settings: {backend: backend.value, dark: resolvedMode.value === 'dark', theme: state.value?.settings.theme || 'Stone', scheme: scheme.value, appearance: appearance.value, auto_mount: autoMount.value, language: locale.value}});
    await refresh();
  } catch (e) { show(e, true); await refresh(); }
}
function pickLook(nextScheme, nextAppearance) { scheme.value = nextScheme; appearance.value = nextAppearance; applyTheme(nextScheme, nextAppearance); save(); }
async function updates(quiet = false) { try { update.value = await invoke('check_updates'); updateStatus.value = update.value ? 'available' : 'latest'; await refresh(); } catch (e) { updateStatus.value = quiet ? 'offline' : 'error'; updateError.value = String(e); } }
async function installUpdate() { if (!required.value || busy.value || updating.value || state.value?.update_blockers) return; updating.value = true; progress.value = 0; try { await invoke('install_update'); } catch (e) { show(tr('更新失败，请重试') + ': ' + tr(String(e)), true); } finally { updating.value = false; } }

const gb = n => n >= 1e12 ? (n / 1e12).toFixed(2) + ' TB' : (n / 1e9).toFixed(1) + ' GB';
function usage(v) { if (!v.size || !v.mount || v.free == null) return null; const used = Math.max(0, v.size - v.free); return {free: gb(v.free), total: gb(v.size), pct: Math.min(100, Math.round(used / v.size * 100))}; }
function stateOf(v) { if (pendingUuid.value === v.uuid) return 'busy'; if (!v.mount) return 'off'; return v.writable ? 'rw' : 'ro'; }
const siblings = v => volumes.value.filter(x => x.parent && x.parent === v.parent);

function askEject(v) {
  const parts = siblings(v).length ? siblings(v) : [v];
  dialog.value = {title: tr('安全推出「{name}」所在的磁盘？').replace('{name}', v.name || tr('未命名磁盘')), lines: [tr('这块物理磁盘上的所有分区都会一起推出，包括非 NTFS 分区。')], list: parts.map(p => `${p.name || tr('未命名磁盘')} (${p.id})`), hint: tr('请先关闭正在使用这些分区的文件。推出完成后即可拔下磁盘。'), ok: tr('安全推出'), run: () => act('eject', v)};
}
function askBackend(next) {
  if (next === backend.value) return;
  const vm = next === 'Microvm';
  dialog.value = {title: vm ? tr('切换到免内核模式（实验性）？') : tr('切换到稳定模式？'), lines: [vm ? tr('磁盘以网络卷显示。Word 直接编辑及大量文件复制存在兼容性限制，重要文件建议先复制到 Mac 再编辑。每个分区的虚拟机内存上限为 512 MiB。') : tr('一个应用，两种读写方式。免内核模式无需驱动授权；稳定模式需要 macFUSE。'), tr('请先安全推出所有受管理磁盘，再切换读写模式。重新连接后使用所选模式，不会自动回退。')], list: blockers.value.map(v => v.name || v.id), hint: blockers.value.length ? tr('磁盘仍在挂载，模式切换暂不可用。请在「我的磁盘」安全推出后再选择。') : '', ok: tr('切换'), disabled: blockers.value.length > 0, run: () => { backend.value = next; save(); }};
}
function confirmDialog() { const d = dialog.value; dialog.value = null; d?.run(); }
function onKey(e) { if (e.key === 'Escape' && dialog.value) dialog.value = null; }
watch(dialog, async d => { if (d) { await nextTick(); document.querySelector('.dialog .primary:not(:disabled), .dialog .secondary')?.focus(); } });

let timer, unlisteners = [];
onMounted(async () => {
  window.addEventListener('keydown', onKey);
  unlisteners.push(await listen('navigate-settings', () => { page.value = 'settings'; tab.value = 'updates'; }));
  await refresh();
  unlisteners.push(await listen('devices-changed', () => refresh()));
  unlisteners.push(await listen('operation-result', event => { show(event.payload.message, event.payload.error); refresh(); }));
  unlisteners.push(await listen('update-progress', event => { const {received, total} = event.payload; progress.value = total ? Math.round(received / total * 100) : 0; }));
  updates(true);
  timer = setInterval(() => { if (!busy.value) refresh(); }, 8000);
});
onUnmounted(() => { clearInterval(timer); clearTimeout(noticeTimer); window.removeEventListener('keydown', onKey); unlisteners.forEach(u => u?.()); });

const tabs = [{id: 'general', label: '通用'}, {id: 'mode', label: '读写模式与权限'}, {id: 'diagnostics', label: '运行诊断'}, {id: 'updates', label: '更新与关于'}];
const languages = [{id: 'auto', label: '跟随系统'}, {id: 'zh-Hans', label: '简体中文'}, {id: 'zh-Hant', label: '繁體中文'}, {id: 'en', label: 'English'}, {id: 'ja', label: '日本語'}];
const appearances = [{id: 'system', label: '跟随系统'}, {id: 'light', label: '浅色'}, {id: 'dark', label: '深色'}];
</script>

<template>
<div class="shell">
  <aside :inert="required || dialog ? true : undefined">
    <div class="brand">
      <svg class="mark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h4"/><circle cx="17" cy="15" r="1" fill="currentColor"/></svg>
      <span>macntfs</span>
    </div>
    <nav>
      <button class="nav" :aria-current="page === 'disks' ? 'page' : undefined" @click="page = 'disks'"><HardDrive :size="16"/>{{ tr('我的磁盘') }}<span class="count">{{ volumes.length }}</span></button>
      <button class="nav" :aria-current="page === 'setup' ? 'page' : undefined" @click="page = 'setup'"><ListChecks :size="16"/>{{ tr('首次使用向导') }}<span v-if="setupIncomplete" class="alert-dot" :title="tr('还有步骤未完成')"></span></button>
      <button class="nav" :aria-current="page === 'settings' ? 'page' : undefined" @click="page = 'settings'"><Settings :size="16"/>{{ tr('设置与更新') }}</button>
    </nav>
    <div class="aside-footer"><span class="dot" :class="{off: !state?.environment.service}"></span>{{ state?.environment.service ? tr('后台助手已连接') : tr('后台助手未连接') }} · v{{ state?.version || appVersion }}</div>
  </aside>

  <main :inert="required || dialog ? true : undefined">
    <header>
      <div>
        <h1>{{ page === 'disks' ? tr('我的磁盘') : page === 'setup' ? tr('首次使用向导') : tr('设置与更新') }}</h1>
        <p v-if="page === 'disks'">{{ tr('插入 NTFS 磁盘后自动检测。') }}</p>
      </div>
      <div class="header-actions">
        <span class="mode-pill" :class="{exp: experimental}">{{ experimental ? tr('免内核模式 · 实验性') : tr('稳定模式 · macFUSE') }}</span>
        <button class="icon-btn" :aria-label="tr('刷新')" :title="tr('刷新')" :disabled="busy" @click="refresh"><RefreshCw :size="15"/></button>
      </div>
    </header>

    <section v-if="state && (!state.environment.runtime || (backend !== 'Microvm' && !state.environment.fuse))" class="banner warn">
      <ShieldCheck :size="20"/>
      <div><strong>{{ tr('完成读写组件安装') }}</strong><p>{{ !state.environment.runtime ? tr('安装或更新内置读写组件，即可继续使用。') : tr('请安装内置 macFUSE，并完成 macOS 系统授权。') }}</p></div>
      <button class="primary" :disabled="busy" @click="act('install')">{{ tr('安装组件') }}<ArrowUpRight :size="15"/></button>
    </section>
    <section v-if="state && state.environment.runtime && !state.environment.service" class="banner warn">
      <ShieldCheck :size="20"/>
      <div><strong>{{ tr('后台助手连接异常') }}</strong><p>{{ tr(state?.environment.service_issue || '') }}</p><p class="small">{{ tr('已安装完整 PKG 时，请先退出旧版本和测试实例，再从「应用程序」启动。') }}</p></div>
      <button class="primary" :disabled="busy" @click="act('release')">{{ tr('完整安装包') }}<Download :size="15"/></button>
    </section>

    <section v-if="notice && !required" class="notice" :class="{error}" :role="error ? 'alert' : 'status'" aria-live="polite">
      <component :is="error ? ShieldCheck : CheckCircle2" :size="17"/>
      <div class="notice-body">
        <strong>{{ tr(notice.split('\n')[0]) }}</strong>
        <div v-if="error && notice.includes('macOS 拒绝访问磁盘设备')" class="row">
          <button class="secondary" :disabled="busy" @click="act('permissions')">{{ tr('打开磁盘访问权限设置') }}<ArrowUpRight :size="14"/></button>
          <button class="secondary" :disabled="busy" @click="act('permission-helper')"><FolderOpen :size="14"/>{{ tr('打开助手位置') }}</button>
        </div>
        <details v-if="notice.includes('\n')"><summary>{{ tr('技术详情') }}</summary><pre>{{ notice.split('\n').slice(1).join('\n') }}</pre></details>
      </div>
      <button class="dismiss" :aria-label="tr('关闭提示')" @click="notice = ''"><X :size="16"/></button>
    </section>

    <!-- Disks -->
    <template v-if="page === 'disks'">
      <div v-if="volumes.length" class="disks">
        <article v-for="v in volumes" :key="v.uuid" class="disk" :data-state="stateOf(v)">
          <div class="disk-top">
            <img class="drive" :src="driveImage" alt=""/>
            <div class="disk-name"><h3 :title="v.name">{{ v.name || tr('未命名磁盘') }}</h3><span>NTFS{{ experimental ? ' · ' + tr('网络卷（实验）') : '' }}</span></div>
            <span class="pill" :class="{busy: stateOf(v) === 'busy', ok: stateOf(v) === 'rw', warn: stateOf(v) === 'ro', idle: stateOf(v) === 'off'}">
              <span v-if="stateOf(v) === 'busy'" class="spin" aria-hidden="true"></span>{{ stateOf(v) === 'busy' ? tr('处理中…') : stateOf(v) === 'rw' ? tr('可读写') : stateOf(v) === 'ro' ? tr('只读') : tr('未挂载') }}
            </span>
          </div>
          <div class="capacity">
            <template v-if="usage(v)">
              <div class="nums"><strong>{{ usage(v).free }} {{ tr('可用') }}</strong><span>{{ tr('共') }} {{ usage(v).total }} · {{ tr('已用') }} {{ usage(v).pct }}%</span></div>
              <div class="bar" role="img" :aria-label="tr('已用') + ' ' + usage(v).pct + '%'"><i :style="{width: usage(v).pct + '%'}"></i></div>
            </template>
            <div v-else class="nums"><strong>{{ v.size ? gb(v.size) : '—' }}</strong><span>{{ tr('总容量') }}</span></div>
          </div>
          <div v-if="stateOf(v) === 'ro'" class="reason">
            <strong>{{ tr('已以只读方式挂载') }}</strong>
            <span>{{ tr('常见原因：Windows 开启了「快速启动」或处于休眠，或文件系统需要在 Windows 中检查。在 Windows 中完全关机（按住 Shift 点「关机」）后再连接。') }}</span>
            <button class="link" @click="page = 'settings'; tab = 'diagnostics'">{{ tr('运行诊断') }}<ChevronRight :size="13"/></button>
          </div>
          <div class="actions">
            <button v-if="stateOf(v) === 'rw'" class="primary" :disabled="locked" @click="act('open', v)"><FolderOpen :size="15"/>{{ tr('打开 Finder') }}</button>
            <button v-else class="primary" :disabled="locked || updating" @click="act('mount', v)">{{ stateOf(v) === 'busy' ? tr('处理中…') : stateOf(v) === 'ro' ? tr('重新尝试读写') : tr('开启读写') }}</button>
            <button class="secondary" :disabled="locked" :title="tr('安全推出整块磁盘，包括其他分区')" @click="askEject(v)"><LogOut :size="15"/>{{ tr('安全推出') }}</button>
          </div>
          <details class="meta">
            <summary>{{ tr('设备详情') }}</summary>
            <dl><dt>{{ tr('设备标识') }}</dt><dd>{{ v.id }}</dd><dt>{{ tr('挂载位置') }}</dt><dd>{{ v.mount || tr('尚未挂载') }}</dd><dt>{{ tr('文件系统') }}</dt><dd>NTFS</dd></dl>
          </details>
        </article>
      </div>
      <section v-else-if="state" class="empty">
        <HardDrive :size="40"/>
        <div>
          <h3>{{ tr('等待连接磁盘') }}</h3>
          <p>{{ tr('连接 NTFS 格式的 USB 磁盘后，会自动显示在这里。') }} {{ tr('看不到磁盘？请逐项检查：') }}</p>
          <ul><li>{{ tr('磁盘是否为 NTFS 格式（exFAT、APFS 磁盘由 macOS 直接处理）') }}</li><li>{{ tr('Windows 是否开启了「快速启动」或处于休眠') }}</li><li>{{ tr('换一根数据线，或不经过扩展坞直接连接') }}</li></ul>
          <button class="primary" @click="page = 'settings'; tab = 'diagnostics'">{{ tr('运行诊断') }}</button>
        </div>
      </section>
      <div class="quick">
        <div><strong>{{ tr('插入后自动开启读写') }}</strong><p>{{ experimental ? tr('实验模式仅手动挂载，暂停自动开启读写。') : tr('插入 NTFS 磁盘后自动连接。') }}</p></div>
        <button class="switch" role="switch" :aria-checked="autoMount" :aria-label="tr('插入后自动开启读写')" @click="autoMount = !autoMount; save()"><span></span></button>
      </div>
      <p class="tip"><ShieldCheck :size="15"/>{{ tr('磁盘休眠或文件系统异常时会停止开启读写，保护已有数据。') }}</p>
    </template>

    <!-- Setup -->
    <SetupGuide v-else-if="page === 'setup'" :steps="steps" :backend="backend" :environment="state?.environment" :busy="busy" @action="act" @refresh="refresh" @done="page = 'disks'"/>

    <!-- Settings -->
    <template v-else>
      <div class="tabs" role="tablist">
        <button v-for="t in tabs" :key="t.id" role="tab" class="tab" :aria-selected="tab === t.id" @click="tab = t.id">{{ tr(t.label) }}</button>
      </div>

      <template v-if="tab === 'general'">
        <section class="card">
          <h2>{{ tr('配色方案') }}</h2>
          <p>{{ tr('整个界面一起换色，每套都有浅色和深色。选择会自动保存。') }}</p>
          <div class="schemes" role="radiogroup" :aria-label="tr('配色方案')">
            <button v-for="s in SCHEME_LIST" :key="s.id" class="scheme" role="radio" :aria-checked="scheme === s.id" @click="pickLook(s.id, appearance)">
              <span class="chips" aria-hidden="true"><i v-for="(c, i) in swatch(s.id)" :key="i" :style="{background: c}"></i></span>
              <strong>{{ tr(s.name) }}</strong><small>{{ tr(s.note) }}</small>
            </button>
          </div>
          <div class="field"><span>{{ tr('外观') }}</span><div class="segmented" role="radiogroup" :aria-label="tr('外观')"><button v-for="a in appearances" :key="a.id" role="radio" :aria-checked="appearance === a.id" @click="pickLook(scheme, a.id)">{{ tr(a.label) }}</button></div></div>
        </section>
        <section class="card">
          <h2>{{ tr('语言') }}</h2>
          <div class="segmented wrap" role="radiogroup" :aria-label="tr('语言')"><button v-for="l in languages" :key="l.id" role="radio" :aria-checked="locale === l.id" @click="setLanguage(l.id); save()">{{ l.id === 'auto' ? tr(l.label) : l.label }}</button></div>
        </section>
        <section class="card">
          <h2>{{ tr('菜单栏与自动读写') }}</h2>
          <p>{{ tr('关闭窗口后仍在菜单栏运行。设备插入时自动检查并开启 NTFS 读写；退出应用会停止设备检测。') }}</p>
          <div class="field"><span>{{ tr('插入后自动开启读写') }}</span><button class="switch" role="switch" :aria-checked="autoMount" :aria-label="tr('插入后自动开启读写')" @click="autoMount = !autoMount; save()"><span></span></button></div>
          <p v-if="state?.monitor.last_event" class="small">{{ tr('最近操作：') }} {{ tr(state.monitor.last_event.split('\n')[0]) }}</p>
        </section>
      </template>

      <template v-else-if="tab === 'mode'">
        <section class="card">
          <h2>{{ tr('读写模式') }}</h2>
          <div class="modes" role="radiogroup" :aria-label="tr('挂载模式')">
            <button class="mode" role="radio" :aria-checked="backend === 'Auto' || backend === 'Kernel' || backend === 'Fskit'" :disabled="busy || state?.monitor.busy || updating" @click="askBackend('Auto')">
              <strong>{{ tr('稳定模式（推荐）') }}</strong>
              <span>{{ tr('macFUSE + NTFS-3G，速度最好，插入后自动开启读写。首次需要允许驱动，可能要重启。') }}</span>
            </button>
            <button class="mode" role="radio" :aria-checked="backend === 'Microvm'" :disabled="busy || state?.monitor.busy || updating" @click="askBackend('Microvm')">
              <strong>{{ tr('免内核扩展模式（实验性）') }}</strong>
              <span>{{ tr('使用内置 Linux 微虚拟机和本机 NFS，不需要恢复模式或关闭 SIP；仍需后台助手及磁盘访问授权。') }}</span>
            </button>
          </div>
          <p class="small">{{ tr('请先安全推出所有受管理磁盘，再切换读写模式。重新连接后使用所选模式，不会自动回退。') }}</p>
          <p v-if="backend === 'Microvm' && !state?.environment.microvm" class="small warn-text">{{ tr('微虚拟机离线组件未安装，请安装完整 PKG') }}</p>
          <details><summary>{{ tr('兼容性选项') }}</summary>
            <div class="segmented wrap"><button v-for="b in [{id: 'Kernel', label: '内核兼容模式'}, {id: 'Fskit', label: 'FSKit（实验性，macOS 15.4+）'}]" :key="b.id" role="radio" :aria-checked="backend === b.id" :disabled="busy || state?.monitor.busy || updating" @click="askBackend(b.id)">{{ tr(b.label) }}</button></div>
          </details>
          <div class="field"><span>macFUSE {{ state?.environment.fuse_version || tr('尚未安装') }}</span><button v-if="backend !== 'Microvm'" class="secondary" :disabled="busy" @click="act('settings')">{{ tr('系统授权') }}<ArrowUpRight :size="14"/></button></div>
        </section>
        <section class="card">
          <h2>{{ tr('磁盘访问授权') }}</h2>
          <p>{{ tr('macOS 管理员密码与隐私授权分别管理。访问磁盘设备需要为权限助手 ntfs-helper 授予完整磁盘访问。此权限范围较广，请只添加本安装包提供的助手；软件仍只对你选择的外置 NTFS 磁盘执行操作。') }}</p>
          <div class="row"><button class="secondary" :disabled="busy" @click="act('permissions')">{{ tr('打开完整磁盘访问') }}</button><button class="secondary" :disabled="busy" @click="act('permission-helper')"><FolderOpen :size="15"/>{{ tr('打开助手位置') }}</button></div>
        </section>
      </template>

      <Diagnostics v-else-if="tab === 'diagnostics'" :busy="busy || updating || state?.monitor.busy" @action="act"/>

      <template v-else>
        <section class="card">
          <h2>{{ tr('软件更新') }}</h2>
          <p>{{ tr('当前应用 v') }}{{ state?.version }} {{ tr('· 已安装助手') }} {{ state?.environment.runtime_version ? `v${state.environment.runtime_version}` : tr('未安装') }} · {{ state?.environment.service ? tr('已连接') : tr('未连接') }}</p>
          <p class="update-text">{{ updateText }}</p>
          <p v-if="update" class="small">{{ tr('点下方按钮下载并验证完整安装包。安装器打开后 macntfs 会退出；按系统提示完成安装，再从「应用程序」启动。首次驱动授权和完整磁盘访问不会被自动绕过。') }}</p>
          <div class="row"><button class="secondary" :disabled="updating" @click="updates()"><RefreshCw :size="15"/>{{ tr('检查更新') }}</button><button v-if="update" class="primary" :disabled="updating || busy || state?.update_blockers > 0" @click="installUpdate"><Download :size="15"/>{{ updating ? tr('正在更新') + ' ' + progress + '%' : tr('下载并打开安装器') }}</button></div>
        </section>
        <section class="card">
          <h2>{{ tr('关于 macntfs') }}</h2>
          <p>{{ tr('免费开源 · Rust + Tauri') }}</p>
          <p>{{ tr('作者：Lucky') }} · {{ tr('邮箱：473276@qq.com') }}</p>
        </section>
      </template>
    </template>
  </main>

  <div v-if="dialog" class="scrim" @click.self="dialog = null">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 id="dialog-title">{{ dialog.title }}</h2>
      <p v-for="(l, i) in dialog.lines" :key="i">{{ l }}</p>
      <ul v-if="dialog.list.length"><li v-for="(item, i) in dialog.list" :key="i">{{ item }}</li></ul>
      <p v-if="dialog.hint" class="small">{{ dialog.hint }}</p>
      <div class="row end"><button class="secondary" @click="dialog = null">{{ tr('取消') }}</button><button class="primary" :disabled="dialog.disabled" @click="confirmDialog">{{ dialog.ok }}</button></div>
    </section>
  </div>

  <div v-if="required" class="update-gate" role="dialog" aria-modal="true" :aria-label="tr('需要更新')">
    <section class="dialog">
      <Download :size="28"/>
      <h2>{{ tr('需要更新') }} · v{{ required.version }}</h2>
      <p>{{ tr('发现新版本后，必须更新才能继续开启读写。已有磁盘不会被强行卸载，可先安全推出。') }}</p>
      <p class="small">{{ tr('安装器需要你的系统授权，完成安装后从「应用程序」重新启动。') }}</p>
      <p v-if="notice" role="alert" class="small warn-text">{{ notice }}</p>
      <div v-if="blockers.length" class="gate-eject">
        <p class="small">{{ tr('更新前请先安全推出 macntfs 管理的磁盘；关闭正在使用的文件后重试') }}</p>
        <button v-for="v in blockers" :key="v.uuid" class="secondary" :disabled="locked || updating" @click="act('eject', v)"><LogOut :size="14"/>{{ tr('安全推出') }} · {{ v.name || v.id }}</button>
      </div>
      <div class="row end">
        <button class="secondary" :disabled="updating || busy" @click="invoke('panel_action', {action: 'quit'})">{{ tr('退出') }}</button>
        <button class="primary" :disabled="updating || locked || state?.update_blockers > 0" @click="installUpdate">{{ updating ? tr('正在更新') + ' ' + progress + '%' : tr('立即更新') }}</button>
      </div>
    </section>
  </div>
</div>
</template>
