"use client"

// Project 详情页：按项目维度展示需求任务，支持搜索、创建与完成状态切换。

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Flag, Search } from "lucide-react"

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createRequirement,
  getProject,
  listRequirementsByProject,
  updateRequirementStatus,
  type RequirementRecord,
} from "@/lib/hora-db"

// 状态文案映射：用于统一中文展示。
const STATUS_TEXT: Record<RequirementRecord["status"], string> = {
  todo: "未完成",
  done: "已完成",
}

// 紧急程度文案映射：用于统一中文展示。
const PRIORITY_TEXT: Record<RequirementRecord["priority"], string> = {
  normal: "普通",
  urgent: "紧急",
}

export default function ProjectDetailPage() {
  // 读取动态路由参数 projectId。
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId

  // 顶部项目信息。
  const [projectTitle, setProjectTitle] = useState("项目")
  // 搜索关键词。
  const [keyword, setKeyword] = useState("")
  // 创建任务弹窗字段：标题。
  const [newTaskTitle, setNewTaskTitle] = useState("")
  // 创建任务弹窗字段：优先级。
  const [newTaskPriority, setNewTaskPriority] = useState<"normal" | "urgent">("normal")
  // 错误信息。
  const [error, setError] = useState<string | null>(null)
  // 任务列表。
  const [tasks, setTasks] = useState<RequirementRecord[]>([])

  // 加载项目和任务数据。
  useEffect(() => {
    const run = async () => {
      if (!projectId) {
        return
      }

      try {
        setError(null)

        const project = await getProject(projectId)
        if (project?.title) {
          setProjectTitle(project.title)
        } else {
          setProjectTitle(`项目 ${projectId}`)
        }

        const rows = await listRequirementsByProject(projectId)
        setTasks(rows)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载任务失败")
      }
    }

    void run()
  }, [projectId])

  // 前端搜索过滤：按标题关键字过滤任务。
  const filteredTasks = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) {
      return tasks
    }

    return tasks.filter((task) => task.title.toLowerCase().includes(q))
  }, [keyword, tasks])

  // 创建任务：写库后刷新列表。
  const handleCreateTask = async () => {
    const title = newTaskTitle.trim()
    if (!title || !projectId) {
      return
    }

    try {
      await createRequirement({
        projectId,
        title,
        priority: newTaskPriority,
      })

      const rows = await listRequirementsByProject(projectId)
      setTasks(rows)
      setNewTaskTitle("")
      setNewTaskPriority("normal")
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败")
    }
  }

  // 勾选状态：切换完成/未完成并刷新列表。
  const handleToggleDone = async (id: string, done: boolean) => {
    if (!projectId) {
      return
    }

    try {
      await updateRequirementStatus({ id, done })
      const rows = await listRequirementsByProject(projectId)
      setTasks(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新任务状态失败")
    }
  }

  return (
    <main className="w-full p-6 md:p-8">
      {/* 顶部区：左侧项目名，右侧搜索与创建任务按钮。 */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{projectTitle}</h1>

        <div className="flex items-center gap-3">
          <InputGroup className="h-10 w-64">
            <InputGroupInput
              placeholder="搜索任务..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <Search className="size-4" />
            </InputGroupAddon>
          </InputGroup>

          <Dialog>
            <DialogTrigger asChild>
              <Button type="button">创建任务</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>创建任务</DialogTitle>
                <DialogDescription>填写任务标题并选择优先级。</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="task-name">任务标题</Label>
                  <Input
                    id="task-name"
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    placeholder="请输入任务标题"
                  />
                </div>

                <div className="space-y-2">
                  <Label>优先级</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={newTaskPriority === "normal" ? "default" : "outline"}
                      onClick={() => setNewTaskPriority("normal")}
                    >
                      普通
                    </Button>
                    <Button
                      type="button"
                      variant={newTaskPriority === "urgent" ? "default" : "outline"}
                      onClick={() => setNewTaskPriority("urgent")}
                    >
                      紧急
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button type="button" onClick={() => void handleCreateTask()}>
                    保存
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* 错误提示。 */}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      {/* 任务卡片网格：展示任务信息。 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredTasks.map((task) => {
          // 状态颜色：已完成使用绿色，未完成使用中性色。
          const statusClassName =
            task.status === "done" ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-600"

          // 优先级颜色：紧急使用红色，普通使用蓝灰色。
          const priorityClassName = task.priority === "urgent" ? "text-rose-600" : "text-slate-600"

          return (
            <article key={task.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              {/* 标题行：左侧勾选按钮，右侧为可换行标题。 */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id={task.id}
                  checked={task.status === "done"}
                  onCheckedChange={(checked) => void handleToggleDone(task.id, checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={task.id} className="cursor-pointer text-sm leading-6 font-medium text-neutral-900">
                  {task.title}
                </Label>
              </div>

              {/* 元信息：状态和紧急程度。 */}
              <div className="mt-4 flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClassName}`}>
                  {STATUS_TEXT[task.status]}
                </span>
              </div>

              <div className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${priorityClassName}`}>
                <Flag className="size-3.5" />
                <span>{PRIORITY_TEXT[task.priority]}</span>
              </div>
            </article>
          )
        })}
      </section>

      {filteredTasks.length === 0 ? <p className="mt-6 text-sm text-neutral-500">暂无任务。</p> : null}
    </main>
  )
}
