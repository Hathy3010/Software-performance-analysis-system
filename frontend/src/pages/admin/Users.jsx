import PropTypes from 'prop-types'
import { useState, useCallback } from 'react'
import {
  Users, Plus, Pencil, Trash2, ShieldCheck, BarChart2, Eye,
  CheckCircle, XCircle, Search, X, AlertTriangle,
} from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { usePolling } from '@/hooks/usePolling'
import { useToast } from '@/contexts/ToastContext'
import { usersApi } from '@/api/users'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES = ['admin', 'analyst', 'viewer']

const ROLE_META = {
  admin:   { label: 'Admin',   color: 'text-red-400',   bg: 'bg-red-900/30 border-red-700/50',   Icon: ShieldCheck },
  analyst: { label: 'Analyst', color: 'text-blue-400',  bg: 'bg-blue-900/30 border-blue-700/50', Icon: BarChart2   },
  viewer:  { label: 'Viewer',  color: 'text-gray-400',  bg: 'bg-gray-700/30 border-gray-600/50', Icon: Eye         },
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] ?? ROLE_META.viewer
  const { Icon } = meta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color} ${meta.bg}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
}
RoleBadge.propTypes = { role: PropTypes.string.isRequired }

function StatusDot({ active }) {
  return active
    ? <span className="inline-flex items-center gap-1.5 text-xs text-green-400"><span className="h-1.5 w-1.5 rounded-full bg-green-400" />Active</span>
    : <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-600" />Inactive</span>
}
StatusDot.propTypes = { active: PropTypes.bool.isRequired }

// ── User form modal ───────────────────────────────────────────────────────────

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    username: user?.username ?? '',
    email:    user?.email    ?? '',
    role:     user?.role     ?? 'viewer',
    is_active: user?.is_active ?? true,
    password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isEdit = Boolean(user)

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { username: form.username, email: form.email, role: form.role, is_active: form.is_active }
      if (!isEdit || form.password) payload.password = form.password
      if (!isEdit) payload.password = form.password
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            {isEdit ? 'Edit User' : 'Create User'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-900/30 border border-red-700/50 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
            <input
              required
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              className="w-full h-9 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm
                         text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="johndoe"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="w-full h-9 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm
                         text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Password {isEdit && <span className="text-gray-600">(leave blank to keep current)</span>}
            </label>
            <input
              required={!isEdit}
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className="w-full h-9 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm
                         text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={isEdit ? '••••••••' : 'Min 8 characters'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className="w-full h-9 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm
                         text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('is_active', !form.is_active)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors
                  ${form.is_active ? 'bg-blue-600 border-blue-600' : 'bg-gray-700 border-gray-600'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform
                  transition-transform mt-px ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-gray-300">Account active</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white
                         rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
UserModal.propTypes = {
  user:    PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave:  PropTypes.func.isRequired,
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ user, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  async function handle() {
    setDeleting(true)
    await onConfirm()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-red-800/50 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-red-900/40 border border-red-700/50 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Delete User</p>
            <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-5">
          Delete <span className="font-medium text-white">{user.username}</span>{' '}
          ({user.email})? All their data will be removed.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handle}
            className="h-9 px-4 text-sm font-medium bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
DeleteConfirm.propTypes = {
  user:      PropTypes.object.isRequired,
  onClose:   PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const toast = useToast()
  const [search, setSearch]     = useState('')
  const [roleFilter, setRole]   = useState('all')
  const [editUser,  setEdit]    = useState(null)
  const [deleteUser, setDelete] = useState(null)
  const [showCreate, setCreate] = useState(false)

  const fetchFn = useCallback(() => usersApi.list({ limit: 200 }), [])
  const { data, refetch } = usePolling(fetchFn, 30000)
  const allUsers = data?.items ?? []

  const users = allUsers.filter((u) => {
    const matchRole  = roleFilter === 'all' || u.role === roleFilter
    const matchSearch = !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  async function handleCreate(payload) {
    await usersApi.create(payload)
    toast('User created', 'success')
    refetch()
  }

  async function handleUpdate(payload) {
    await usersApi.update(editUser.id, payload)
    toast('User updated', 'success')
    refetch()
  }

  async function handleDelete() {
    await usersApi.remove(deleteUser.id)
    toast('User deleted', 'success')
    refetch()
  }

  const counts = { total: allUsers.length, active: allUsers.filter((u) => u.is_active).length }

  return (
    <DashboardLayout>
      <PageHeader
        title="User Management"
        subtitle={`${counts.total} users · ${counts.active} active`}
      />

      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {['admin', 'analyst', 'viewer'].map((r) => {
          const n = allUsers.filter((u) => u.role === r).length
          const meta = ROLE_META[r]
          const { Icon } = meta
          return (
            <div key={r} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${meta.color}`} />
                <p className="text-xs text-gray-400 uppercase tracking-wider">{meta.label}s</p>
              </div>
              <p className="text-2xl font-bold text-white">{n}</p>
            </div>
          )
        })}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-gray-500" />
            <p className="text-xs text-gray-400 uppercase tracking-wider">Inactive</p>
          </div>
          <p className="text-2xl font-bold text-white">{allUsers.filter((u) => !u.is_active).length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="h-8 pl-9 pr-4 bg-gray-900 border border-gray-700 rounded-lg text-sm
                         text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>
          <div className="flex items-center gap-1">
            {['all', ...ROLES].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`h-8 px-3 rounded-lg text-xs font-medium capitalize transition-colors ${
                  roleFilter === r
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-700/50'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreate(true)}
          className="flex items-center gap-2 h-8 px-4 bg-blue-600 hover:bg-blue-500 text-white
                     text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New User
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900/50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Last Updated</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-gray-500">
                  <Users className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-gray-300">
                          {u.username[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{u.username}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4"><RoleBadge role={u.role} /></td>
                  <td className="py-3 px-4">
                    {u.is_active
                      ? <span className="inline-flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="h-3.5 w-3.5" />Active</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><XCircle className="h-3.5 w-3.5" />Inactive</span>
                    }
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">
                    {new Date(u.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEdit(u)}
                        className="h-7 w-7 flex items-center justify-center rounded text-gray-400
                                   hover:text-white hover:bg-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDelete(u)}
                        className="h-7 w-7 flex items-center justify-center rounded text-gray-400
                                   hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <UserModal onClose={() => setCreate(false)} onSave={handleCreate} />}
      {editUser   && <UserModal user={editUser} onClose={() => setEdit(null)} onSave={handleUpdate} />}
      {deleteUser && <DeleteConfirm user={deleteUser} onClose={() => setDelete(null)} onConfirm={handleDelete} />}
    </DashboardLayout>
  )
}
