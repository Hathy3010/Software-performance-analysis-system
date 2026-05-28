import PropTypes from 'prop-types'
import { createContext, useContext, useState } from 'react'

export const RANGE_OPTIONS = [
  { label: '15 m', hours: 0.25, step: 15   },
  { label: '1 h',  hours: 1,    step: 60   },
  { label: '6 h',  hours: 6,    step: 300  },
  { label: '24 h', hours: 24,   step: 900  },
  { label: '7 d',  hours: 168,  step: 3600 },
]

const TimeRangeContext = createContext(null)

export function TimeRangeProvider({ children }) {
  const [range, setRange] = useState(RANGE_OPTIONS[1])

  return (
    <TimeRangeContext.Provider value={{ range, setRange, options: RANGE_OPTIONS }}>
      {children}
    </TimeRangeContext.Provider>
  )
}

TimeRangeProvider.propTypes = { children: PropTypes.node.isRequired }

export function useTimeRange() {
  const ctx = useContext(TimeRangeContext)
  if (!ctx) throw new Error('useTimeRange must be used within TimeRangeProvider')
  return ctx
}
