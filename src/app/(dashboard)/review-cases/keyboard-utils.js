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

  const panel = e.currentTarget
  const startX = e.clientX
  const startY = e.clientY

  const onMouseUp = (upEvent) => {
    document.removeEventListener('mouseup', onMouseUp)
    const moved = Math.abs(upEvent.clientX - startX) > 3 || Math.abs(upEvent.clientY - startY) > 3
    const hasSelection = Boolean(window.getSelection()?.toString().length)
    if (!moved && !hasSelection) {
      panel.focus({ preventScroll: true })
    }
  }

  document.addEventListener('mouseup', onMouseUp)
}
