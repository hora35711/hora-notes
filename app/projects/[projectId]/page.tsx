"use client"

// Project 详情页：项目容器下分开展示需求层与真正的执行任务层。

import { useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject, ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Check, FileDown, GripVertical, Info, Link as LinkIcon, Pencil, Plus, Trash2, Wand2, X } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  createNoteNode,
  createRequirement,
  createTask,
  deleteRequirement,
  deleteTask,
  getProject,
  linkNoteToProject,
  listNoteNodes,
  listNotesByProject,
  listRequirementsByProject,
  listTasksByProject,
  reorderRequirements,
  reorderTasks,
  saveNoteContent,
  updateProject,
  updateRequirement,
  updateTask,
  updateTaskStatus,
  type LinkedNoteRecord,
  type NoteNodeRow,
  type Priority,
  type ProjectRecord,
  type RequirementRecord,
  type RequirementStatus,
  type TaskRecord,
  type TaskStatus,
  unlinkNoteFromProject,
} from "@/lib/hora-db"

const PRIORITY_TEXT: Record<Priority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
}

const REQUIREMENT_STATUS_TEXT: Record<RequirementStatus, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "完成",
  archived: "归档",
}

const TASK_STATUS_TEXT: Record<TaskStatus, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "完成",
  cancelled: "取消",
}

const COLOR_OPTIONS = ["#6b7280", "#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#9333ea"]
const LAST_PROJECT_STORAGE_KEY = "hora_last_project_id"

type ConnectionLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

