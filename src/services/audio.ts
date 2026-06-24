/**
 * 录音落盘。基于 expo-file-system,与 photo.ts 同模式。
 *
 * 约定:
 *  - DB 只存「相对路径」audio/{uuid}.m4a。
 *  - expo-av 录音产生临时文件,必须拷到永久目录。
 *  - 回放/导出时用 absoluteAudioPath() 拼回绝对 uri。
 */
import {Directory, File, Paths} from 'expo-file-system';
import {uuid} from '@/utils/id';

const AUDIO_DIR = 'audio';

function ensureAudioDir(): Directory {
  const dir = new Directory(Paths.document, AUDIO_DIR);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * 把录音临时文件拷入永久目录。
 * @param tempUri expo-av 录音返回的本地 uri
 * @returns 相对路径 audio/{uuid}.m4a
 */
export async function persistAudio(tempUri: string): Promise<string> {
  const dir = ensureAudioDir();
  const name = `${uuid()}.m4a`;
  const src = new File(tempUri);
  await src.copy(new File(dir, name));
  return `${AUDIO_DIR}/${name}`;
}

/** 相对路径 → 可读取的绝对 uri(用于 expo-av Audio.Sound) */
export function absoluteAudioPath(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

/** 删除录音文件(删除记录时调用) */
export function deleteAudio(relativePath: string): void {
  const f = new File(Paths.document, relativePath);
  if (f.exists) {
    f.delete();
  }
}
