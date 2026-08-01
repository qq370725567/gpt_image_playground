import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { onDismissTooltips } from '../lib/tooltipDismiss'

interface ViewportTooltipProps {
  visible: boolean
  children: ReactNode
  className?: string
  /** 提示方向：top 显示在锚点上方（空间不足时自动下方），left 固定在锚点左侧垂直居中 */
  placement?: 'top' | 'left'
}

export default function ViewportTooltip({ visible, children, className = '', placement = 'top' }: ViewportTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
    arrowLeft?: number
    arrowTop?: number
    placement: 'top' | 'bottom' | 'left'
  } | null>(null)

  // Global dismiss: when any modal opens, suppress the tooltip even if
  // the parent still passes visible=true.  Reset when visible goes back
  // to false (so the next hover cycle works normally).
  const [suppressed, setSuppressed] = useState(false)

  useEffect(() => {
    if (!visible) {
      setSuppressed(false)
      return
    }
    return onDismissTooltips(() => setSuppressed(true))
  }, [visible])

  const effectiveVisible = visible && !suppressed

  // 检查锚点中心是否仍在最上层可命中（未被弹窗等遮挡）
  const isAnchorExposed = (anchor: HTMLElement, rect: DOMRect) => {
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return false
    const el = document.elementFromPoint(x, y)
    return !!el && anchor.contains(el)
  }

  useEffect(() => {
    if (!effectiveVisible) return

    const hideIfOutside = (event: PointerEvent | TouchEvent) => {
      const target = event.target
      const anchorParent = anchorRef.current?.parentElement
      if (!(target instanceof Node)) return
      if (anchorParent?.contains(target) || tooltipRef.current?.contains(target)) return
      setSuppressed(true)
    }

    document.addEventListener('pointerdown', hideIfOutside, true)
    document.addEventListener('touchstart', hideIfOutside, true)
    return () => {
      document.removeEventListener('pointerdown', hideIfOutside, true)
      document.removeEventListener('touchstart', hideIfOutside, true)
    }
  }, [effectiveVisible])

  useEffect(() => {
    if (!effectiveVisible) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current?.parentElement
      const el = tooltipRef.current
      if (!anchor || !el) return

      const margin = 8
      const gap = 8
      const anchorRect = anchor.getBoundingClientRect()
      if (!anchor.getClientRects().length || (anchorRect.width === 0 && anchorRect.height === 0)) {
        setPosition(null)
        return
      }
      if (!isAnchorExposed(anchor, anchorRect)) {
        setPosition(null)
        return
      }

      const tooltipRect = el.getBoundingClientRect()
      if (placement === 'left') {
        const top = Math.min(Math.max(anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2, margin), window.innerHeight - tooltipRect.height - margin)
        const left = Math.max(margin, anchorRect.left - tooltipRect.width - gap)
        const anchorCenterY = anchorRect.top + anchorRect.height / 2
        setPosition({
          left,
          top,
          arrowTop: anchorCenterY - top,
          placement: 'left',
        })
        return
      }
      const anchorCenter = anchorRect.left + anchorRect.width / 2
      const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin)
      const left = Math.min(Math.max(anchorCenter - tooltipRect.width / 2, margin), maxLeft)
      const aboveTop = anchorRect.top - tooltipRect.height - gap
      const verticalPlacement = aboveTop >= margin ? 'top' : 'bottom'
      const top = verticalPlacement === 'top' ? aboveTop : anchorRect.bottom + gap

      setPosition({
        left,
        top,
        arrowLeft: anchorCenter - left,
        placement: verticalPlacement,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [effectiveVisible, children])

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {effectiveVisible && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed pointer-events-none rounded-lg bg-gray-800 px-3 py-2 text-xs font-normal text-white shadow-lg ${className}`}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
            zIndex: 120,
          }}
        >
          {children}
          {position?.placement === 'left' ? (
            <div
              className="absolute top-0 left-full border-4 border-transparent border-l-gray-800"
              style={{
                top: position.arrowTop ?? 0,
                transform: 'translateY(-50%)',
              }}
            />
          ) : (
            <div
              className={`absolute left-0 border-4 border-transparent ${position?.placement === 'bottom' ? 'bottom-full border-b-gray-800' : 'top-full border-t-gray-800'}`}
              style={{
                left: position?.arrowLeft ?? 0,
                transform: 'translateX(-50%)',
              }}
            />
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
