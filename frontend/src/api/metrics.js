import client from './client'

export const metricsApi = {
  getCurrent: () =>
    client.get('/metrics/current').then((r) => r.data),

  getHistory: (params = {}) =>
    client.get('/metrics/history', { params }).then((r) => r.data),

  getForecast: (params = {}) =>
    client.get('/metrics/forecast', { params }).then((r) => r.data),
}
