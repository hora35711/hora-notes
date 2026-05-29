"use client"

// Projects 列表页：展示项目网格、创建弹窗，并对接本地数据库读写。

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"

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
import { createProject, listProjects, type ProjectRecord } from "@/lib/hora-db"

export default function ProjectsPage() {
  // 表单状态：项目名输入。
  const [projectName, setProjectName] = useState("")
  // 表单状态：负责人输入，当前先用于展示，后续可映射真实用户。
  const [ownerName, setOwnerName] = useState("fg_mac")
  // 加载状态：控制首次加载体验。
  const [loading, setLoading] = useState(true)
  // 错误信息：用于展示本地 DB 调用失败原因。
  const [error, setError] = useState<string | null>(null)
  // 项目列表：来自 SQLite。
  const [projects, setProjects] = useState<ProjectRecord[]>([])

  // 加载项目：页面进入时读取本地数据库。
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await listProjects()
        setProjects(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目失败")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  // 展示列表：保留 20 格布局（首位创建卡 + 最多 19 个项目卡）。
  const displayCards = useMemo(() => {
    return projects.slice(0, 19)
  }, [projects])

  // 创建项目：保存后刷新列表并重置输入框。
  const handleCreateProject = async () => {
    const title = projectName.trim()
    if (!title) {
      return
    }

    try {
      await createProject({ title })
      const data = await listProjects()
      setProjects(data)
      setProjectName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败")
    }
  }

  return (
    <main className="w-full p-6 md:p-8">
      {/* 页面标题：固定在内容区左上角。 */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">我的项目</h1>
        <p className="mt-1 text-xs text-neutral-500">当前负责人：{ownerName}</p>
      </header>

      {/* 错误提示：当 DB 桥接不可用时给出明确反馈。 */}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      {/* 卡片网格：5 列 x 4 行，共 20 个位置。 */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* 第一张固定为“创建项目”入口。 */}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-left transition hover:border-neutral-500 hover:bg-neutral-50"
            >
              <Plus className="mb-2 h-6 w-6 text-neutral-600" />
              <span className="text-sm font-medium text-neutral-800">创建项目</span>
            </button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>填写项目信息后，点击保存即可创建。</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">项目名字</Label>
                <Input
                  id="project-name"
                  name="projectName"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="请输入项目名字"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-name">负责人</Label>
                <Input
                  id="owner-name"
                  name="ownerName"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button type="button" onClick={() => void handleCreateProject()}>
                  保存
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 现有项目卡片：点击后进入项目详情页。 */}
        {displayCards.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="flex min-h-32 flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <h2 className="line-clamp-2 text-sm font-semibold text-neutral-900">{project.title}</h2>
            <p className="mt-3 text-xs text-neutral-500">状态：{project.status === "active" ? "进行中" : "已归档"}</p>
          </Link>
        ))}
      </section>

      {/* 空态提示：方便你确认 DB 初始化是否成功。 */}
      {!loading && projects.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">暂无项目，点击“创建项目”开始。</p>
      ) : null}
    </main>
  )
}
