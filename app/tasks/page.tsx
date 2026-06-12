"use client"

// 全局 Tasks 页面：跨项目展示同一张 tasks 表中的执行项。

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, CheckCircle2, ChevronDown, Circle, Filter, Pencil, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  listAllTasks,
  listProjects,
  listRequirementsByProject,
  updateTask,
  updateTaskStatus,
  type Priority,
  type ProjectRecord,
  type RequirementRecord,
  type TaskFilters,
  type TaskRecord,
  type TaskStatus,
} from "@/lib/hora-db"

const TASK_STATUS_TEXT: Record<TaskStatus, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "完成",
  cancelled: "取消",
}

const PRIORITY_TEXT: Record<Priority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
}

const TASK_FILTER_STORAGE_KEY = "hora_tasks_filters"
const EMPTY_FILTERS: TaskFilters = {}

export default function TasksPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [requirements, setRequirements] = useState<RequirementRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null)
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "normal" as Priority,
    dueAt: "",
  })
  const [error, setError] = useState<string | null>(null)

  const refreshTasks = async (nextFilters = filters) => {
    const rows = await listAllTasks(nextFilters)
    setTasks(sortTasksForDisplay(rows))
  }

  useEffect(() => {
    const run = async () => {
      try {
        setError(null)
        const savedFilters = loadSavedTaskFilters()
        setFilters(savedFilters)
        const projectRows = await listProjects()
        setProjects(projectRows)
        const requirementRows = (await Promise.all(projectRows.map((project) => listRequirementsByProject(project.id)))).flat()
        setRequirements(requirementRows)
        await refreshTasks(savedFilters)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载任务失败")
      }
    }

    void run()
  }, [])

  const visibleRequirements = useMemo(() => {
    if (!filters.projectId) return requirements
    return requirements.filter((requirement) => requirement.projectId === filters.projectId)
  }, [filters.projectId, requirements])

  const updateFilters = async (nextFilters: TaskFilters) => {
    const normalizedFilters = normalizeTaskFilters(nextFilters)
    setFilters(normalizedFilters)
    window.localStorage.setItem(TASK_FILTER_STORAGE_KEY, JSON.stringify(normalizedFilters))
    await refreshTasks(normalizedFilters)
  }

  const clearFilters = async () => {
    window.localStorage.removeItem(TASK_FILTER_STORAGE_KEY)
    await updateFilters(EMPTY_FILTERS)
  }

  const handleToggleDone = async (task: TaskRecord, done: boolean) => {
    try {
      setError(null)
      await updateTaskStatus({ id: task.id, done })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新任务失败")
    }
  }

  const handleChangeStatus = async (task: TaskRecord, status: TaskStatus) => {
    try {
      setError(null)
      await updateTask({ id: task.id, status, isCompleted: status === "done" })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新任务状态失败")
    }
  }

  const toggleStatusFilter = async (status: TaskStatus) => {
    const currentStatuses = filters.statuses || []
    const nextStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((item) => item !== status)
      : [...currentStatuses, status]
    await updateFilters({ ...filters, status: "", statuses: nextStatuses })
  }

  const openEditTask = (task: TaskRecord) => {
    setEditingTask(task)
    setTaskForm({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt || "",
    })
  }

  const handleSaveTask = async () => {
    if (!editingTask) return
    const title = taskForm.title.trim()
    if (!title) return

    try {
      setError(null)
      await updateTask({
        id: editingTask.id,
        title,
        description: taskForm.description.trim() || null,
        status: taskForm.status,
        priority: taskForm.priority,
        dueAt: taskForm.dueAt || null,
        isCompleted: taskForm.status === "done",
      })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败")
    }
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden pt-1">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-xs text-neutral-500">跨项目执行视图，数据来自同一张 tasks 表。</p>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="mt-3 shrink-0 rounded-lg border border-neutral-200 bg-white p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Filter className="size-3.5" />
            筛选
          </div>
          <Button type="button" size="xs" variant="outline" onClick={() => void clearFilters()}>
            <RotateCcw className="size-3.5" />
            清除选项
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
          <select
            value={filters.projectId || ""}
            onChange={(event) => void updateFilters({ ...filters, projectId: event.target.value || undefined, requirementId: undefined })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">全部项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
          <select
            value={filters.requirementId || ""}
            onChange={(event) => void updateFilters({ ...filters, requirementId: event.target.value || undefined })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">全部需求</option>
            {visibleRequirements.map((requirement) => (
              <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
            ))}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-8 justify-between px-2 text-xs">
                {formatStatusFilter(filters.statuses)}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-xs">
              {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void toggleStatusFilter(value as TaskStatus)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-neutral-100"
                >
                  <span className={(filters.statuses || []).includes(value as TaskStatus)
                    ? "flex size-3.5 items-center justify-center rounded border border-neutral-900 bg-neutral-900 text-white"
                    : "size-3.5 rounded border border-neutral-300"
                  }>
                    {(filters.statuses || []).includes(value as TaskStatus) ? <Check className="size-3" /> : null}
                  </span>
                  {label}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <select
            value={filters.priority || ""}
            onChange={(event) => void updateFilters({ ...filters, priority: (event.target.value || "") as Priority | "" })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">全部优先级</option>
            {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
        <div className="sticky top-0 z-10 grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1fr_0.8fr_1fr_0.5fr] border-b bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500">
          <span>任务</span>
          <span>状态</span>
          <span>优先级</span>
          <span>项目</span>
          <span>需求</span>
          <span>截止</span>
          <span>更新时间</span>
          <span className="text-right">编辑</span>
        </div>

        {tasks.map((task) => {
          const done = task.isCompleted === 1 || task.status === "done"
          return (
            <article key={task.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1fr_0.8fr_1fr_0.5fr] items-center border-b px-4 py-3 text-sm last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <TaskStateToggle task={task} onToggle={handleToggleDone} onStatusChange={handleChangeStatus} />
                <span className="size-3 rounded-full" style={{ backgroundColor: task.color || "#6b7280" }} />
                <span className={done ? "truncate text-neutral-400 line-through" : "truncate font-medium"}>{task.title}</span>
              </div>
              <select
                value={task.status}
                onChange={(event) => void handleChangeStatus(task, event.target.value as TaskStatus)}
                className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
              >
                {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <span>{PRIORITY_TEXT[task.priority]}</span>
              <Link href={`/projects/${task.projectId}`} className="truncate hover:underline">{task.projectTitle}</Link>
              <span className="truncate text-neutral-500">{task.requirementTitle || "无需求"}</span>
              <span className="text-xs text-neutral-500">{task.dueAt || "-"}</span>
              <span className="text-xs text-neutral-500">{task.updatedAt?.slice(0, 10)}</span>
              <div className="flex justify-end">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" size="icon-sm" variant="outline" onClick={() => openEditTask(task)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </DialogTrigger>
                  <TaskEditDialog
                    form={taskForm}
                    onFormChange={setTaskForm}
                    onSave={handleSaveTask}
                  />
                </Dialog>
              </div>
            </article>
          )
        })}
      </section>

      {tasks.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          {(filters.statuses || []).includes("done") ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
          暂无任务。
        </div>
      ) : null}
    </main>
  )
}

function TaskEditDialog(props: {
  form: {
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    dueAt: string
  }
  onFormChange: (form: {
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    dueAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>编辑任务</DialogTitle>
        <DialogDescription>修改任务标题、描述、状态和优先级。</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="task-title">标题</Label>
          <Input
            id="task-title"
            value={props.form.title}
            onChange={(event) => props.onFormChange({ ...props.form, title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-description">描述</Label>
          <Textarea
            id="task-description"
            value={props.form.description}
            onChange={(event) => props.onFormChange({ ...props.form, description: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>状态</Label>
            <select
              value={props.form.status}
              onChange={(event) => props.onFormChange({ ...props.form, status: event.target.value as TaskStatus })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>优先级</Label>
            <select
              value={props.form.priority}
              onChange={(event) => props.onFormChange({ ...props.form, priority: event.target.value as Priority })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-due-at">截止时间</Label>
          <Input
            id="task-due-at"
            type="date"
            value={props.form.dueAt}
            onChange={(event) => props.onFormChange({ ...props.form, dueAt: event.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" onClick={() => void props.onSave()}>保存</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function TaskStateToggle(props: {
  task: TaskRecord
  onToggle: (task: TaskRecord, done: boolean) => Promise<void>
  onStatusChange: (task: TaskRecord, status: TaskStatus) => Promise<void>
}) {
  const done = props.task.isCompleted === 1 || props.task.status === "done"
  const cancelled = props.task.status === "cancelled"

  if (cancelled) {
    return (
      <button
        type="button"
        aria-label="恢复任务"
        onClick={() => void props.onStatusChange(props.task, "todo")}
        className="flex size-4 items-center justify-center rounded-[4px] border border-rose-300 bg-rose-50 text-rose-600"
      >
        <X className="size-3" />
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={done ? "取消完成" : "完成任务"}
      onClick={() => void props.onToggle(props.task, !done)}
      className={done
        ? "flex size-4 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground"
        : "size-4 rounded-[4px] border border-input bg-background"
      }
    >
      {done ? <Check className="size-3" /> : null}
    </button>
  )
}

function loadSavedTaskFilters(): TaskFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS
  const raw = window.localStorage.getItem(TASK_FILTER_STORAGE_KEY)
  if (!raw) return EMPTY_FILTERS

  try {
    return normalizeTaskFilters({ ...EMPTY_FILTERS, ...JSON.parse(raw) })
  } catch {
    return EMPTY_FILTERS
  }
}

function normalizeTaskFilters(filters: TaskFilters): TaskFilters {
  return {
    projectId: filters.projectId,
    requirementId: filters.requirementId,
    statuses: filters.statuses?.filter(Boolean),
    priority: filters.priority,
  }
}

function formatStatusFilter(statuses: TaskStatus[] | undefined) {
  if (!statuses || statuses.length === 0) return "全部状态"
  return statuses.map((status) => TASK_STATUS_TEXT[status]).join("、")
}

function sortTasksForDisplay(rows: TaskRecord[]) {
  return [...rows].sort((a, b) => {
    const aDone = a.isCompleted === 1 || a.status === "done"
    const bDone = b.isCompleted === 1 || b.status === "done"
    if (aDone !== bDone) return aDone ? 1 : -1
    if (aDone && bDone) {
      return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt))
    }
    return a.sortOrder - b.sortOrder
  })
}
