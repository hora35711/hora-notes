"use client"

// 应用主壳：负责 Sidebar 布局、可拖拽宽度和宽度持久化。

import * as React from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/app/AppSidebar/app-sidebar"

const SIDEBAR_WIDTH_STORAGE_KEY = "hora_sidebar_width"
const SIDEBAR_WIDTH_DEFAULT = 336
const SIDEBAR_WIDTH_MIN = 220
const SIDEBAR_WIDTH_MAX = 520

// 主壳组件：左侧可拖拽、右侧自适应。
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // 当前 sidebar 宽度（px）。
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(SIDEBAR_WIDTH_DEFAULT)

  // 首次加载时恢复上次宽度。
  React.useEffect(() => {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!raw) return

    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return

    const clamped = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, parsed))
    setSidebarWidth(clamped)
  }, [])

  // 持久化宽度：下次打开继续使用。
  React.useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  // 开始拖拽：按鼠标 X 计算新宽度。
  const handleResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()

    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, moveEvent.clientX))
      setSidebarWidth(next)
    }

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }, [])

  // 在 notes 页面里，SidebarTrigger 放到标签行中展示，这里不重复显示。
  const hideGlobalTrigger = pathname.startsWith("/notes/")

  return (
    <SidebarProvider
      // 通过 CSS 变量驱动 Sidebar 实际宽度。
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className="flex min-h-screen w-full">
        {/* 左侧主导航区域。 */}
        <AppSidebar />

        {/* 拖拽分隔条：仅桌面显示。 */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handleResizeStart}
          className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition hover:bg-border md:block"
        />

        {/* 右侧主内容区域：上方可选触发器，下方渲染路由页面内容。 */}
        <main className="min-w-0 flex-1 p-4">
          {!hideGlobalTrigger ? <SidebarTrigger /> : null}
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
