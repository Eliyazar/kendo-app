// Public scoreboard window: fullscreen, read-only, subscribed to main over IPC.

import { useEffect, useState } from 'react'
import type { PublicView } from '@shared/public-view'
import { ScaledStage } from '../components/ScaledStage'
import { Scoreboard } from '../components/Scoreboard'

function usePublicView(): PublicView | null {
  const [view, setView] = useState<PublicView | null>(null)
  useEffect(() => {
    const off = window.kendoPublic.onView(setView)
    void window.kendoPublic.getView().then(setView)
    return off
  }, [])
  return view
}

export function PublicApp() {
  const view = usePublicView()
  return (
    <ScaledStage className="h-full w-full cursor-none bg-black">
      <Scoreboard view={view} />
    </ScaledStage>
  )
}
