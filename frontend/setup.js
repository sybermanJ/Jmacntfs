// First-run steps derived from the live environment. Status is one of
// 'done', 'todo' (needs the user) or 'unknown' (macOS does not expose it;
// confirmed only by a real mount).
export function setupSteps(state, backend) {
  const env = state?.environment || {};
  const vm = backend === 'Microvm';
  const mounted = (state?.volumes || []).some(v => v.mount);
  const denied = /拒绝访问磁盘设备/.test(state?.monitor?.last_error || state?.monitor?.last_event || '');
  return [
    {id: 1, title: '安装应用', status: env.runtime ? 'done' : 'todo', detail: env.runtime ? '读写组件版本检查通过' : '读写组件尚未安装或版本不一致'},
    vm
      ? {id: 2, title: '确认读写模式', status: env.microvm ? 'done' : 'todo', detail: env.microvm ? '免内核模式不需要 macFUSE' : '微虚拟机离线组件未安装，请安装完整 PKG'}
      : {id: 2, title: '允许驱动', status: env.fuse ? 'done' : 'todo', detail: env.fuse ? 'macFUSE 已安装' : 'macFUSE 尚未安装'},
    {id: 3, title: '磁盘访问', status: mounted ? 'done' : denied ? 'todo' : 'unknown', detail: mounted ? '已成功挂载磁盘' : denied ? 'macOS 拒绝访问磁盘设备' : '以实际挂载结果为准'},
    {id: 4, title: '完成检查', status: env.service ? 'done' : 'todo', detail: env.service ? '后台助手已连接' : '后台助手尚未连接'},
  ];
}
