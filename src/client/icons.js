/**
 * Calm 16px stroke icons. They inherit `currentColor` and never carry emoji or
 * hardcoded palette values, so they follow the host theme in both modes.
 */
function CbIcon({ name, size = 16, className }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: className || 'cb-icon',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  const children = []
  switch (name) {
    case 'search':
      children.push(
        React.createElement('circle', { key: 'c', cx: 7, cy: 7, r: 4.5 }),
        React.createElement('path', { key: 'l', d: 'M10.5 10.5 14 14' })
      )
      break
    case 'plus':
      children.push(
        React.createElement('path', { key: 'v', d: 'M8 3v10' }),
        React.createElement('path', { key: 'h', d: 'M3 8h10' })
      )
      break
    case 'close':
      children.push(React.createElement('path', { key: 'x', d: 'm4 4 8 8M12 4l-8 8' }))
      break
    case 'check':
      children.push(React.createElement('path', { key: 'p', d: 'm3.5 8.5 3 3 6-7' }))
      break
    case 'warning':
      children.push(
        React.createElement('path', { key: 't', d: 'M8 2 14 13H2Z' }),
        React.createElement('path', { key: 'l', d: 'M8 6v3' }),
        React.createElement('circle', { key: 'd', cx: 8, cy: 11.2, r: 0.6, fill: 'currentColor', stroke: 'none' })
      )
      break
    case 'error':
      children.push(
        React.createElement('circle', { key: 'c', cx: 8, cy: 8, r: 6 }),
        React.createElement('path', { key: 'l', d: 'M8 4.5v4' }),
        React.createElement('circle', { key: 'd', cx: 8, cy: 11.4, r: 0.6, fill: 'currentColor', stroke: 'none' })
      )
      break
    case 'download':
      children.push(
        React.createElement('path', { key: 'a', d: 'M8 2v7' }),
        React.createElement('path', { key: 'b', d: 'm5 6.5 3 3 3-3' }),
        React.createElement('path', { key: 'c', d: 'M3 12.5h10' })
      )
      break
    case 'chevron':
      children.push(React.createElement('path', { key: 'p', d: 'm6 4 4 4-4 4' }))
      break
    case 'kebab':
      children.push(
        React.createElement('circle', { key: 'a', cx: 8, cy: 3.5, r: 1, fill: 'currentColor', stroke: 'none' }),
        React.createElement('circle', { key: 'b', cx: 8, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }),
        React.createElement('circle', { key: 'c', cx: 8, cy: 12.5, r: 1, fill: 'currentColor', stroke: 'none' })
      )
      break
    case 'key':
      children.push(
        React.createElement('circle', { key: 'c', cx: 5, cy: 8, r: 2.5 }),
        React.createElement('path', { key: 'a', d: 'M7.5 8H14' }),
        React.createElement('path', { key: 'b', d: 'M11.5 8v2' }),
        React.createElement('path', { key: 'd', d: 'M13.5 8v1.5' })
      )
      break
    case 'edit':
      children.push(
        React.createElement('path', { key: 'a', d: 'M3 13l.5-3L11 2.5 13.5 5 6 12.5Z' }),
        React.createElement('path', { key: 'b', d: 'm9.5 4 2.5 2.5' })
      )
      break
    case 'trash':
      children.push(
        React.createElement('path', { key: 'a', d: 'M3 5h10' }),
        React.createElement('path', { key: 'b', d: 'M6 5V3.5h4V5' }),
        React.createElement('path', { key: 'c', d: 'M4.5 5 5 13h6l.5-8' })
      )
      break
    case 'route':
      children.push(
        React.createElement('path', { key: 'a', d: 'M3 5h6a2 2 0 0 1 0 4H5a2 2 0 0 0 0 4h8' }),
        React.createElement('path', { key: 'b', d: 'm11 10 2 3-2 3' })
      )
      break
    case 'refresh':
      children.push(
        React.createElement('path', { key: 'a', d: 'M13 8a5 5 0 1 1-1.5-3.5' }),
        React.createElement('path', { key: 'b', d: 'M13 2.5V6h-3.5' })
      )
      break
    case 'account':
      children.push(
        React.createElement('circle', { key: 'a', cx: 8, cy: 5.5, r: 2.5 }),
        React.createElement('path', { key: 'b', d: 'M3 13c.6-2.5 2.6-4 5-4s4.4 1.5 5 4' })
      )
      break
    default:
      children.push(React.createElement('circle', { key: 'c', cx: 8, cy: 8, r: 6 }))
  }
  return React.createElement('svg', common, children)
}
