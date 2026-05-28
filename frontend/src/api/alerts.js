import client from './client'

export const alertsApi = {
  list:        (params)         => client.get('/alerts', { params }).then((r) => r.data),
  get:         (id)             => client.get(`/alerts/${id}`).then((r) => r.data),
  update:      (id, data)       => client.patch(`/alerts/${id}`, data).then((r) => r.data),
  acknowledge: (id, comment)    => client.post(`/alerts/${id}/acknowledge`, { comment }).then((r) => r.data),
}
