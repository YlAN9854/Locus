import {Directory, File, Paths} from 'expo-file-system';
import {uuid} from '@/utils/id';

const VIDEO_DIR = 'videos';

function ensureVideoDir(): Directory {
  const dir = new Directory(Paths.document, VIDEO_DIR);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export async function persistVideo(tempUri: string): Promise<string> {
  const dir = ensureVideoDir();
  const name = `${uuid()}.mp4`;
  const src = new File(tempUri);
  await src.copy(new File(dir, name));
  return `${VIDEO_DIR}/${name}`;
}

export function absoluteVideoPath(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

export function deleteVideo(relativePath: string): void {
  const f = new File(Paths.document, relativePath);
  if (f.exists) {
    f.delete();
  }
}
