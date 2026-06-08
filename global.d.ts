// Electron 注入类型声明：为 window.horaDB 提供 TS 类型提示。

type ProjectRecord = {
  id: string
  title: string
  description: string | null
  status: "active" | "archived"
  sortOrder: number
  updatedAt: string
}

type RequirementRecord = {
  id: string
  title: string
  description: string | null
  status: "todo" | "done"
  priority: "normal" | "urgent"
  sortOrder: number
  updatedAt: string
}

type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

type NoteRecord = {
  id: string
  title: string
  nodeType: "folder" | "file"
  filePath: string | null
  updatedAt: string
}

type HoraDBBridge = {
  listProjects: () => Promise<ProjectRecord[]>
  createProject: (input: { title: string; description?: string }) => Promise<ProjectRecord>
  getProject: (projectId: string) => Promise<ProjectRecord | null>
  listRequirementsByProject: (projectId: string) => Promise<RequirementRecord[]>
  createRequirement: (input: {
    projectId: string
    title: string
    description?: string
    priority?: "normal" | "urgent"
  }) => Promise<RequirementRecord>
  updateRequirementStatus: (input: { id: string; done: boolean }) => Promise<{ id: string; status: "todo" | "done" }>
  listNoteNodes: () => Promise<NoteNodeRow[]>
  getNote: (noteId: string) => Promise<NoteRecord | null>
  readNoteContent: (noteId: string) => Promise<string>
  saveNoteContent: (input: { noteId: string; content: string }) => Promise<{
    id: string
    filePath: string
    fileSize: number
    fileHash: string
    updatedAt: string
  }>
  createNoteNode: (input: {
    parentId?: string | null
    nodeType: "folder" | "file"
    // 文件节点类型：markdown 为普通笔记，drawing 为 Excalidraw 绘图。
    fileKind?: "markdown" | "drawing"
    title: string
  }) => Promise<NoteNodeRow | null>
  renameNoteNode: (input: { id: string; title: string }) => Promise<boolean>
  deleteNoteNode: (input: { id: string }) => Promise<boolean>
  moveNoteNode: (input: { id: string; parentId?: string | null }) => Promise<boolean>
  // 在系统 Finder 中定位指定笔记文件或目录。
  showNoteInFinder: (noteId: string) => Promise<boolean>
  onNotesChanged: (callback: () => void) => (() => void) | undefined
}

declare global {
  interface Window {
    horaDB?: HoraDBBridge
  }
}

export {}
