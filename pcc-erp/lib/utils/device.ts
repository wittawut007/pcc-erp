export type ServerDeviceCheck = 'mobile' | 'desktop' | 'ambiguous'

const MOBILE_OR_TABLET_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i

const DEFINITE_DESKTOP_UA_REGEX = /Windows NT|X11|CrOS|Linux x86_64|Linux i686/i

/**
 * ตรวจสอบประเภทอุปกรณ์ฝั่ง Server จาก HTTP headers
 * - 'mobile'    : ยืนยันว่าเป็นมือถือ/แท็บเล็ต (Android, iPhone, iPad UA, หรือ Sec-CH-UA-Mobile: ?1)
 * - 'desktop'   : ยืนยันว่าเป็นคอมพิวเตอร์ตั้งโต๊ะ/โน้ตบุ๊ก (Windows, Linux Desktop, ChromeOS) → บล็อกทันทีจากฝั่ง Server
 * - 'ambiguous' : กรณี Macintosh UA ซึ่งอาจเป็น MacBook หรือ iPadOS 13+ → ส่งให้ฝั่ง Client ตรวจสอบ Touch/Pointer เพิ่มเติม
 */
export function classifyServerDevice(
  userAgent: string | null,
  secChUaMobile: string | null
): ServerDeviceCheck {
  if (secChUaMobile === '?1') {
    return 'mobile'
  }

  const ua = userAgent ?? ''
  if (!ua) {
    return 'ambiguous'
  }

  if (MOBILE_OR_TABLET_UA_REGEX.test(ua)) {
    return 'mobile'
  }

  if (DEFINITE_DESKTOP_UA_REGEX.test(ua)) {
    return 'desktop'
  }

  // Macintosh UA may be macOS Desktop or iPadOS 13+ Safari (Request Desktop Website by default)
  if (/Macintosh/i.test(ua)) {
    return 'ambiguous'
  }

  return 'desktop'
}
