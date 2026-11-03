<script setup>
import {tr} from './i18n';
import {ref, computed} from 'vue';
import {Check, ArrowUpRight, Copy} from 'lucide-vue-next';
const props = defineProps({steps: Array, environment: Object, busy: Boolean, backend: String});
const emit = defineEmits(['action', 'refresh', 'done']);
const firstOpen = props.steps.find(s => s.status !== 'done')?.id || 4;
const step = ref(firstOpen);
const current = computed(() => props.steps.find(s => s.id === step.value));
const helperPath = '/Library/Application Support/NTFS Desktop/Runtime/bin/ntfs-helper';
const copied = ref('');
async function copyPath() {
  try { await navigator.clipboard.writeText(helperPath); copied.value = tr('已复制'); }
  catch { copied.value = tr('请手动选择并复制'); }
}
const statusLabel = s => s.status === 'done' ? tr('已完成') : s.status === 'todo' ? tr('需要处理') : tr('待确认');
</script>
<template>
<div class="setup">
  <ol class="steps">
    <li v-for="s in steps" :key="s.id">
      <button class="step" :class="s.status" :aria-current="step === s.id ? 'step' : undefined" @click="step = s.id">
        <span class="step-mark"><Check v-if="s.status === 'done'" :size="13"/><template v-else>{{ s.id }}</template></span>
        <span class="step-text"><span>{{ tr(s.title) }}</span><small>{{ statusLabel(s) }}</small></span>
      </button>
    </li>
  </ol>

  <section class="card step-panel">
    <p class="status-line" :class="current.status"><Check v-if="current.status === 'done'" :size="15"/>{{ statusLabel(current) }} · {{ tr(current.detail) }}</p>

    <template v-if="step === 1">
      <h2>{{ tr('1 · 安装到「应用程序」') }}</h2>
      <p>{{ tr('打开下载的完整 PKG，按「继续 → 安装」完成系统授权。安装时输入 Mac 登录密码；如果系统显示 Touch ID，也可使用指纹。安装完成后，从 Finder 的「应用程序」打开 macntfs。') }}</p>
      <p class="small">{{ tr('更新时先安全推出所有磁盘，再从菜单栏退出 macntfs，最后安装完整 PKG。更新助手后可能需要重新添加磁盘访问权限。') }}</p>
      <div class="row"><button class="secondary" :disabled="busy" @click="emit('action', 'install')">{{ tr('打开本地组件安装器') }}</button></div>
    </template>

    <template v-else-if="step === 2 && backend === 'Microvm'">
      <h2>{{ tr('免内核扩展 · 离线实验模式') }}</h2>
      <p>{{ tr('微虚拟机模式不需要 macFUSE 授权或恢复模式操作。请继续下一步，为助手授权磁盘访问。') }}</p>
    </template>

    <template v-else-if="step === 2">
      <h2>{{ tr('2 · 允许 macFUSE 驱动') }}</h2>
      <p>{{ tr('默认「稳定模式」使用 macFUSE 内核驱动。首次使用或更新 macFUSE 后，若系统提示扩展被阻止，打开「系统设置 → 隐私与安全性」，找到 macFUSE / Benjamin Fleischer 的提示并选择「允许」，按提示验证并重启。') }}</p>
      <div class="row"><button class="secondary" :disabled="busy" @click="emit('action', 'settings')">{{ tr('打开系统授权设置') }}<ArrowUpRight :size="14"/></button></div>
      <details><summary>{{ tr('Apple 芯片 Mac：系统要求启用扩展或进入恢复模式时，具体怎么做？') }}</summary>
        <p>{{ tr('适用于 M1、M2、M3 等 Apple 芯片，且你选择了稳定内核模式。驱动已正常工作时可跳过，不需要每次重启。调整为「降低安全性」会放宽对第三方内核扩展的限制，请了解后由你自行决定。') }}</p>
        <ol>
          <li>{{ tr('保存工作，关闭 Mac。完全关机后，长按电源键 / Touch ID 按钮，直到出现「正在载入启动选项」。') }}</li>
          <li>{{ tr('选择齿轮图标「选项 → 继续」，按提示选择管理员并输入密码。') }}</li>
          <li>{{ tr('在恢复环境顶部菜单选择「实用工具 → 启动安全性实用工具」。若它自动打开，直接继续。') }}</li>
          <li>{{ tr('选择安装 macOS 的启动磁盘（通常是 Macintosh HD），点击「安全策略」。') }}</li>
          <li>{{ tr('选择「降低安全性」，勾选「允许用户管理来自被认可开发者的内核扩展」（不同系统版本翻译可能略有差异），确认并输入密码。') }}</li>
          <li>{{ tr('重新启动回到 macOS，打开「系统设置 → 隐私与安全性」，允许 macFUSE / Benjamin Fleischer 的扩展；如系统要求，再重启一次。') }}</li>
          <li>{{ tr('回到 macntfs，点「重新检查」，再连接磁盘。') }}</li>
        </ol>
        <p>{{ tr('不需要关闭 SIP、关闭 FileVault 或勾选远程管理内核扩展。如果是公司管理的 Mac，交由管理员配置。') }}</p>
      </details>
      <details><summary>{{ tr('Intel Mac 或不想调整启动安全策略？') }}</summary><p>{{ tr('Intel Mac 不使用上述 Apple 芯片恢复模式步骤，一般在系统设置允许驱动并重启。macOS 15.4 及以上的 FSKit 后端不要求内核扩展或恢复模式，但本软件的 FSKit 尚属实验性，不能保证与稳定模式同等可用；可在下方读写引擎中选择。') }}</p></details>
      <p class="small">{{ tr('是否允许驱动、是否需要重启由 macOS 判断，本向导不能自动读取完整授权状态。') }}</p>
      <p class="small">{{ tr('官方说明：') }} <button class="link" @click="emit('action', 'guide-macfuse')">{{ tr('macFUSE 安装指南') }}</button> · <button class="link" @click="emit('action', 'guide-apple')">{{ tr('Apple 启动安全策略') }}</button></p>
    </template>

    <template v-else-if="step === 3">
      <h2>{{ tr('3 · 允许助手访问外置磁盘') }}</h2>
      <p>{{ tr('如果挂载提示「macOS 拒绝访问磁盘设备」，按下面步骤设置完整磁盘访问。这项权限范围较广，请只添加本软件安装的 ntfs-helper。') }}</p>
      <ol>
        <li>{{ tr('点「打开完整磁盘访问」，在系统设置解锁或完成身份验证。') }}</li>
        <li>{{ tr('点列表中的「＋」。在文件选择窗口按 Command + Shift + G，粘贴下方路径并回车，再点「打开」。') }}</li>
        <li>{{ tr('确认 ntfs-helper 的开关已开启。回到 macntfs 重新检查并重试。') }}</li>
      </ol>
      <div class="path"><code>{{ helperPath }}</code><button class="secondary" @click="copyPath"><Copy :size="14"/>{{ copied || tr('复制') }}</button></div>
      <div class="row"><button class="secondary" :disabled="busy" @click="emit('action', 'permissions')">{{ tr('打开完整磁盘访问') }}</button><button class="secondary" :disabled="busy" @click="emit('action', 'permission-helper')">{{ tr('在 Finder 定位助手') }}</button></div>
      <p class="small">{{ tr('当前开发测试包采用临时签名，更新助手后若旧授权失效：在列表移除旧 ntfs-helper，再添加上面的当前助手。仅勾选主应用不能代替助手的磁盘权限。') }}</p>
    </template>

    <template v-else>
      <h2>{{ tr('4 · 检查并开始使用') }}</h2>
      <p v-if="!environment?.service">{{ tr(environment?.service_issue || '') }}</p>
      <p>{{ tr('连接 NTFS 磁盘，回到「我的磁盘」确认显示「可读写」。助手连接成功不代表已经取得所有磁盘权限；以实际挂载结果为准。Windows 休眠或损坏的磁盘不会强行开启读写。') }}</p>
      <details v-if="backend === 'Microvm'"><summary>{{ tr('桌面与访达入口') }}</summary><p>{{ tr('在访达设置的「通用」中勾选「已连接的服务器」，即可显示桌面卷入口。在访达打开磁盘后，选择「文件 → 添加到边栏」，即可用硬盘名称快速访问。') }}</p><p>{{ tr('拔盘前请使用 macntfs 的「安全推出」。异常断开后后台会尝试正常清理残留；无法保证未完成写入的数据完整，不会自动强行修复磁盘。') }}</p></details>
    </template>

    <div class="row end step-footer">
      <button class="secondary" :disabled="busy" @click="emit('refresh')">{{ tr('重新检查') }}</button>
      <button v-if="step > 1" class="secondary" @click="step--">{{ tr('上一步') }}</button>
      <button v-if="step < 4" class="primary" @click="step++">{{ tr('下一步') }}</button>
      <button v-else class="primary" @click="emit('done')">{{ tr('我的磁盘') }}</button>
    </div>
  </section>
</div>
</template>
