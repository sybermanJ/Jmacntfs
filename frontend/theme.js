// Whole-interface colour schemes built from 鉴色 (Chinese traditional colour) tokens.
// Each scheme defines a full light and dark palette; components only read the
// semantic CSS variables set here. Every text colour was checked for >= 4.5:1
// contrast against bg, surface, inset and accent-soft in both modes.
import {ref} from 'vue';

export const SCHEMES = {
  xuan: {
    light: {bg: '#F8F4ED', surface: '#FFFEF8', inset: '#F5F0E6', line: '#DAD4CB', lineStrong: '#BBB5AC', text: '#1D1B1C', text2: '#3B3A3E', text3: '#424B50', accent: '#2E5D4A', onAccent: '#FFFEF8', soft: '#EEF7F2'},
    dark: {bg: '#1A1A1A', surface: '#2E2E2E', inset: '#3B3A3E', line: '#4A4848', lineStrong: '#867E76', text: '#F8F4ED', text2: '#E4DFD7', text3: '#BBB5AC', accent: '#7BC092', onAccent: '#1A1A1A', soft: '#1A3B2E'},
  },
  qingci: {
    light: {bg: '#EEF3EF', surface: '#FBFDFB', inset: '#E1EAE4', line: '#C9D6CE', lineStrong: '#A3B5AA', text: '#1C2620', text2: '#34443A', text3: '#46574D', accent: '#2F6656', onAccent: '#FBFDFB', soft: '#D7E8DF'},
    dark: {bg: '#141C18', surface: '#1E2924', inset: '#25332C', line: '#34463D', lineStrong: '#5E7569', text: '#E8F0EB', text2: '#CFDCD4', text3: '#A9BBB0', accent: '#8CCBB0', onAccent: '#10201A', soft: '#1F3A2F'},
  },
  dailan: {
    light: {bg: '#EEF1F5', surface: '#FCFDFE', inset: '#E0E6EE', line: '#CBD4DF', lineStrong: '#A4B1C2', text: '#1A2030', text2: '#2F3A4F', text3: '#44506A', accent: '#1661AB', onAccent: '#FCFDFE', soft: '#E6F2FF'},
    dark: {bg: '#121A2A', surface: '#1A2438', inset: '#212D45', line: '#2F3C57', lineStrong: '#56658A', text: '#EEF2F8', text2: '#D3DBE8', text3: '#A9B6CC', accent: '#63BBD0', onAccent: '#0E1626', soft: '#1A3E72'},
  },
  zhusha: {
    light: {bg: '#F7EFEC', surface: '#FFFBF9', inset: '#EEDFDA', line: '#E0CBC4', lineStrong: '#C3A79E', text: '#2A1A18', text2: '#4A2E2A', text3: '#5E4440', accent: '#C41E3A', onAccent: '#FFFBF9', soft: '#FEDBE1'},
    dark: {bg: '#1C1312', surface: '#2A1D1B', inset: '#352523', line: '#4A3431', lineStrong: '#7E625D', text: '#F8EEEB', text2: '#E6D6D2', text3: '#BFA9A4', accent: '#EF82A0', onAccent: '#1C1312', soft: '#481E1C'},
  },
  songyan: {
    light: {bg: '#F1F1EF', surface: '#FFFFFF', inset: '#E4E4E1', line: '#D3D3CF', lineStrong: '#ADADA8', text: '#1D1B1C', text2: '#3B3A3E', text3: '#4F4F52', accent: '#735828', onAccent: '#FFFFFF', soft: '#F9F4DC'},
    dark: {bg: '#161616', surface: '#232323', inset: '#2C2C2E', line: '#3C3C3E', lineStrong: '#6E6E70', text: '#F2F2F0', text2: '#D8D8D4', text3: '#B8B8B3', accent: '#F8C471', onAccent: '#1A1A1A', soft: '#4D4030'},
  },
};
// Names are translation keys (see messages.json).
export const SCHEME_LIST = [
  {id: 'xuan', name: '宣纸 · 苍筤', note: '暖白纸色，墨绿重点'},
  {id: 'qingci', name: '青瓷', note: '冷调青绿灰，清爽安静'},
  {id: 'dailan', name: '黛蓝 · 靛青', note: '蓝灰底配靛蓝，接近系统原生'},
  {id: 'zhusha', name: '朱砂', note: '暖粉灰底配朱红，醒目'},
  {id: 'songyan', name: '松烟 · 苍黄', note: '中性墨灰配古铜金，克制'},
];
export const APPEARANCES = ['system', 'light', 'dark'];

const STATUS = {
  light: {ok: '#2E5D4A', okBg: '#EEF7F2', warn: '#806332', warnBg: '#F9F4DC', danger: '#9E2F2F', dangerBg: '#F2CAC9', info: '#2A3C5C', infoBg: '#E6F2FF'},
  dark: {ok: '#7BC092', okBg: '#1A3B2E', warn: '#F8C471', warnBg: '#4D4030', danger: '#F2B9B2', dangerBg: '#481E1C', info: '#C3D7DF', infoBg: '#1A3A5F'},
};
const VARS = {bg: '--bg', surface: '--surface', inset: '--inset', line: '--line', lineStrong: '--line-strong', text: '--text', text2: '--text-2', text3: '--text-3', accent: '--accent', onAccent: '--on-accent', soft: '--accent-soft', ok: '--ok', okBg: '--ok-bg', warn: '--warn', warnBg: '--warn-bg', danger: '--danger', dangerBg: '--danger-bg', info: '--info', infoBg: '--info-bg'};

// Older settings only had `theme` (Stone/Office/Graphite). Map them once so
// upgrades keep a familiar look.
export function migrate(settings) {
  const scheme = SCHEMES[settings?.scheme] ? settings.scheme : ({Office: 'dailan', Graphite: 'songyan'})[settings?.theme] || 'xuan';
  const appearance = APPEARANCES.includes(settings?.appearance) ? settings.appearance : settings?.theme === 'Graphite' ? 'dark' : settings?.theme ? 'light' : 'system';
  return {scheme, appearance};
}

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const resolvedMode = ref('light');
let current = {scheme: 'xuan', appearance: 'system'};
export function applyTheme(scheme, appearance) {
  current = {scheme: SCHEMES[scheme] ? scheme : 'xuan', appearance: APPEARANCES.includes(appearance) ? appearance : 'system'};
  const mode = current.appearance === 'system' ? (media?.matches ? 'dark' : 'light') : current.appearance;
  resolvedMode.value = mode;
  const tokens = {...SCHEMES[current.scheme][mode], ...STATUS[mode]};
  const root = document.documentElement;
  for (const key in VARS) root.style.setProperty(VARS[key], tokens[key]);
  root.dataset.mode = mode;
  root.dataset.scheme = current.scheme;
  root.style.colorScheme = mode;
}
media?.addEventListener?.('change', () => applyTheme(current.scheme, current.appearance));
export function swatch(id, mode = resolvedMode.value) {
  const t = SCHEMES[id][mode];
  return [t.bg, t.inset, t.surface, t.accent];
}
applyTheme('xuan', 'system');