// 目录树节点只用于关联笔记弹窗，不影响 note_nodes 表结构和扫描逻辑。
type NoteTreeNode = NoteNodeRow & {
  children: NoteTreeNode[]
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId

  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [requirements, setRequirements] = useState<RequirementRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [linkedNotes, setLinkedNotes] = useState<LinkedNoteRecord[]>([])
  const [noteNodes, setNoteNodes] = useState<NoteNodeRow[]>([])
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [batchText, setBatchText] = useState("")
  const [viewMode, setViewMode] = useState<"task" | "requirement">("task")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | RequirementStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all")
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([])
  const [highlightedLineIds, setHighlightedLineIds] = useState<string[]>([])
  const [draggedRequirementId, setDraggedRequirementId] = useState<string | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportNoticeState, setExportNoticeState] = useState<"hidden" | "visible" | "hiding">("hidden")
  const requirementPanelRef = useRef<HTMLDivElement | null>(null)
  const taskPanelRef = useRef<HTMLDivElement | null>(null)
  const lineHostRef = useRef<HTMLDivElement | null>(null)
  const requirementNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const taskNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const syncingScrollRef = useRef(false)
  const [requirementForm, setRequirementForm] = useState({
    id: "",
    title: "",
    description: "",
    status: "todo" as RequirementStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
  })
  const [taskForm, setTaskForm] = useState({
    id: "",
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
    requirementId: "",
    dueAt: "",
  })

  const refreshAll = async () => {
    if (!projectId) return
    const [projectRow, requirementRows, taskRows, noteRows, noteNodeRows] = await Promise.all([
      getProject(projectId),
      listRequirementsByProject(projectId),
      listTasksByProject(projectId),
      listNotesByProject(projectId),
      listNoteNodes(),
    ])
    setProject(projectRow)
    setRequirements(requirementRows)
    setTasks(taskRows)
    setLinkedNotes(noteRows)
    // 保留 folder + file，关联弹窗才能展示目录结构；真正写关联时仍只勾选文件。
    setNoteNodes(noteNodeRows)
  }

  useEffect(() => {
    if (projectId) {
      window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId)
    }

    const run = async () => {
      try {
        setError(null)
        await refreshAll()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目详情失败")
      }
    }

    void run()
  }, [projectId])

  const progress = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((task) => task.isCompleted === 1 || task.status === "done").length
    return { total, completed, value: total === 0 ? 0 : Math.round((completed / total) * 100) }
  }, [tasks])

  useEffect(() => {
    if (!project) return

    // 任务全部完成后同步项目状态；如果完成后又新增/取消任务，则从 done 回到 active。
    const nextStatus = progress.total > 0 && progress.value === 100
      ? "done"
      : project.status === "done" ? "active" : project.status
    if (nextStatus === project.status) return

    const run = async () => {
      try {
        setError(null)
        setProject((current) => current ? { ...current, status: nextStatus } : current)
        await updateProject({ id: project.id, status: nextStatus })
      } catch (err) {
        setError(err instanceof Error ? err.message : "同步项目状态失败")
      }
    }

    void run()
  }, [progress.total, progress.value, project])

  const requirementDoneMap = useMemo(() => {
    const nextMap = new Map<string, boolean>()
    for (const requirement of requirements) {
      const requirementTasks = tasks.filter((task) => task.requirementId === requirement.id)
      nextMap.set(
        requirement.id,
        requirementTasks.length > 0 && requirementTasks.every((task) => task.isCompleted === 1 || task.status === "done"),
      )
    }
    return nextMap
  }, [requirements, tasks])

  const availableNoteTree = useMemo(() => {
    // 弹窗里需要目录层级，但关联只允许勾选 file 节点。
    const linkedIds = new Set(linkedNotes.map((note) => note.id))
    return buildNoteTree(noteNodes.filter((note) => note.nodeType === "folder" || !linkedIds.has(note.id)))
  }, [linkedNotes, noteNodes])

  const sortedRequirements = useMemo(() => {
    return sortRequirementsForDisplay(requirements, requirementDoneMap, tasks)
  }, [requirementDoneMap, requirements, tasks])

  const sortedTasks = useMemo(() => {
    return sortTasksForDisplay(tasks)
  }, [tasks])

  const filteredTasks = useMemo(() => {
    // 任务模式按任务字段过滤；需求模式则由命中的需求反查任务，保持两侧联动。
    if (viewMode === "task") {
      return sortedTasks.filter((task) => {
        const statusMatched = statusFilter === "all" || task.status === statusFilter
        const priorityMatched = priorityFilter === "all" || task.priority === priorityFilter
        return statusMatched && priorityMatched
      })
    }

    const visibleRequirementIds = new Set(
      sortedRequirements
        .filter((requirement) => {
          const statusMatched = statusFilter === "all" || requirement.status === statusFilter
          const priorityMatched = priorityFilter === "all" || requirement.priority === priorityFilter
          return statusMatched && priorityMatched
        })
        .map((requirement) => requirement.id),
    )
    if (statusFilter === "all" && priorityFilter === "all") return sortedTasks
    return sortedTasks.filter((task) => task.requirementId && visibleRequirementIds.has(task.requirementId))
  }, [priorityFilter, sortedRequirements, sortedTasks, statusFilter, viewMode])

  const filteredRequirements = useMemo(() => {
    // 需求模式按需求字段过滤；任务模式则展示命中任务关联到的需求。
    if (viewMode === "requirement") {
      return sortedRequirements.filter((requirement) => {
        const statusMatched = statusFilter === "all" || requirement.status === statusFilter
        const priorityMatched = priorityFilter === "all" || requirement.priority === priorityFilter
        return statusMatched && priorityMatched
      })
    }

    if (statusFilter !== "all" || priorityFilter !== "all") {
      const visibleRequirementIds = new Set(filteredTasks.map((task) => task.requirementId).filter(Boolean))
      return sortedRequirements.filter((requirement) => visibleRequirementIds.has(requirement.id))
    }

    return sortedRequirements
  }, [filteredTasks, priorityFilter, sortedRequirements, statusFilter, viewMode])

  const activeStatusText = viewMode === "task" ? TASK_STATUS_TEXT : REQUIREMENT_STATUS_TEXT

  const boardHeight = useMemo(() => {
    // 需求列决定画布高度，任务更多时右侧列表在同一高度内滚动。
    const rowHeight = 64
    const titleHeight = 92
    return Math.min(Math.max(filteredRequirements.length * rowHeight + titleHeight, 360), 760)
  }, [filteredRequirements.length])

  useEffect(() => {
    // 切换任务/需求模式时状态枚举不同，重置状态筛选避免旧值套到另一类数据上。
    setStatusFilter("all")
  }, [viewMode])

  useEffect(() => {
    if (exportNoticeState !== "visible") return

    // 导出成功提醒先停留，再淡出，完整生命周期约 2 秒。
    const fadeTimer = window.setTimeout(() => setExportNoticeState("hiding"), 1500)
    const removeTimer = window.setTimeout(() => setExportNoticeState("hidden"), 2000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(removeTimer)
    }
  }, [exportNoticeState])

  const updateConnectionLines = () => {
    const hostRect = lineHostRef.current?.getBoundingClientRect()
    if (!hostRect) return

    const nextLines: ConnectionLine[] = []
    const visibleRequirementIds = new Set(filteredRequirements.map((row) => row.id))
    for (const task of filteredTasks) {
      if (!task.requirementId) continue
      if (!visibleRequirementIds.has(task.requirementId)) continue
      const requirementEl = requirementNodeRefs.current[task.requirementId]
      const taskEl = taskNodeRefs.current[task.id]
      const requirement = filteredRequirements.find((row) => row.id === task.requirementId)
      if (!requirementEl || !taskEl || !requirement) continue

      const requirementRect = requirementEl.getBoundingClientRect()
      const taskRect = taskEl.getBoundingClientRect()
      nextLines.push({
        id: `${task.requirementId}:${task.id}`,
        x1: requirementRect.right - hostRect.left,
        y1: requirementRect.top - hostRect.top + requirementRect.height / 2,
        x2: taskRect.left - hostRect.left,
        y2: taskRect.top - hostRect.top + taskRect.height / 2,
        color: requirement.color || "#6b7280",
      })
    }
    setConnectionLines(nextLines)
  }

  useEffect(() => {
    updateConnectionLines()
    window.addEventListener("resize", updateConnectionLines)
    return () => window.removeEventListener("resize", updateConnectionLines)
  }, [filteredRequirements, filteredTasks])

  const openCreateRequirement = () => {
    setRequirementForm({ id: "", title: "", description: "", status: "todo", priority: "normal", color: COLOR_OPTIONS[0] })
  }

  const openEditRequirement = (requirement: RequirementRecord) => {
    setRequirementForm({
      id: requirement.id,
      title: requirement.title,
      description: requirement.description || "",
      status: requirement.status,
      priority: requirement.priority,
      color: requirement.color || COLOR_OPTIONS[0],
    })
  }

  const openCreateTask = () => {
    setTaskForm({ id: "", title: "", description: "", status: "todo", priority: "normal", color: COLOR_OPTIONS[0], requirementId: "", dueAt: "" })
  }

  const openEditTask = (task: TaskRecord) => {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      color: task.color || COLOR_OPTIONS[0],
      requirementId: task.requirementId || "",
      dueAt: task.dueAt || "",
    })
  }

  const handleUpdateProjectField = async (field: "description" | "status" | "priority", value: string) => {
    if (!project) return
    try {
      setError(null)
      await updateProject({ id: project.id, [field]: value })
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新项目失败")
    }
  }

  const handleSaveRequirement = async () => {
    const title = requirementForm.title.trim()
    if (!title || !projectId) return
    try {
      setError(null)
      if (requirementForm.id) {
        await updateRequirement({ ...requirementForm, id: requirementForm.id, description: requirementForm.description || null })
      } else {
        await createRequirement({ projectId, ...requirementForm, description: requirementForm.description || undefined })
      }
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存需求失败")
    }
  }

  const handleSaveTask = async () => {
    const title = taskForm.title.trim()
    if (!title || !projectId) return
    try {
      setError(null)
      const payload = {
        title,
        description: taskForm.description || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        color: taskForm.color,
        requirementId: taskForm.requirementId || null,
        dueAt: taskForm.dueAt || null,
      }
      if (taskForm.id) {
        await updateTask({ id: taskForm.id, ...payload })
      } else {
        await createTask({ projectId, ...payload })
      }
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败")
    }
  }

  const handleSaveBatch = async () => {
    if (!projectId) return
    const rows = parseBatchText(batchText)
    if (rows.length === 0) return

    try {
      setError(null)
      for (const [index, row] of rows.entries()) {
        const requirement = await createRequirement({
          projectId,
          title: row.title,
          description: row.description,
          status: "todo",
          priority: "normal",
          color: COLOR_OPTIONS[index % COLOR_OPTIONS.length],
        })
        if (!requirement?.id) continue
        for (const taskTitle of row.tasks) {
          await createTask({
            projectId,
            requirementId: requirement.id,
            title: taskTitle,
            priority: "normal",
            color: requirement.color || COLOR_OPTIONS[index % COLOR_OPTIONS.length],
          })
        }
      }
      setBatchText("")
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量创建失败")
    }
  }

  const handleLinkSelectedNotes = async () => {
    if (selectedNoteIds.length === 0 || !projectId) return
    try {
      setError(null)
      for (const noteId of selectedNoteIds) {
        await linkNoteToProject(noteId, projectId)
      }
      setSelectedNoteIds([])
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "关联笔记失败")
    }
  }

  const toggleSelectedNote = (noteId: string) => {
    // 多选状态仅在弹窗内使用，确认后才真正写入关联表。
    setSelectedNoteIds((prev) => (
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId]
    ))
  }

  const openLinkedNote = (noteId: string) => {
    // 加 open 时间戳强制 Notes 页识别为一次新的打开动作，避免复用空白状态。
    router.push(`/notes/${noteId}?open=${Date.now()}`)
  }

  const handleUnlinkNote = async (noteId: string) => {
    if (!projectId) return
    try {
      setError(null)
      await unlinkNoteFromProject(noteId, projectId)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消关联失败")
    }
  }

  const flashLines = (lineIds: string[]) => {
    setHighlightedLineIds(lineIds)
    window.setTimeout(() => setHighlightedLineIds([]), 900)
  }

  const handleFlashRequirement = (requirementId: string) => {
    flashLines(connectionLines.filter((line) => line.id.startsWith(`${requirementId}:`)).map((line) => line.id))
  }

  const handleFlashTask = (task: TaskRecord) => {
    if (!task.requirementId) return
    flashLines([`${task.requirementId}:${task.id}`])
  }

  const handleExportProjectToNote = async () => {
    if (!project) return

    const markdown = buildProjectMarkdown(project, requirements, tasks)
    try {
      setError(null)
      const note = await createNoteNode({
        parentId: null,
        nodeType: "file",
        fileKind: "markdown",
        title: project.title,
      })
      if (!note?.id) throw new Error("导出文件创建失败")

      await saveNoteContent({ noteId: note.id, content: markdown })
      await linkNoteToProject(note.id, project.id)
      setExportNoticeState("visible")
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出文件失败")
    }
  }

  const handleRequirementDrop = async (targetId: string) => {
    if (!draggedRequirementId || draggedRequirementId === targetId || !projectId) return
    const nextRows = moveRowToTarget(sortedRequirements, draggedRequirementId, targetId)
    setDraggedRequirementId(null)
    if (!nextRows) return
    setRequirements(nextRows.map((row, sortOrder) => ({ ...row, sortOrder })))
    await reorderRequirements({ projectId, items: nextRows.map((row, sortOrder) => ({ id: row.id, sortOrder })) })
    await refreshAll()
  }

  const handleTaskDrop = async (targetId: string) => {
    if (!draggedTaskId || draggedTaskId === targetId || !projectId) return
    const nextRows = moveRowToTarget(sortedTasks, draggedTaskId, targetId)
    setDraggedTaskId(null)
    if (!nextRows) return
    setTasks(nextRows.map((row, sortOrder) => ({ ...row, sortOrder })))
    await reorderTasks({ projectId, items: nextRows.map((row, sortOrder) => ({ id: row.id, sortOrder })) })
    await refreshAll()
  }

  const syncPanelScroll = (source: "requirements" | "tasks") => {
    const sourceEl = source === "requirements" ? requirementPanelRef.current : taskPanelRef.current
    const targetEl = source === "requirements" ? taskPanelRef.current : requirementPanelRef.current
    if (!sourceEl || !targetEl || syncingScrollRef.current) return

    const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight
    const targetMax = targetEl.scrollHeight - targetEl.clientHeight
    const ratio = sourceMax <= 0 ? 0 : sourceEl.scrollTop / sourceMax
    syncingScrollRef.current = true
    targetEl.scrollTop = targetMax * ratio
    requestAnimationFrame(() => {
      syncingScrollRef.current = false
      updateConnectionLines()
    })
  }

  if (!project) {
    return <main className="w-full p-6 text-sm text-neutral-500 md:p-8">正在加载项目...</main>
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] w-full flex-col gap-3 overflow-hidden pt-1">
      <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/projects?list=1" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="size-4" />
            返回上一级
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <Input
            className="mt-3 max-w-xl"
            value={project.description || ""}
            onChange={(event) => setProject({ ...project, description: event.target.value })}
            onBlur={(event) => void handleUpdateProjectField("description", event.target.value)}
            placeholder="项目描述"
          />
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <Wand2 className="size-4" />
                快速编辑
              </Button>
            </DialogTrigger>
            <BatchDialog
              value={batchText}
              onValueChange={setBatchText}
              onSave={handleSaveBatch}
            />
          </Dialog>
          <Button type="button" variant="outline" onClick={() => void handleExportProjectToNote()}>
            <FileDown className="size-4" />
            导出文件
          </Button>
          <div className="flex h-9 rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("requirement")}
              className={viewMode === "requirement" ? "rounded bg-white px-3 font-medium shadow-sm" : "px-3 text-neutral-500"}
            >
              需求
            </button>
            <button
              type="button"
              onClick={() => setViewMode("task")}
              className={viewMode === "task" ? "rounded bg-white px-3 font-medium shadow-sm" : "px-3 text-neutral-500"}
            >
              任务
            </button>
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TaskStatus | RequirementStatus | "all")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">全部{viewMode === "task" ? "任务" : "需求"}状态</option>
            {Object.entries(activeStatusText).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">全部紧急程度</option>
            {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {exportNoticeState !== "hidden" ? (
        <Alert className={exportNoticeState === "hiding"
          ? "fixed right-6 top-20 z-50 w-[320px] opacity-0 shadow-lg transition-opacity duration-500"
          : "fixed right-6 top-20 z-50 w-[320px] opacity-100 shadow-lg transition-opacity duration-500"
        }>
          <Info className="size-4" />
          <AlertTitle>导出成功</AlertTitle>
          <AlertDescription>项目内容已导出到 Notes，并自动关联到当前项目。</AlertDescription>
        </Alert>
      ) : null}

      <section className="shrink-0 rounded-lg border border-neutral-200 bg-white p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">整体进度</span>
          <span className="text-neutral-500">{progress.completed}/{progress.total} · {progress.value}%</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-3 rounded-full bg-[linear-gradient(90deg,#ef4444_0%,#f59e0b_30%,#38bdf8_60%,#22c55e_100%)] transition-all duration-500"
            style={{ width: `${progress.value}%` }}
          />
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <section
          ref={lineHostRef}
          className="relative grid gap-6 xl:grid-cols-[minmax(260px,0.9fr)_minmax(60px,80px)_minmax(360px,1.4fr)]"
          style={{ height: `${boardHeight}px` }}
        >
          <svg className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full xl:block">
            {connectionLines.map((line) => (
              <path
                key={line.id}
                d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`}
                fill="none"
                stroke={line.color}
                strokeOpacity={highlightedLineIds.includes(line.id) ? "0.95" : "0.45"}
                strokeWidth={highlightedLineIds.includes(line.id) ? "4" : "2"}
                className={highlightedLineIds.includes(line.id) ? "animate-pulse" : ""}
              />
            ))}
          </svg>
          <div className="flex min-h-0 flex-col rounded-lg border border-neutral-200 bg-white p-4">
            <PanelTitle title="需求" buttonText="新建需求" onCreate={openCreateRequirement}>
              <RequirementDialog form={requirementForm} onFormChange={setRequirementForm} onSave={handleSaveRequirement} />
            </PanelTitle>
            <div
              ref={requirementPanelRef}
              onScroll={() => syncPanelScroll("requirements")}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <RequirementList
                rows={filteredRequirements}
                doneMap={requirementDoneMap}
                nodeRefs={requirementNodeRefs}
                draggedId={draggedRequirementId}
                onDragStart={setDraggedRequirementId}
                onDrop={handleRequirementDrop}
                onFlash={handleFlashRequirement}
                onEdit={openEditRequirement}
                onDelete={async (id) => {
                  await deleteRequirement(id)
                  await refreshAll()
                }}
                dialogForm={requirementForm}
                onFormChange={setRequirementForm}
                onSave={handleSaveRequirement}
              />
            </div>
          </div>

          <div className="hidden xl:block" />

          <div className="flex min-h-0 flex-col rounded-lg border border-neutral-200 bg-white p-4">
            <PanelTitle title="任务" buttonText="新建任务" onCreate={openCreateTask}>
              <TaskDialog
                form={taskForm}
                requirements={requirements}
                onFormChange={setTaskForm}
                onSave={handleSaveTask}
              />
            </PanelTitle>
            <div
              ref={taskPanelRef}
              onScroll={() => syncPanelScroll("tasks")}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <TaskList
                rows={filteredTasks}
                requirements={requirements}
                nodeRefs={taskNodeRefs}
                draggedId={draggedTaskId}
                onDragStart={setDraggedTaskId}
                onDrop={handleTaskDrop}
                onFlash={handleFlashTask}
                onEdit={openEditTask}
                onToggle={async (task, done) => {
                  await updateTaskStatus({ id: task.id, done })
                  await refreshAll()
                }}
                onDelete={async (id) => {
                  await deleteTask(id)
                  await refreshAll()
                }}
                dialogForm={taskForm}
                onFormChange={setTaskForm}
                onSave={handleSaveTask}
              />
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LinkIcon className="size-4" />
              关联笔记
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  选择笔记
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>选择关联笔记</DialogTitle>
                  <DialogDescription>按目录结构勾选一个或多个文件，确认后再写入项目关联。</DialogDescription>
                </DialogHeader>
                <div className="max-h-[360px] overflow-y-auto rounded-md border border-neutral-200 p-2">
                  <NotePickerTree
                    rows={availableNoteTree}
                    selectedIds={selectedNoteIds}
                    onToggle={toggleSelectedNote}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => setSelectedNoteIds([])}>
                      取消
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button type="button" onClick={() => void handleLinkSelectedNotes()} disabled={selectedNoteIds.length === 0}>
                      确认关联 {selectedNoteIds.length > 0 ? `(${selectedNoteIds.length})` : ""}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {linkedNotes.length === 0 ? (
            <p className="text-sm text-neutral-500">暂无关联笔记。</p>
          ) : (
            <div className="space-y-2">
              {linkedNotes.map((note) => (
                <div key={note.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openLinkedNote(note.id)}
                      className="block max-w-full truncate text-left font-medium hover:underline"
                    >
                      {note.title}
                    </button>
                    <span className="block truncate text-xs text-neutral-500">{note.filePath}</span>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleUnlinkNote(note.id)}>
                    取消关联
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function moveRowToTarget<T extends { id: string }>(rows: T[], sourceId: string, targetId: string) {
  const sourceIndex = rows.findIndex((row) => row.id === sourceId)
  const targetIndex = rows.findIndex((row) => row.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return null
  const nextRows = [...rows]
  const [row] = nextRows.splice(sourceIndex, 1)
  nextRows.splice(targetIndex, 0, row)
  return nextRows
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

function sortRequirementsForDisplay(
  rows: RequirementRecord[],
  doneMap: Map<string, boolean>,
  tasks: TaskRecord[],
) {
  return [...rows].sort((a, b) => {
    const aDone = doneMap.get(a.id) === true
    const bDone = doneMap.get(b.id) === true
    if (aDone !== bDone) return aDone ? 1 : -1
    if (aDone && bDone) {
      return getLatestRequirementDoneAt(b.id, tasks).localeCompare(getLatestRequirementDoneAt(a.id, tasks))
    }
    return a.sortOrder - b.sortOrder
  })
}

function getLatestRequirementDoneAt(requirementId: string, tasks: TaskRecord[]) {
  return tasks
    .filter((task) => task.requirementId === requirementId && (task.isCompleted === 1 || task.status === "done"))
    .map((task) => task.completedAt || task.updatedAt || "")
    .sort()
    .at(-1) || ""
}

function getTaskRowClassName(task: TaskRecord) {
  if (task.status === "cancelled") return "bg-rose-50/80"
  if (task.status === "doing") return "bg-emerald-50/80"
  if (task.status === "done" || task.isCompleted === 1) return "bg-sky-50/80"
  return ""
}

function TaskStateToggle(props: {
  task: TaskRecord
  onToggle: (row: TaskRecord, done: boolean) => Promise<void>
}) {
  const done = props.task.isCompleted === 1 || props.task.status === "done"
  const cancelled = props.task.status === "cancelled"

  if (cancelled) {
    return (
      <button
        type="button"
        aria-label="取消状态"
        className="flex size-4 items-center justify-center rounded-[4px] border border-rose-300 bg-rose-50 text-rose-600"
        onClick={() => void props.onToggle(props.task, false)}
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
        ? "flex size-4 items-center justify-center rounded-[4px] border border-sky-400 bg-sky-500 text-white"
        : "size-4 rounded-[4px] border border-input bg-background"
      }
    >
      {done ? <Check className="size-3" /> : null}
    </button>
  )
}

function parseBatchText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawTitle, ...taskParts] = line.split(/\s*[:：|]\s*/)
      const tasks = taskParts
        .join(",")
        .split(/[,，、]/)
        .map((task) => task.trim())
        .filter(Boolean)
      return { title: rawTitle.trim(), description: "", tasks }
    })
    .filter((row) => row.title)
}

function buildProjectMarkdown(project: ProjectRecord, requirements: RequirementRecord[], tasks: TaskRecord[]) {
  const lines = [`# ${project.title}`, ""]

  for (const requirement of requirements) {
    const requirementTasks = tasks.filter((task) => task.requirementId === requirement.id)
    lines.push(`## ${requirement.title}`, "")
    lines.push(requirement.description || "描述")
    lines.push("")

    for (const task of requirementTasks) {
      lines.push(task.title)
      if (task.description) {
        lines.push(task.description)
      }
      lines.push("")
    }
  }

  const directTasks = tasks.filter((task) => !task.requirementId)
  if (directTasks.length > 0) {
    lines.push("## 未归属需求", "")
    lines.push("描述")
    lines.push("")
    for (const task of directTasks) {
      lines.push(task.title)
      if (task.description) {
        lines.push(task.description)
      }
      lines.push("")
    }
  }

  return lines.join("\n").trimEnd() + "\n"
}

function buildNoteTree(rows: NoteNodeRow[]) {
  // 只在前端组装父子关系，避免对 note_nodes 做任何结构迁移。
  const nodeMap = new Map<string, NoteTreeNode>()
  for (const row of rows) {
    nodeMap.set(row.id, { ...row, children: [] })
  }

  const roots: NoteTreeNode[] = []
  for (const node of nodeMap.values()) {
    const parent = node.parentId ? nodeMap.get(node.parentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortTree = (nodes: NoteTreeNode[]) => {
    // 文件夹排在文件前面，并保持同层级标题稳定排序。
    nodes.sort((a, b) => {
      if (a.nodeType !== b.nodeType) return a.nodeType === "folder" ? -1 : 1
      return a.title.localeCompare(b.title)
    })
    nodes.forEach((node) => sortTree(node.children))
  }

  sortTree(roots)
  return roots
}

function NotePickerTree(props: {
  rows: NoteTreeNode[]
  selectedIds: string[]
  onToggle: (id: string) => void
  depth?: number
}) {
  const depth = props.depth ?? 0

  if (props.rows.length === 0 && depth === 0) {
    return <p className="px-2 py-3 text-sm text-neutral-500">暂无可关联的笔记文件。</p>
  }

  return (
    <div className={depth === 0 ? "space-y-1" : "space-y-1"}>
      {props.rows.map((row) => {
        const isFile = row.nodeType === "file"
        return (
          <div key={row.id}>
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50"
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              {isFile ? (
                <Checkbox
                  checked={props.selectedIds.includes(row.id)}
                  onCheckedChange={() => props.onToggle(row.id)}
                  aria-label={`选择笔记 ${row.title}`}
                />
              ) : (
                <span className="size-4 rounded border border-transparent" />
              )}
              <span title={row.title} className={isFile ? "truncate" : "truncate font-medium text-neutral-700"}>
                {isFile ? "[文件]" : "[目录]"} {row.title}
              </span>
            </div>
            {row.children.length > 0 ? (
              <NotePickerTree
                rows={row.children}
                selectedIds={props.selectedIds}
                onToggle={props.onToggle}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function PanelTitle(props: { title: string; buttonText: string; onCreate: () => void; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="sm" onClick={props.onCreate}>
            <Plus className="size-4" />
            {props.buttonText}
          </Button>
        </DialogTrigger>
        {props.children}
      </Dialog>
    </div>
  )
}

// 删除按钮统一走确认弹窗，避免误删项目层级数据。
function ConfirmDeleteButton(props: {
  title: string
  description: string
  onConfirm: () => Promise<void>
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="outline">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void props.onConfirm()}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RequirementList(props: {
  rows: RequirementRecord[]
  doneMap: Map<string, boolean>
  nodeRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  draggedId: string | null
  onDragStart: (id: string | null) => void
  onDrop: (id: string) => Promise<void>
  onFlash: (id: string) => void
  onEdit: (row: RequirementRecord) => void
  onDelete: (id: string) => Promise<void>
  dialogForm: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <div>
      {props.rows.map((row) => {
        const done = props.doneMap.get(row.id) === true
        return (
        <div
          key={row.id}
          ref={(node) => {
            props.nodeRefs.current[row.id] = node
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => void props.onDrop(row.id)}
          className={done
            ? "flex items-center gap-3 border-t bg-sky-50/80 px-2 py-3 text-sm first:border-t-0"
            : "flex items-center gap-3 border-t px-2 py-3 text-sm first:border-t-0"
          }
        >
          <button
            type="button"
            aria-label={`高亮需求 ${row.title} 的连线`}
            onClick={() => props.onFlash(row.id)}
            className="size-3 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-neutral-300"
            style={{ backgroundColor: done ? "#38bdf8" : row.color || "#6b7280" }}
          />
          <div className="min-w-0 flex-1">
            <p title={row.title} className={done ? "truncate font-medium text-sky-700" : "truncate font-medium"}>{row.title}</p>
            <p className="text-xs text-neutral-500">{done ? "任务已完成" : REQUIREMENT_STATUS_TEXT[row.status]} · {PRIORITY_TEXT[row.priority]}</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="icon-sm" variant="outline" onClick={() => props.onEdit(row)}>
                <Pencil className="size-3.5" />
              </Button>
            </DialogTrigger>
            <RequirementDialog form={props.dialogForm} onFormChange={props.onFormChange} onSave={props.onSave} />
          </Dialog>
          <ConfirmDeleteButton
            title="确认删除需求？"
            description="删除需求会同时删除它下面的任务。该操作会软删除数据，不会影响 Notes 文件。"
            onConfirm={() => props.onDelete(row.id)}
          />
          <button
            type="button"
            draggable
            aria-label={`拖动需求 ${row.title}`}
            onDragStart={() => props.onDragStart(row.id)}
            onDragEnd={() => props.onDragStart(null)}
            className={props.draggedId === row.id
              ? "cursor-grabbing rounded-md border border-neutral-300 bg-neutral-100 p-1.5"
              : "cursor-grab rounded-md border border-neutral-200 p-1.5 hover:bg-neutral-50"
            }
          >
            <GripVertical className="size-4 text-neutral-500" />
          </button>
        </div>
        )
      })}
      {props.rows.length === 0 ? <p className="pt-4 text-sm text-neutral-500">暂无需求。</p> : null}
    </div>
  )
}

function TaskList(props: {
  rows: TaskRecord[]
  requirements: RequirementRecord[]
  nodeRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  draggedId: string | null
  onDragStart: (id: string | null) => void
  onDrop: (id: string) => Promise<void>
  onFlash: (row: TaskRecord) => void
  onEdit: (row: TaskRecord) => void
  onToggle: (row: TaskRecord, done: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  dialogForm: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    dueAt: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    dueAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <div>
      {props.rows.map((row) => {
        const done = row.isCompleted === 1 || row.status === "done"
        return (
          <div
            key={row.id}
            ref={(node) => {
              props.nodeRefs.current[row.id] = node
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void props.onDrop(row.id)}
            className={`flex items-center gap-3 border-t px-2 py-3 text-sm first:border-t-0 ${getTaskRowClassName(row)}`}
          >
            <TaskStateToggle task={row} onToggle={props.onToggle} />
            <button
              type="button"
              aria-label={`高亮任务 ${row.title} 的连线`}
              onClick={() => props.onFlash(row)}
              className="size-3 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-neutral-300"
              style={{ backgroundColor: row.color || "#6b7280" }}
            />
            <div className="min-w-0 flex-1">
              <p title={row.title} className={done ? "truncate font-medium text-neutral-400 line-through" : "truncate font-medium"}>
                {row.title}
              </p>
              <p className="text-xs text-neutral-500">
                {TASK_STATUS_TEXT[row.status]} · {PRIORITY_TEXT[row.priority]} · {row.requirementTitle || "无需求"}
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" size="icon-sm" variant="outline" onClick={() => props.onEdit(row)}>
                  <Pencil className="size-3.5" />
                </Button>
              </DialogTrigger>
              <TaskDialog form={props.dialogForm} requirements={props.requirements} onFormChange={props.onFormChange} onSave={props.onSave} />
            </Dialog>
            <ConfirmDeleteButton
              title="确认删除任务？"
              description="删除任务会将该任务从项目和全局 Tasks 视图中隐藏。该操作会软删除数据。"
              onConfirm={() => props.onDelete(row.id)}
            />
            <button
              type="button"
              draggable
              aria-label={`拖动任务 ${row.title}`}
              onDragStart={() => props.onDragStart(row.id)}
              onDragEnd={() => props.onDragStart(null)}
              className={props.draggedId === row.id
                ? "cursor-grabbing rounded-md border border-neutral-300 bg-neutral-100 p-1.5"
                : "cursor-grab rounded-md border border-neutral-200 p-1.5 hover:bg-neutral-50"
              }
            >
              <GripVertical className="size-4 text-neutral-500" />
            </button>
          </div>
        )
      })}
      {props.rows.length === 0 ? <p className="pt-4 text-sm text-neutral-500">暂无任务。</p> : null}
    </div>
  )
}

function BatchDialog(props: {
  value: string
  onValueChange: (value: string) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>快速编辑</DialogTitle>
        <DialogDescription>每行一个需求，冒号或竖线后填写该需求下的多个任务。</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="batch-requirements">批量内容</Label>
        <Textarea
          id="batch-requirements"
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          className="min-h-56 font-mono text-sm"
          placeholder={"登录模块: 登录表单, 忘记密码, 验证错误提示\n支付模块 | 创建订单, 支付回调, 退款入口"}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>批量创建</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function RequirementDialog(props: {
  form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.form.id ? "编辑需求" : "新建需求"}</DialogTitle>
        <DialogDescription>需求表示模块或要做什么，不是具体执行项。</DialogDescription>
      </DialogHeader>
      <EntityForm form={props.form} statusText={REQUIREMENT_STATUS_TEXT} onFormChange={props.onFormChange} />
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>保存</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function TaskDialog(props: {
  form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    dueAt: string
  }
  requirements: RequirementRecord[]
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    dueAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.form.id ? "编辑任务" : "新建任务"}</DialogTitle>
        <DialogDescription>任务是真正的执行项，可选择归属需求。</DialogDescription>
      </DialogHeader>
      <EntityForm form={props.form} statusText={TASK_STATUS_TEXT} onFormChange={props.onFormChange} />
      <div className="space-y-2">
        <Label>所属需求</Label>
        <select
          value={props.form.requirementId}
          onChange={(event) => props.onFormChange({ ...props.form, requirementId: event.target.value })}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">无需求</option>
          {props.requirements.map((requirement) => (
            <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-task-due-at">截止时间</Label>
        <Input
          id="project-task-due-at"
          type="date"
          value={props.form.dueAt}
          onChange={(event) => props.onFormChange({ ...props.form, dueAt: event.target.value })}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>保存</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

type EntityFormState<TStatus extends string> = {
  title: string
  description: string
  status: TStatus
  priority: Priority
  color: string
}

function EntityForm<TStatus extends string, TForm extends EntityFormState<TStatus>>(props: {
  form: TForm
  statusText: Record<TStatus, string>
  onFormChange: (form: TForm) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>标题</Label>
        <Input value={props.form.title} onChange={(event) => props.onFormChange({ ...props.form, title: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>描述</Label>
        <Input value={props.form.description} onChange={(event) => props.onFormChange({ ...props.form, description: event.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>状态</Label>
          <select
            value={props.form.status}
            onChange={(event) => props.onFormChange({ ...props.form, status: event.target.value as TStatus })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(props.statusText).map(([value, label]) => (
              <option key={value} value={value}>{label as string}</option>
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
        <Label>颜色</Label>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`选择颜色 ${color}`}
              onClick={() => props.onFormChange({ ...props.form, color })}
              className={props.form.color === color ? "size-7 rounded-full border-2 border-neutral-900" : "size-7 rounded-full border border-neutral-200"}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
