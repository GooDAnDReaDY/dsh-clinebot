function FallbackChevron() {
  return React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true },
    React.createElement('path', {
      d: 'M3.5 5.25L7 8.75L10.5 5.25',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  )
}
let ChevronIcon = null
try {
  const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
  ChevronIcon = primitives && (primitives.IconChevronDownOutline14 || primitives.IconChevronDownOutline)
} catch (_) {
  ChevronIcon = null
}
const Chevron = ChevronIcon || FallbackChevron
