import client from './client'

export const usersApi = {
  list:   (params) => client.get('/users', { params }).then((r) => r.data),
  me:     ()       => client.get('/users/me').then((r) => r.data),
  create: (data)   => client.post('/users', data).then((r) => r.data),
  update: (id, data) => client.patch(`/users/${id}`, data).then((r) => r.data),
  remove: (id)     => client.delete(`/users/${id}`),
}
