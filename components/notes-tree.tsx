"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, File, Folder } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type NotesTreeNode } from "@/components/sidebar-data"

// 单个 Notes 树节点：文件节点点击可跳转到编辑器页面。
export function NotesTree({ item }: { item: NotesTreeNode }) {
  // 文件节点：右键菜单 + 左键打开编辑。
  if (item.nodeType === "file") {
    const [open, setOpen] = useState(false)

    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <div
            onContextMenu={(e) => {
              // 仅右键触发菜单。
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
            onPointerDownCapture={(e) => {
              // 屏蔽左键触发 Dropdown 默认打开。
              if (e.button === 0) {
                e.preventDefault()
              }
            }}
          >
            <SidebarMenuButton asChild className="data-[active=true]:bg-transparent">
              <Link href={`/notes/${item.id}`}>{/* 左键仍然走链接跳转 */}
                <File />
                {item.title}
              </Link>
            </SidebarMenuButton>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => console.log("rename", item.id)}>
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => console.log("delete", item.id)}>
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // 目录节点：左键折叠/展开，右键菜单。
  const [open, setOpen] = useState(false)
  return (
    <SidebarMenuItem>
      <Collapsible className="group/collapsible" defaultOpen={false}>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div
              onContextMenu={(e) => {
                // 仅右键触发菜单。
                e.preventDefault()
                e.stopPropagation()
                setOpen(true)
              }}
              onPointerDownCapture={(e) => {
                // 屏蔽左键触发 Dropdown 默认打开，保留 Collapsible 点击。
                if (e.button === 0) {
                  e.preventDefault()
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                  <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  <Folder />
                  {item.title}
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => console.log("new file in", item.id)}>
              新建文件
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log("new folder in", item.id)}>
              新建文件夹
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log("rename", item.id)}>
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log("delete", item.id)}>
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((subItem) => (
              <NotesTree key={subItem.id} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}
