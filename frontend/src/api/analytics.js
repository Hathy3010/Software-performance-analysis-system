import client from './client'

export const analyticsApi = {
  httpBreakdown: (params = {}) =>
    client.get('/analytics/http-breakdown', { params }).then((r) => r.data),

  requestVolume: (params = {}) =>
    client.get('/analytics/request-volume', { params }).then((r) => r.data),

  errorRate: (params = {}) =>
    client.get('/analytics/error-rate', { params }).then((r) => r.data),

  dbQueries: (params = {}) =>
    client.get('/analytics/db-queries', { params }).then((r) => r.data),

  exceptions: (params = {}) =>
    client.get('/analytics/exceptions', { params }).then((r) => r.data),

  anomalyHistory: (params = {}) =>
    client.get('/analytics/anomaly-history', { params }).then((r) => r.data),
}
