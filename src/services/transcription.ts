/**
 * 语音转文字,基于硅基流动(SiliconFlow) Audio Transcriptions API。
 *
 * 端点: POST https://api.siliconflow.cn/v1/audio/transcriptions
 * 限制: 时长≤1h,文件≤50MB(单条用户录音远小于此)。
 *
 * API Key 和模型型号从 expo-constants 读取(由 app.config.js extra 注入)。
 * 文件上传通过手动构建 multipart body 实现(避免 RN FormData 兼容问题)。
 */
import Constants from 'expo-constants';
import {File, Paths} from 'expo-file-system';

const API_BASE = 'https://api.siliconflow.cn/v1';

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export async function transcribe(relativeAudioPath: string): Promise<string> {
  const apiKey = Constants.expoConfig?.extra?.SILICONFLOW_API_KEY as string;
  const model = (Constants.expoConfig?.extra?.SILICONFLOW_MODEL as string) || 'TeleAI/TeleSpeechASR';

  if (!apiKey) {
    throw new Error('未配置 SILICONFLOW_API_KEY,请在 .env 中填入');
  }

  const audioFile = new File(Paths.document, relativeAudioPath);
  if (!audioFile.exists) {
    throw new Error('录音文件不存在');
  }

  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const filename = relativeAudioPath.split('/').pop() || 'audio.m4a';
  const audioBytes = await audioFile.bytes();

  const parts: Uint8Array[] = [
    textToBytes(`--${boundary}\r\n`),
    textToBytes(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
    textToBytes(`Content-Type: audio/mp4\r\n\r\n`),
    audioBytes,
    textToBytes(`\r\n--${boundary}\r\n`),
    textToBytes(`Content-Disposition: form-data; name="model"\r\n\r\n`),
    textToBytes(model),
    textToBytes(`\r\n--${boundary}--\r\n`),
  ];

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }

  const res = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`转录请求失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data?.text) {
    throw new Error('转录返回无文本内容');
  }
  return data.text as string;
}
