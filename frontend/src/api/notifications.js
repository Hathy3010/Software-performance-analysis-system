import client from './client'

export const notificationsApi = {
  getSettings:    ()       => client.get('/notifications/settings').then((r) => r.data),
  updateSettings: (data)   => client.patch('/notifications/settings', data).then((r) => r.data),
  getLogs:        (params) => client.get('/notifications/logs', { params }).then((r) => r.data),
}
