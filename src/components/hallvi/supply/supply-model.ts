// The words the Variables, CDN, Cache & queue and Jobs pages share.

/** The exact size of base64 content, without decoding it. */
export const sizeWords = (bytes: number) =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;
export const waitWords = (seconds: number) =>
  seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
