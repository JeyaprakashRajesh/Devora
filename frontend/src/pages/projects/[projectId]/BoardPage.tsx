import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useParams } from 'react-router-dom'
import Badge from '../../../components/ui/Badge'
import { api } from '../../../lib/api'
import type { Issue } from '../types'
import { unwrapData } from '../utils'

type ColumnStatus = 'open' | 'in_progress' | 'closed'

type BoardColumns = Record<ColumnStatus, Issue[]>

const columnDefinitions: Array<{ id: ColumnStatus; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'closed', label: 'Closed' },
]

function priorityBadge(priority: Issue['priority']) {
  if (priority === 'critical') return <Badge variant="error">Critical</Badge>
  if (priority === 'high') return <Badge variant="warning">High</Badge>
  if (priority === 'medium') return <Badge variant="info">Medium</Badge>
  return <Badge variant="default">Low</Badge>
}

function typeBadge(type: Issue['type']) {
  if (type === 'bug') return <Badge variant="error">Bug</Badge>
  if (type === 'feature') return <Badge variant="info">Feature</Badge>
  return <Badge variant="default">Task</Badge>
}

function IssueCard({ issue }: { issue: Issue }) {
  const sortable = useSortable({ id: issue.id, data: { issue } })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
      className="bg-bg-surface border border-border rounded p-3 cursor-grab hover:border-accent-amber/40 shadow-sm"
    >
      <p className="text-sm font-medium text-text-primary">{issue.title}</p>
      <div className="mt-2 flex items-center gap-2">
        {priorityBadge(issue.priority)}
        {typeBadge(issue.type)}
        <span className="text-xs text-text-muted">#{issue.number}</span>
      </div>
    </div>
  )
}

function BoardColumn({ id, label, issues }: { id: ColumnStatus; label: string; issues: Issue[] }) {
  const droppable = useDroppable({ id })

  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-text-muted font-medium pb-3 mb-3 border-b border-border flex items-center gap-2">
        <span>{label}</span>
        <span className="bg-bg-elevated px-2 py-0.5 rounded text-xs text-text-secondary">{issues.length}</span>
      </div>
      <div
        ref={droppable.setNodeRef}
        className="flex flex-col gap-2 min-h-[200px] p-2 bg-bg-subtle rounded-lg"
      >
        <SortableContext
          items={issues.map((issue) => issue.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()

  const [localColumns, setLocalColumns] = useState<BoardColumns | null>(null)

  const boardQuery = useQuery({
    queryKey: ['board-issues', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/issues?limit=100`)
      return unwrapData<{ issues: Issue[] }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ issueNumber, status }: { issueNumber: number; status: ColumnStatus }) => {
      await api.patch(`/projects/${projectId}/issues/${issueNumber}`, { status })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board-issues', projectId] })
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
    },
  })

  const columns = useMemo<BoardColumns>(() => {
    if (localColumns) return localColumns

    const grouped: BoardColumns = {
      open: [],
      in_progress: [],
      closed: [],
    }

    for (const issue of boardQuery.data?.issues ?? []) {
      grouped[issue.status].push(issue)
    }

    return grouped
  }, [boardQuery.data?.issues, localColumns])

  const sensors = useSensors(useSensor(PointerSensor))

  const findIssue = (issueId: string): { issue: Issue; from: ColumnStatus } | null => {
    for (const key of ['open', 'in_progress', 'closed'] as ColumnStatus[]) {
      const found = columns[key].find((issue) => issue.id === issueId)
      if (found) return { issue: found, from: key }
    }
    return null
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    if (!overId) return

    const found = findIssue(activeId)
    if (!found) return

    const destination: ColumnStatus | null =
      overId === 'open' || overId === 'in_progress' || overId === 'closed'
        ? overId
        : findIssue(overId)?.from ?? null

    if (!destination || destination === found.from) return

    const previous = columns
    const next: BoardColumns = {
      open: [...columns.open],
      in_progress: [...columns.in_progress],
      closed: [...columns.closed],
    }

    next[found.from] = next[found.from].filter((issue) => issue.id !== found.issue.id)
    next[destination] = [
      { ...found.issue, status: destination },
      ...next[destination],
    ]
    setLocalColumns(next)

    updateMutation.mutate(
      { issueNumber: found.issue.number, status: destination },
      {
        onError: () => {
          setLocalColumns(previous)
        },
      },
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {columnDefinitions.map((col) => (
          <BoardColumn key={col.id} id={col.id} label={col.label} issues={columns[col.id]} />
        ))}
      </div>
    </DndContext>
  )
}
