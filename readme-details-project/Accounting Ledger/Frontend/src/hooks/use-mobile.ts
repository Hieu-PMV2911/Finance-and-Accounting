import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * Theo dõi viewport có phải thiết bị di động hay không.
 *
 * Dùng `useSyncExternalStore` (thay vì `useState` + `useEffect`) để vừa đọc
 * đúng giá trị ngay từ lần render đầu, vừa tránh `setState` trong effect.
 */
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
