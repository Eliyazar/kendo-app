// Loud time-up buzzer synthesised with Web Audio (no audio asset needed).

let ctx: AudioContext | null = null

export function playBuzzer(durationMs = 1500): void {
  ctx ??= new AudioContext()
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
  gain.gain.setValueAtTime(0.9, now + durationMs / 1000 - 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
  gain.connect(ctx.destination)

  // Two detuned square waves give a harsh, hall-filling buzz.
  for (const freq of [220, 233]) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = freq
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + durationMs / 1000)
  }
}
