import client from './client'

export const servicesApi = {
  list: (params) => client.get('/services', { params }).then((r) => r.data),
  get: (id) => client.get(`/services/${id}`).then((r) => r.data),
  create: (data) => client.post('/services', data).then((r) => r.data),
  update: (id, data) => client.put(`/services/${id}`, data).then((r) => r.data),
  delete: (id) => client.delete(`/services/${id}`).then((r) => r.data),
}
