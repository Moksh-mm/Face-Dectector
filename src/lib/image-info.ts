/**
 * Reads an image's pixel size from its header, without decoding it.
 *
 * Why: a few hundred bytes can describe a 30,000 x 30,000 image. A file-size
 * limit does not stop that, and decoding it would exhaust the ML service's
 * memory. Reading the size first lets us refuse it before it gets that far.
 *
 * Returns null when the header is malformed or truncated.
 */
export type Dimensions = { width: number; height: number };

function png(b: Uint8Array): Dimensions | null {
  // IHDR must be the first chunk: length(4) "IHDR"(4) then width, height.
  if (b.length < 24) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;

  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpeg(b: Uint8Array): Dimensions | null {
  let i = 2; // after the SOI marker

  while (i + 3 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }

    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i++; // fill bytes
      marker = b[i + 1];
    }

    // Markers with no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Reached the pixel data or the end without seeing a frame header.
    if (marker === 0xd9 || marker === 0xda) return null;

    const length = (b[i + 2] << 8) | b[i + 3];
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader) {
      if (i + 9 > b.length) return null;
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }

    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): Dimensions | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (chunk === "VP8 ") {
    // Lossy: 14-bit width and height after the frame tag and start code.
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    // Lossless: two packed 14-bit fields, each stored minus one.
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit canvas width and height, each stored minus one.
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return null;
}

export function imageDimensions(bytes: Uint8Array, type: string): Dimensions | null {
  const found =
    type === "image/png" ? png(bytes) : type === "image/jpeg" ? jpeg(bytes) : type === "image/webp" ? webp(bytes) : null;

  if (!found || found.width <= 0 || found.height <= 0) return null;
  return found;
}
