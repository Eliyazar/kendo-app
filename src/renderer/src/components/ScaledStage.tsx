// Renders children on a fixed 1920×1080 canvas and scales it to fit the
// container (letterboxed). The public screen and the admin live preview use
// the same component, so the preview is pixel-identical to the TV.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const STAGE_W = 1920
export const STAGE_H = 1080

export function ScaledStage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const fit = (): void => setScale(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={host} className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute top-1/2 left-1/2 origin-center"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
