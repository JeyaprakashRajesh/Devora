import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { formatDate } from '../../../lib/format'
import { useAuthStore } from '../../../store/auth'
import type { GroupItem, Project, ProjectMember, RoleItem, UserItem } from '../types'
import { unwrapData } from '../utils'
import { useProject } from './ProjectLayout'

type ProjectGroup = {
  id: string
  name: string
  member_count: number
  role_id?: string
  role_name?: string
}

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const { project } = useProject()

  const [projectName, setProjectName] = useState(project.name)
  const [projectDescription, setProjectDescription] = useState(project.description ?? '')
  const [projectVisibility, setProjectVisibility] = useState(project.visibility)

  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')

  if (!can('project', 'manage')) {
    return <Navigate to={`/projects/${projectId}`} replace />
  }

  const membersQuery = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/members`)
      return unwrapData<{ members: ProjectMember[]; total: number }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const groupsQuery = useQuery({
    queryKey: ['org-groups'],
    queryFn: async () => {
      const res = await api.get('/groups')
      return unwrapData<GroupItem[]>(res.data)
    },
  })

  const projectGroupsQuery = useQuery({
    queryKey: ['project-groups', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/groups`)
      return unwrapData<{ groups: ProjectGroup[] }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users')
      return unwrapData<UserItem[]>(res.data)
    },
  })

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get('/roles')
      return unwrapData<RoleItem[]>(res.data)
    },
  })

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/projects/${projectId}`, {
        name: projectName,
        description: projectDescription,
        visibility: projectVisibility,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/members`, {
        user_id: selectedUserId,
        role_id: selectedRoleId || null,
      })
    },
    onSuccess: () => {
      setSelectedUserId('')
      setSelectedRoleId('')
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/projects/${projectId}/members/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
    },
  })

  const addGroupMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/groups`, { group_id: selectedGroupId })
    },
    onSuccess: () => {
      setSelectedGroupId('')
      queryClient.invalidateQueries({ queryKey: ['project-groups', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
    },
  })

  const removeGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await api.delete(`/projects/${projectId}/groups/${groupId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-groups', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
    },
  })

  const members = membersQuery.data?.members ?? []
  const projectGroups = projectGroupsQuery.data?.groups ?? []

  const filteredUsers = useMemo(() => {
    const search = userSearch.toLowerCase().trim()
    const existing = new Set(members.map((m) => m.id))
    return (usersQuery.data ?? [])
      .filter((u) => !existing.has(u.id))
      .filter((u) => {
        if (!search) return true
        return (
          u.username.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          (u.display_name ?? '').toLowerCase().includes(search)
        )
      })
  }, [members, usersQuery.data, userSearch])

  const assignableGroups = useMemo(() => {
    const existing = new Set(projectGroups.map((g) => g.id))
    return (groupsQuery.data ?? []).filter((group) => !existing.has(group.id))
  }, [groupsQuery.data, projectGroups])

  return (
    <div className="space-y-6">
      <Card header="General Settings" padding="md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Visibility</label>
            <select
              value={projectVisibility}
              onChange={(e) => setProjectVisibility(e.target.value as Project['visibility'])}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="private">private</option>
              <option value="internal">internal</option>
              <option value="public">public</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-xs text-text-secondary font-medium">Description</label>
          <textarea
            rows={4}
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <Button
          className="mt-3"
          loading={updateProjectMutation.isPending}
          onClick={() => updateProjectMutation.mutate()}
        >
          Save Changes
        </Button>
      </Card>

      <Card header="Members" padding="none">
        {membersQuery.isLoading ? (
          <div className="py-10 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">User</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Role</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Added</th>
              <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar size="sm" name={member.display_name ?? member.username} />
                    <div>
                      <p className="text-sm text-text-primary">{member.display_name ?? member.username}</p>
                      <p className="text-xs text-text-muted">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">{member.role_name ?? 'Member'}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {member.added_at ? formatDate(member.added_at) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={removeMemberMutation.isPending}
                    onClick={() => removeMemberMutation.mutate(member.id)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-border p-4">
          <p className="text-xs text-text-muted mb-2">Add Member</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              placeholder="Search users"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />

            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select user</option>
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name ?? user.username}
                </option>
              ))}
            </select>

            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="">No role</option>
              {(rolesQuery.data ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            className="mt-2"
            disabled={!selectedUserId}
            loading={addMemberMutation.isPending}
            onClick={() => addMemberMutation.mutate()}
          >
            Add Member
          </Button>
        </div>
      </Card>

      <Card header="Groups" padding="none">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Group name</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Members</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Role</th>
              <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projectGroups.map((group) => (
              <tr key={group.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm text-text-primary">{group.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{group.member_count}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{group.role_name ?? 'Default'}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={removeGroupMutation.isPending}
                    onClick={() => removeGroupMutation.mutate(group.id)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-border p-4 flex items-center gap-2">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary w-full md:w-auto md:min-w-[260px]"
          >
            <option value="">Select group</option>
            {assignableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <Button
            disabled={!selectedGroupId}
            loading={addGroupMutation.isPending}
            onClick={() => addGroupMutation.mutate()}
          >
            Add Group
          </Button>
        </div>
      </Card>
    </div>
  )
}
