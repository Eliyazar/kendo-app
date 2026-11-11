// QR code drawn as SVG (sharp at any size), dark on a white square with a quiet zone.

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function Qr({ text, size, className = '' }: { text: string; size: number; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    void QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0d12', light: '#ffffff' } }).then((s) => alive && setSvg(s))
    return () => {
      alive = false
    }
  }, [text])
  return <div className={`shrink-0 overflow-hidden bg-white [&>svg]:h-full [&>svg]:w-full ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
