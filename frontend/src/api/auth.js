import client from './client'

export const authApi = {
  login: (username, password) =>
    client.post('/auth/login', { username, password }).then((r) => r.data),

  refresh: (refresh_token) =>
    client.post('/auth/refresh', { refresh_token }).then((r) => r.data),
}
