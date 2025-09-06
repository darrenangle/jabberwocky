import React from "react";

const OverlayChips = React.forwardRef(function OverlayChips(
  { allModels, selected, colorMap, onToggle, onAll, onNone, bottom = false, onHover, floating = false },
  ref
) {
  return (
    <div
      ref={ref}
      className={
        floating
          ? `radar-overlay ${bottom ? 'bottom' : ''}`
          : 'radar-controls-bar'
      }
    >
      <button className="chip action" onClick={onAll} title="Enable all">All</button>
      <button className="chip action" onClick={onNone} title="Disable all">None</button>
      <div className="chip-scroll">
        {allModels.map((m) => {
          const active = selected.has(m.slug);
          const activeStyle = active
            ? {
                borderColor: colorMap[m.slug],
                background: `${colorMap[m.slug]}22`,
              }
            : {};
          return (
            <button
              key={m.slug}
              className={`chip ${active ? 'active' : ''}`}
              onClick={() => onToggle(m.slug)}
              title={m.id}
              onMouseEnter={() => onHover && onHover(m.slug)}
              onMouseLeave={() => onHover && onHover(null)}
              onFocus={() => onHover && onHover(m.slug)}
              onBlur={() => onHover && onHover(null)}
              style={activeStyle}
            >
              <span className="dot" style={{ background: colorMap[m.slug] }} />
              <span className="label">{m.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default OverlayChips;
