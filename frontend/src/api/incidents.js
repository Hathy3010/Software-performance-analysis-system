import client from './client'

export const incidentsApi = {
  list: (params) => client.get('/incidents', { params }).then((r) => r.data),
  get: (id) => client.get(`/incidents/${id}`).then((r) => r.data),
  create: (data) => client.post('/incidents', data).then((r) => r.data),
  update: (id, data) => client.patch(`/incidents/${id}`, data).then((r) => r.data),
  resolve: (id) => client.post(`/incidents/${id}/resolve`).then((r) => r.data),
  getRca: (id) => client.get(`/incidents/${id}/rca`).then((r) => r.data),
}
