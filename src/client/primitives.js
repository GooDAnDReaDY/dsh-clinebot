// The shell's module table provides the design-system primitives, so the plugin
// renders the same controls (and inherits the same hover/focus/disabled treatment)
// as the native settings surfaces instead of re-drawing them. Every lookup is
// defensive: a missing primitive degrades to the plugin's own styled fallback
// rather than failing the render.
let primitives = null
try {
  primitives = require('@deepseek-ai/dsh-client-ui-primitives') || null
} catch (_) {
  primitives = null
}

/** Native toggle for boolean preferences; falls back to a checkbox. */
const Switch = (primitives && primitives.Switch) || null

/** Native dialog window; the plugin draws a plainer one when it is absent. */
const Modal = (primitives && primitives.Modal) || null

/**
 * Boolean preference control: the native Switch when the shell provides it, the
 * plugin's own checkbox otherwise. Both take the same `checked`/`disabled`/`onChange`.
 * @param props - checked state, change handler, accessible label and disabled flag.
 * @returns the control element.
 */
function BooleanControl(props) {
  const { checked, disabled, label, onChange } = props
  if (Switch) {
    return React.createElement(Switch, {
      checked: !!checked,
      disabled: !!disabled,
      label,
      onChange: (next) => { if (typeof onChange === 'function') onChange(next) },
    })
  }
  return React.createElement('input', {
    type: 'checkbox',
    style: { cursor: disabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px', flex: 'none' },
    checked: !!checked,
    disabled: !!disabled,
    'aria-label': label,
    onChange: (e) => { if (typeof onChange === 'function') onChange(e.target.checked) },
  })
}
