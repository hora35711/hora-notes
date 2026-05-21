import { Home, Folder, List } from "lucide-react"

// Notes 树节点：用于 Sidebar 渲染。
export type NotesTreeNode = {
  id: string
  title: string
  nodeType: "folder" | "file"
  children: NotesTreeNode[]
}

// SQLite 返回的扁平节点结构。
type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
}

// Sidebar 基础静态数据：导航部分保持静态，notesTree 由数据库动态注入。
export const sidebarData = {
  workspace: {
    navMain: [
      { title: "Dashboard", url: "/", icon: Home },
      { title: "Projects", url: "/projects", icon: Folder },
      { title: "Tasks", url: "/tasks", icon: List },
    ],
  },
  mail: {
    nav: [{ title: "Inbox" }, { title: "Sent" }, { title: "Drafts" }],
  },
}

// 将扁平节点转换为树结构。
function buildTree(rows: NoteNodeRow[], parentId: string | null): NotesTreeNode[] {
  const siblings = rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return siblings.map((row) => ({
    id: row.id,
    title: row.title,
    nodeType: row.nodeType,
    children: row.nodeType === "folder" ? buildTree(rows, row.id) : [],
  }))
}

// 从 Electron SQLite 加载笔记树：Web 环境降级为空树。
export async function loadNotesTree(): Promise<NotesTreeNode[]> {
  if (typeof window === "undefined" || !window.horaDB?.listNoteNodes) {
    return []
  }

  const rows = (await window.horaDB.listNoteNodes()) as NoteNodeRow[]
  return buildTree(rows, null)
}
