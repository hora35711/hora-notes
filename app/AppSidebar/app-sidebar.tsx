"use client"

import { useEffect, useState } from "react"

import { sidebarData, loadNotesTree, type NotesTreeNode } from "@/components/sidebar-data"
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

// 主 Sidebar：导航使用静态配置，Notes 从 SQLite 动态加载。
export function AppSidebar() {
  // NotesTree 数据源：默认空数组，加载后展示数据库中的树。
  const [notesTree, setNotesTree] = useState<NotesTreeNode[]>([])

  // 组件挂载时加载笔记树。
  useEffect(() => {
    const run = async () => {
      const tree = await loadNotesTree()
      setNotesTree(tree)
    }

    void run()
  }, [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-10">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                      A
                    </div>
                    <span className="truncate font-medium">Acme Inc</span>
                  </div>

                  <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-popper-anchor-width]">
                <DropdownMenuItem>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                      A
                    </div>
                    <span>Acme Inc</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs">
                      B
                    </div>
                    <span>Beta Corp</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem className="text-muted-foreground">
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
            <TabsList className="w-full">
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
