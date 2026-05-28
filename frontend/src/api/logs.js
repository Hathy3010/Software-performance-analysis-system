import client from './client'

export const logsApi = {
  list: (params) => client.get('/logs', { params }).then((r) => r.data),
}
