import client from './client'

export const tracesApi = {
  list: (params = {}) =>
    client.get('/traces', { params }).then((r) => r.data),

  get: (traceId) =>
    client.get(`/traces/${traceId}`).then((r) => r.data),

  dependencyMap: (lookbackHours = 1) =>
    client.get('/services/dependency-map', { params: { lookback_hours: lookbackHours } }).then((r) => r.data),
}
