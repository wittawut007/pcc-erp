/**
 * บีบอัดรูปภาพก่อน Upload เพื่อลดพื้นที่ใช้งานใน Supabase Storage
 *
 * @param file      ไฟล์ต้นฉบับจากกล้องมือถือ
 * @param maxWidth  ความกว้างสูงสุด (default: 1280px)
 * @param quality   คุณภาพ JPEG 0–1 (default: 0.75)
 * @returns         File ที่บีบอัดแล้ว (~100–300 KB)
 */
export async function compressImage(
  file: File,
  maxWidth = 1280,
  quality = 0.75
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      // คำนวณขนาดใหม่โดยรักษา aspect ratio
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Image compression failed'))
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg', lastModified: Date.now() }
          )
          resolve(compressed)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      // หาก compress ไม่ได้ (เช่น HEIC บาง device) ให้ใช้ไฟล์เดิม
      resolve(file)
    }

    img.src = objectUrl
  })
}
