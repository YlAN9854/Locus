/**
 * 照片落盘。基于 expo-file-system 新版 File/Directory API。
 *
 * 关键约定(沿用技术方案):
 *  - DB 只存「相对路径」photos/{uuid}.jpg,不存 base64、不存绝对路径。
 *  - image-picker 给的是临时 uri,必须主动拷到 app 永久目录(document),否则会被系统清理。
 *  - 读取/显示时再用 absolutePath() 拼回当前 document 目录前缀。
 */
import {Directory, File, Paths} from 'expo-file-system';
import {uuid} from '@/utils/id';

const PHOTO_DIR = 'photos';

/** 确保永久照片目录存在,返回该目录。 */
function ensurePhotoDir(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * 把拍照得到的临时文件拷入永久目录。
 * @param tempUri image-picker 返回的 asset.uri
 * @returns 相对路径 photos/{uuid}.jpg,存入 DB
 */
export async function persistPhoto(tempUri: string): Promise<string> {
  const dir = ensurePhotoDir();
  const name = `${uuid()}.jpg`;
  const src = new File(tempUri);
  await src.copy(new File(dir, name));
  return `${PHOTO_DIR}/${name}`;
}

/** 相对路径 → 当前可读取的绝对 uri(用于 <Image source> 与导出)。 */
export function absolutePath(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

/** 删除照片文件(删除记录时调用)。 */
export function deletePhoto(relativePath: string): void {
  const f = new File(Paths.document, relativePath);
  if (f.exists) {
    f.delete();
  }
}
