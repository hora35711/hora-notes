"use client"

import { useEffect, useState } from "react"

import { sidebarData, loadNotesTree, type NoteTreeNode } from "@/components/sidebar-data"
import { NavMain } from "@/components/nav-main"
import { NavNotes } from "@/components/nav-notes"
import { NavMail } from "@/components/nav-mail"
import { UserMenu } from "@/components/user-menu"

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

import { ChevronDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// 主 Sidebar：导航读取静态配置，Notes 通过 DB + IPC 实时同步。
export function AppSidebar() {
  // NotesTree 数据源：挂载后从 SQLite 加载并响应文件系统变化。
  const [notesTree, setNotesTree] = useState<NoteTreeNode[]>(sidebarData.workspace.notesTree)

  useEffect(() => {
    // 统一刷新方法：启动加载与后续事件都复用。
    const refreshNotes = async () => {
      const tree = await loadNotesTree()
      setNotesTree(tree)
    }

    void refreshNotes()

    // 订阅主进程推送：notes 文件变化后自动刷新树。
    const unsubscribe = window.horaDB?.onNotesChanged?.(() => {
      void refreshNotes()
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-10 justify-between gap-2 px-3">
                  {/* 顶部工作区切换：左侧品牌块，右侧下拉箭头。 */}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                      A
                    </div>
                    <span className="truncate font-medium">Acme Inc</span>
                  </div>

                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-popper-anchor-width] min-w-56 p-1.5">
                <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                      A
                    </div>
                    <span>Acme Inc</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs">
                      B
                    </div>
                    <span>Beta Corp</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem className="rounded-md px-2.5 py-2 text-muted-foreground">
                  + Create Team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-2 py-2">
          <Tabs defaultValue="workspace" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workspace" className="flex-1">
                Workspace
              </TabsTrigger>
              <TabsTrigger value="mail" className="flex-1">
                Mail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workspace" className="mt-2">
              <NavMain items={sidebarData.workspace.navMain} />
              <NavNotes tree={notesTree} />
            </TabsContent>

            <TabsContent value="mail" className="mt-2">
              <NavMail items={sidebarData.mail.nav} />
            </TabsContent>
          </Tabs>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
