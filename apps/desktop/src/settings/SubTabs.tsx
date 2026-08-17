/**
 * Second-level navigation inside a settings tab: a segmented strip under the
 * main tabstrip. Tabs that outgrow one page split into sub-tabs rather than
 * growing the top strip (which is also the titlebar and has no room).
 */
export default function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="subtabs" role="tablist">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          className={`subtab${value === id ? ' active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
