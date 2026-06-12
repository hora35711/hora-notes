"use client"

// Projects 列表页：管理项目容器，并展示状态、优先级、颜色和排序。

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"

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
import {
  createProject,
  deleteProject,
  listProjects,
  reorderProjects,
  updateProject,
  type Priority,
  type ProjectRecord,
  type ProjectStatus,
} from "@/lib/hora-db"

const STATUS_TEXT: Record<ProjectStatus, string> = {
  active: "进行中",
  paused: "暂停",
  done: "完成",
  archived: "归档",
}

const PRIORITY_TEXT: Record<Priority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
}

const COLOR_OPTIONS = ["#6b7280", "#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#9333ea"]
const LAST_PROJECT_STORAGE_KEY = "hora_last_project_id"

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null)
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "active" as ProjectStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
  })

  // 统一刷新项目列表，保证排序和更新时间来自数据库。
  const refreshProjects = async () => {
    const rows = await listProjects()
    setProjects(rows)
  }

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const shouldShowList = new URLSearchParams(window.location.search).get("list") === "1"
        const lastProjectId = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
        if (!shouldShowList && lastProjectId) {
          router.replace(`/projects/${lastProjectId}`)
          return
        }
        await refreshProjects()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目失败")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [router])

  // 排序后的列表：DB 已排序，这里保留 memo 方便后续扩展筛选。
  const sortedProjects = useMemo(() => projects, [projects])

  const openCreateDialog = () => {
    setEditingProject(null)
    setForm({ title: "", description: "", status: "active", priority: "normal", color: COLOR_OPTIONS[0] })
  }

  const openEditDialog = (project: ProjectRecord) => {
    setEditingProject(project)
    setForm({
      title: project.title,
      description: project.description || "",
      status: project.status,
      priority: project.priority,
      color: project.color || COLOR_OPTIONS[0],
    })
  }

  const handleSaveProject = async () => {
    const title = form.title.trim()
    if (!title) return

    try {
      setError(null)
      if (editingProject) {
        await updateProject({
          id: editingProject.id,
          title,
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          color: form.color,
        })
      } else {
        await createProject({
          title,
          description: form.description.trim() || undefined,
          status: form.status,
          priority: form.priority,
          color: form.color,
        })
      }
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存项目失败")
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    try {
      setError(null)
      await deleteProject(projectId)
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除项目失败")
    }
  }

  const handleMoveProject = async (projectId: string, direction: -1 | 1) => {
    const index = sortedProjects.findIndex((project) => project.id === projectId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= sortedProjects.length) return

    const nextProjects = [...sortedProjects]
    const [project] = nextProjects.splice(index, 1)
    nextProjects.splice(nextIndex, 0, project)

    try {
      setProjects(nextProjects.map((item, sortOrder) => ({ ...item, sortOrder })))
      await reorderProjects({ items: nextProjects.map((item, sortOrder) => ({ id: item.id, sortOrder })) })
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "调整排序失败")
    }
  }

  return (
    <main className="w-full p-6 md:p-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的项目</h1>
          <p className="mt-1 text-xs text-neutral-500">Project 是需求和任务的项目容器。</p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="size-4" />
              新建项目
            </Button>
          </DialogTrigger>
          <ProjectDialog
            form={form}
            editing={Boolean(editingProject)}
            onFormChange={setForm}
            onSave={handleSaveProject}
          />
        </Dialog>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr_0.5fr_1fr_0.9fr] border-b bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500">
          <span>项目名称</span>
          <span>状态</span>
          <span>优先级</span>
          <span>颜色</span>
          <span>排序</span>
          <span>更新时间</span>
          <span className="text-right">操作</span>
        </div>

        {sortedProjects.map((project, index) => (
          <article
            key={project.id}
            className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr_0.5fr_1fr_0.9fr] items-center border-b px-4 py-3 text-sm last:border-b-0"
          >
            <Link href={`/projects/${project.id}`} className="min-w-0 font-medium text-neutral-900 hover:underline">
              <span className="block truncate">{project.title}</span>
              {project.description ? (
                <span className="mt-0.5 block truncate text-xs font-normal text-neutral-500">{project.description}</span>
              ) : null}
            </Link>
            <span>{STATUS_TEXT[project.status]}</span>
            <span>{PRIORITY_TEXT[project.priority]}</span>
            <span>
              <span className="inline-flex size-4 rounded-full border" style={{ backgroundColor: project.color || "#6b7280" }} />
            </span>
            <span>{project.sortOrder}</span>
            <span className="text-xs text-neutral-500">{project.updatedAt?.slice(0, 10)}</span>
            <div className="flex justify-end gap-1">
              <Button type="button" size="icon-sm" variant="outline" disabled={index === 0} onClick={() => void handleMoveProject(project.id, -1)}>
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" size="icon-sm" variant="outline" disabled={index === sortedProjects.length - 1} onClick={() => void handleMoveProject(project.id, 1)}>
                <ArrowDown className="size-3.5" />
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline" onClick={() => openEditDialog(project)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </DialogTrigger>
                <ProjectDialog
                  form={form}
                  editing
                  onFormChange={setForm}
                  onSave={handleSaveProject}
                />
              </Dialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline">
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                    <AlertDialogDescription>
                      删除项目会同时删除它下面的需求和任务。该操作会软删除数据，不会影响 Notes 文件。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDeleteProject(project.id)}>确认删除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </article>
        ))}
      </section>

      {!loading && sortedProjects.length === 0 ? <p className="mt-6 text-sm text-neutral-500">暂无项目。</p> : null}
    </main>
  )
}

function ProjectDialog(props: {
  form: {
    title: string
    description: string
    status: ProjectStatus
    priority: Priority
    color: string
  }
  editing: boolean
  onFormChange: (form: {
    title: string
    description: string
    status: ProjectStatus
    priority: Priority
    color: string
  }) => void
  onSave: () => Promise<void>
}) {
  const { form, editing, onFormChange, onSave } = props

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{editing ? "编辑项目" : "新建项目"}</DialogTitle>
        <DialogDescription>维护项目的基础信息和列表展示字段。</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="project-title">项目名称</Label>
          <Input
            id="project-title"
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="请输入项目名称"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">描述</Label>
          <Input
            id="project-description"
            value={form.description}
            onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            placeholder="可选"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>状态</Label>
            <select
              value={form.status}
              onChange={(event) => onFormChange({ ...form, status: event.target.value as ProjectStatus })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(STATUS_TEXT).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>优先级</Label>
            <select
              value={form.priority}
              onChange={(event) => onFormChange({ ...form, priority: event.target.value as Priority })}
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
                onClick={() => onFormChange({ ...form, color })}
                className={form.color === color ? "size-7 rounded-full border-2 border-neutral-900" : "size-7 rounded-full border border-neutral-200"}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" onClick={() => void onSave()}>保存</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}
