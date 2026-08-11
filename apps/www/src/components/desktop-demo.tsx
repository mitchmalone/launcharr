/**
 * A mock macOS desktop around the demo panel: brand wallpaper, menubar, the
 * panel centered. Static — the scroll-driven expansion experiment is retired.
 */
export function DesktopDemo({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-(--hair)"
      style={{
        height: 600,
        background:
          'radial-gradient(120% 90% at 75% 10%, #3d2350 0%, #26203f 42%, #1c1d2d 75%, #14151f 100%)',
      }}
    >
      {/* pink aurora accent in the wallpaper */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 40% at 20% 85%, rgba(255,107,140,0.22) 0%, transparent 70%)',
        }}
      />

      {/* menubar */}
      <div className="absolute inset-x-0 top-0 z-10 flex h-7 items-center justify-between bg-[rgba(20,21,31,0.6)] px-4 font-sans text-[12px] text-[rgba(233,234,244,0.85)] backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-[13px]">🏴‍☠️</span>
          <span className="font-semibold">launcharr</span>
          <span className="opacity-70">File</span>
          <span className="opacity-70">Edit</span>
          <span className="opacity-70">View</span>
          <span className="opacity-70">Go</span>
        </div>
        <div className="flex items-center gap-3 opacity-80">
          <span>⚡︎ 100%</span>
          <span>⌥Space</span>
          <span>Sun 10 Aug</span>
          <span>9:41</span>
        </div>
      </div>

      {/* the panel hangs from the 1/3 line, Spotlight-style — the top edge never
          moves as results appear and the list grows downward */}
      <div
        className="relative z-10 flex h-full items-start justify-center px-8"
        style={{ paddingTop: 200 }}
      >
        {children}
      </div>
    </div>
  )
}
