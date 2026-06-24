/**
 * 项目语义色 token。
 * 样式文件中不直接手抄 hex，一律引用此文件。
 */
export const Colors = {
  // 主色
  primary: '#1C1917',
  onPrimary: '#fff',

  // 强调
  accent: '#2563EB',
  onAccent: '#fff',

  // 表面
  surface: '#fff',
  pageBackground: '#fafafa',

  // 输入
  inputBackground: '#f5f5f5',
  placeholder: '#eee',
  track: '#f0f0f0',

  // 文字层级
  textPrimary: '#1C1917',
  textSecondary: '#666',
  textHint: '#888',
  textMuted: '#999',
  textPlaceholder: '#aaa',
  textNote: '#333',
  textEmpty: '#555',

  // 录音
  recordRed: '#e53935',
  recordRedDark: '#c62828',
} as const;
