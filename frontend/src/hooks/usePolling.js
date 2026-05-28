import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling(fn, intervalMs, { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const execute = useCallback(async () => {
    try {
      const result = await fnRef.current()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + recurring interval
  useEffect(() => {
    const disabled = intervalMs == null
    if (immediate) execute()
    if (disabled) return
    const id = setInterval(execute, intervalMs)
    return () => clearInterval(id)
  }, [execute, intervalMs, immediate])

  // Re-fetch immediately when the fetch function identity changes
  // (e.g. quantile filter, status filter, or any useCallback dep changes)
  const prevFnRef = useRef(fn)
  useEffect(() => {
    if (prevFnRef.current !== fn) {
      prevFnRef.current = fn
      execute()
    }
  }, [fn, execute])

  return { data, loading, error, refetch: execute }
}
