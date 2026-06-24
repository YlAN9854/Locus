/** 从 catch 的 unknown error 提取可展示的消息 */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
