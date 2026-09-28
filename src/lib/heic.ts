// iPhone photos: Chrome and Firefox can't decode HEIC, so it becomes a JPEG in the browser before preview and OCR.
// Some browsers leave file.type empty for HEIC, hence the extension check.
export const isHeic = (file: File) => /^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name)

// The ~3 MB libheif decoder loads only when a HEIC file actually arrives.
export async function heicToJpeg(file: File): Promise<Blob> {
  const { heicTo } = await import("heic-to")
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 })
}
