import type { PcmAudio } from './types.js';

/**
 * Minimal WAV (RIFF) reader and writer: PCM 16/24/32-bit integer and 32-bit
 * float. Parsing is exact (no resampling), so loading a sample gives the same
 * numbers on every machine; browsers' `decodeAudioData` would resample.
 */

function view(bytes: ArrayBuffer | ArrayBufferView): DataView {
  return ArrayBuffer.isView(bytes)
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new DataView(bytes);
}

function tag(data: DataView, offset: number): string {
  return String.fromCharCode(
    data.getUint8(offset),
    data.getUint8(offset + 1),
    data.getUint8(offset + 2),
    data.getUint8(offset + 3),
  );
}

export function decodeWav(bytes: ArrayBuffer | ArrayBufferView): PcmAudio {
  const data = view(bytes);
  if (data.byteLength < 12 || tag(data, 0) !== 'RIFF' || tag(data, 8) !== 'WAVE') {
    throw new Error('decodeWav: not a RIFF/WAVE file.');
  }
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= data.byteLength) {
    const id = tag(data, offset);
    const size = data.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = data.getUint16(body, true);
      channels = data.getUint16(body + 2, true);
      sampleRate = data.getUint32(body + 4, true);
      bits = data.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID.
      if (format === 0xfffe && size >= 40) format = data.getUint16(body + 24, true);
    } else if (id === 'data') {
      if (!channels) throw new Error('decodeWav: data chunk before fmt chunk.');
      const float = format === 3;
      if (!(format === 1 || float) || (float && bits !== 32) || ![16, 24, 32].includes(bits)) {
        throw new Error(`decodeWav: unsupported format ${format} with ${bits} bits.`);
      }
      const width = bits / 8;
      const frames = Math.floor(Math.min(size, data.byteLength - body) / (width * channels));
      const out = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          const at = body + (i * channels + c) * width;
          let v: number;
          if (float) v = data.getFloat32(at, true);
          else if (bits === 16) v = data.getInt16(at, true) / 32768;
          else if (bits === 24) {
            const raw =
              data.getUint8(at) | (data.getUint8(at + 1) << 8) | (data.getUint8(at + 2) << 16);
            v = ((raw << 8) >> 8) / 8388608;
          } else v = data.getInt32(at, true) / 2147483648;
          (out[c] as Float32Array)[i] = v;
        }
      }
      return { sampleRate, channels: out };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('decodeWav: no data chunk.');
}

/**
 * Encodes PCM as a WAV file. Integer formats are rounded (and clamped), with
 * no dither: render at the output depth you need.
 */
export function encodeWav(audio: PcmAudio, bits: 16 | 24 | 32 = 24): Uint8Array {
  const channels = audio.channels.length;
  const frames = audio.channels[0]?.length ?? 0;
  const float = bits === 32;
  const width = bits / 8;
  const size = frames * channels * width;
  const out = new Uint8Array(44 + size);
  const data = new DataView(out.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < 4; i++) data.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  data.setUint32(4, 36 + size, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, float ? 3 : 1, true);
  data.setUint16(22, channels, true);
  data.setUint32(24, audio.sampleRate, true);
  data.setUint32(28, audio.sampleRate * channels * width, true);
  data.setUint16(32, channels * width, true);
  data.setUint16(34, bits, true);
  write(36, 'data');
  data.setUint32(40, size, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, (audio.channels[c] as Float32Array)[i] ?? 0));
      if (float) data.setFloat32(at, v, true);
      else if (bits === 16) data.setInt16(at, Math.round(v * 32767), true);
      else {
        const n = Math.round(v * 8388607);
        data.setUint8(at, n & 0xff);
        data.setUint8(at + 1, (n >> 8) & 0xff);
        data.setUint8(at + 2, (n >> 16) & 0xff);
      }
      at += width;
    }
  }
  return out;
}
