// Keeps a UI bug from leaving a blank screen mid-tournament. The state lives
// in the main process, so reloading the window loses nothing.

import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-black">Display error</div>
        <p className="max-w-lg text-white/60">
          The tournament data is safe. Reload the window to continue.
        </p>
        <pre className="max-w-2xl overflow-auto rounded bg-neutral-900 p-3 text-left text-xs text-red-300">{this.state.error.message}</pre>
        <button onClick={() => location.reload()} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500">
          Reload
        </button>
      </div>
    )
  }
}
