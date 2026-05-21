"use client"

import { NotesTree } from "@/components/notes-tree"
import { type NotesTreeNode } from "@/components/sidebar-data"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar"

type NavNotesProps = {
  tree: NotesTreeNode[]
}

// Notes 分组：渲染树形笔记目录。
export function NavNotes({ tree }: NavNotesProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Notes</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {tree.map((item) => (
            <NotesTree key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
