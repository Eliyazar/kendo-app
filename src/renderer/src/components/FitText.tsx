// Text that always shows in full: it shrinks until it fits on one line, and wraps only below `min`.

import { useLayoutEffect, useRef, useState } from 'react'

export function FitText({ text, max, min, className = '' }: { text: string; max: number; min: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(max)
  const [wrap, setWrap] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.whiteSpace = 'nowrap'
      let s = max
      el.style.fontSize = `${s}px`
      // Layout sizes ignore the stage's CSS scale, so this works on any screen.
      while (s > min && el.scrollWidth > el.clientWidth) {
        s = Math.max(min, Math.floor(s * 0.94))
        el.style.fontSize = `${s}px`
      }
      const tooLong = el.scrollWidth > el.clientWidth
      el.style.whiteSpace = tooLong ? 'normal' : 'nowrap'
      setSize(s)
      setWrap(tooLong)
    }
    fit()
    // Re-measure once the web fonts are in (the fallback font has other widths).
    let alive = true
    void document.fonts?.ready.then(() => alive && fit())
    return () => {
      alive = false
    }
  }, [text, max, min])

  return (
    <div ref={ref} className={`w-full overflow-hidden ${className}`} style={{ fontSize: size, whiteSpace: wrap ? 'normal' : 'nowrap', overflowWrap: 'anywhere' }}>
      {text}
    </div>
  )
}
