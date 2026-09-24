"use client";

import { X } from "@phosphor-icons/react";

import {
  IMAGE_TYPES,
  MAX_IMAGE_CHARACTERS,
  MAX_IMAGES,
} from "@/server/schemas";

/** An image the owner is about to send, already in the form Pi keeps. */
export interface ImageAttachment {
  id: string;
  mimeType: string;
  data: string;
}

export { MAX_IMAGES };

/** The model sees no more detail than this, so nothing larger is sent. */
const MAX_EDGE = 2000;
const MAX_BYTES = Math.floor(MAX_IMAGE_CHARACTERS / 4) * 3;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Read a picked, pasted or dropped file as an attachment. A screenshot from a
 * large display is scaled down and, only if it is still too big, becomes a
 * JPEG; any other image the browser can open becomes a PNG.
 */
export async function readImage(file: File): Promise<ImageAttachment> {
  const kept = (IMAGE_TYPES as readonly string[]).includes(file.type);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(
      `${file.name || "This file"} is not an image Hallvi can read.`,
    );
  });
  let blob: Blob | null = file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (!kept || scale < 1 || file.size > MAX_BYTES) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await toBlob(canvas, "image/png");
    if (!blob || blob.size > MAX_BYTES) {
      // JPEG has no transparency: put white behind it rather than black.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, "image/jpeg", 0.85);
    }
  }
  bitmap.close();
  if (!blob || blob.size > MAX_BYTES)
    throw new Error(`${file.name || "This image"} is too large to attach.`);
  return {
    id: crypto.randomUUID(),
    mimeType: blob.type,
    data: await base64(blob),
  };
}

/** The images a message carries, or the ones waiting in the composer. */
export function MessageImages({
  sources,
  onRemove,
}: {
  sources: { key: string; src: string }[];
  /** Offered in the composer, where an attachment can still be taken off. */
  onRemove?: (key: string) => void;
}) {
  if (!sources.length) return null;
  return (
    <div className={`hv-images${onRemove ? " editable" : ""}`}>
      {sources.map(({ key, src }, index) => (
        <span className="hv-image" key={key}>
          {onRemove ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Attached image ${index + 1}`} />
          ) : (
            <a href={src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Attached image ${index + 1}`}
                loading="lazy"
              />
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove image ${index + 1}`}
              onClick={() => onRemove(key)}
            >
              <X weight="bold" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export const attachmentSources = (images: ImageAttachment[]) =>
  images.map((image) => ({
    key: image.id,
    src: `data:${image.mimeType};base64,${image.data}`,
  }));

export const sentImageSources = (
  applicationId: string,
  chatId: string,
  messageId: string,
  count: number,
) =>
  Array.from({ length: count }, (_, index) => ({
    key: `${messageId}:${index}`,
    src: `/api/applications/${applicationId}/chats/${chatId}/messages/${encodeURIComponent(messageId)}/images/${index}`,
  }));
