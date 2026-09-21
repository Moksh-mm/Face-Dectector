/**
 * Turns a camera frame or a picked file into a JPEG that is small enough to
 * upload quickly. Everything stays in memory: nothing is written anywhere.
 */

/** Long edge, in pixels. Plenty for face detection, keeps uploads ~150-300 KB. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.9;

type Region = { sx: number; sy: number; sw: number; sh: number };

function encode(source: CanvasImageSource, { sx, sy, sw, sh }: Region) {
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is unavailable."));
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode."))),
      "image/jpeg",
      JPEG_QUALITY
    )
  );
}

/**
 * Captures exactly what the video element shows. The preview is drawn with
 * object-fit: cover, so the edges of the camera frame are cropped away on
 * screen; capturing the full frame would send people the user could not see,
 * and the recognizer rejects photos with more than one face.
 */
export function captureVideoFrame(video: HTMLVideoElement) {
  const { videoWidth, videoHeight, clientWidth, clientHeight } = video;
  if (!videoWidth || !videoHeight || !clientWidth || !clientHeight) {
    return Promise.reject(new Error("The camera isn't ready."));
  }

  const scale = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const sw = clientWidth / scale;
  const sh = clientHeight / scale;

  return encode(video, {
    sx: (videoWidth - sw) / 2,
    sy: (videoHeight - sh) / 2,
    sw,
    sh,
  });
}

/** For photos from the phone's camera app: rotated upright and downscaled. */
export async function fileToJpeg(file: File) {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    return await encode(bitmap, {
      sx: 0,
      sy: 0,
      sw: bitmap.width,
      sh: bitmap.height,
    });
  } finally {
    bitmap.close();
  }
}
