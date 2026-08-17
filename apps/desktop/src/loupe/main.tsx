import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './loupe.css'

/**
 * The launcharr loupe (colorpicker, 2026-08-17): a transparent window over the
 * mouse's screen; this draws a 2× magnifier around the cursor from pixels Rust
 * captures *below* the window (`loupe_capture`), shows the hex of the pixel under
 * the cursor, and reports the pick (`loupe_done`). Click picks, Esc cancels.
 * Everything visual is here — zoom, ring, label — so it stays hackable; Rust only
 * moves bytes.
 */

/** Zoom (one screen point → N loupe points) and diameter (points) arrive with
 * `loupe-open` from config (`colorLoupeZoom` default 4, `colorLoupeSize` default 352). */

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()

function Loupe() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const zoom = useRef(4)
  const [diameter, setDiameter] = useState(352)
  const [hex, setHex] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const inFlight = useRef(false)
  const wanted = useRef<{ x: number; y: number } | null>(null)
  const drawn = useRef<{ x: number; y: number } | null>(null)

  const paint = useCallback(
    (bytes: ArrayBuffer) => {
      const view = new DataView(bytes)
      const w = view.getUint32(0, true)
      const h = view.getUint32(4, true)
      if (w === 0 || h === 0) return
      const rgba = new Uint8ClampedArray(bytes, 8, w * h * 4)
      const image = new ImageData(rgba, w, h)

      // Pixel under the cursor = the centre of the region.
      const cx = Math.floor(w / 2)
      const cy = Math.floor(h / 2)
      const at = (cy * w + cx) * 4
      setHex(`#${hex2(rgba[at]!)}${hex2(rgba[at + 1]!)}${hex2(rgba[at + 2]!)}`)

      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const px = Math.round(diameter * dpr)
      if (canvas.width !== px) {
        canvas.width = px
        canvas.height = px
      }
      let scratch = scratchRef.current
      if (!scratch) {
        scratch = document.createElement('canvas')
        scratchRef.current = scratch
      }
      if (scratch.width !== w || scratch.height !== h) {
        scratch.width = w
        scratch.height = h
      }
      scratch.getContext('2d')!.putImageData(image, 0, 0)

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, px, px)
      ctx.save()
      ctx.beginPath()
      ctx.arc(px / 2, px / 2, px / 2 - 1, 0, Math.PI * 2)
      ctx.clip()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(scratch, 0, 0, w, h, 0, 0, px, px)
      // Sampled-pixel marker: one screen pixel scaled by the zoom.
      const cell = (px / w) | 0 || 1
      ctx.lineWidth = 1 * dpr
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeRect(
        px / 2 - cell / 2 - dpr,
        px / 2 - cell / 2 - dpr,
        cell + 2 * dpr,
        cell + 2 * dpr,
      )
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeRect(px / 2 - cell / 2, px / 2 - cell / 2, cell, cell)
      ctx.restore()
    },
    [diameter],
  )

  // One capture in flight at a time; the newest wanted position wins.
  const pump = useCallback(() => {
    const target = wanted.current
    if (!target || inFlight.current) return
    if (
      drawn.current &&
      drawn.current.x === target.x &&
      drawn.current.y === target.y
    ) {
      return
    }
    inFlight.current = true
    invoke<ArrayBuffer>('loupe_capture', {
      x: target.x,
      y: target.y,
      size: diameter / zoom.current,
    })
      .then((bytes) => {
        drawn.current = target
        paint(bytes)
      })
      .catch(console.error)
      .finally(() => {
        inFlight.current = false
        requestAnimationFrame(pump)
      })
  }, [paint, diameter])

  useEffect(() => {
    const un = listen<[number, number, number, number]>('loupe-open', (e) => {
      const p = { x: e.payload[0], y: e.payload[1] }
      zoom.current = e.payload[2] || 4
      setDiameter(e.payload[3] || 352)
      drawn.current = null
      setHex(null)
      wanted.current = p
      setPos(p)
      pump()
    })
    return () => {
      un.then((u) => u())
    }
  }, [pump])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = { x: e.clientX, y: e.clientY }
      wanted.current = p
      setPos(p)
      pump()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        invoke('loupe_done', { hex: null }).catch(console.error)
      }
    }
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      invoke('loupe_done', { hex }).catch(console.error)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [pump, hex])

  return (
    <div className="loupe-stage">
      {pos && (
        <div
          className="loupe"
          style={{
            left: pos.x - diameter / 2,
            top: pos.y - diameter / 2,
            width: diameter,
            height: diameter,
          }}
        >
          <canvas ref={canvasRef} className="loupe-canvas" />
          <div className="loupe-ring" />
          {hex && (
            <div className="loupe-label">
              <span className="loupe-swatch" style={{ background: hex }} />
              {hex}
            </div>
          )}
        </div>
      )}
      <div className="loupe-hint">click to copy · esc to cancel</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Loupe />)
