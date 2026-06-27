/** True when the element is a text-editing control that should keep arrow keys. */
export function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tag = target.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true

  if (tag === 'INPUT') {
    const type = (target.type || 'text').toLowerCase()
    return !['checkbox', 'radio', 'hidden', 'button', 'submit', 'reset', 'file'].includes(type)
  }

  return false
}

/** Focus a scroll panel when clicking non-interactive content so arrow keys scroll it. */
export function focusScrollPanelOnPointerDown(e) {
  if (e.target.closest('button, a, input, textarea, select, label, [role="switch"], [role="checkbox"]')) {
    return
  }
  e.preventDefault()
  e.currentTarget.focus({ preventScroll: true })
}
