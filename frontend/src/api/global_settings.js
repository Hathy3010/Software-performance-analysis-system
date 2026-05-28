import client from './client'

export const globalSettingsApi = {
  get:             ()       => client.get('/global-settings').then((r) => r.data),
  update:          (data)   => client.patch('/global-settings', data).then((r) => r.data),
  getSystemLogs:   (limit)  => client.get('/global-settings/notification-logs', { params: { limit } }).then((r) => r.data),
}
