// 前端 DB 访问层：统一包一层 Electron IPC，浏览器环境只读返回空数据。
export type ProjectStatus = "active" | "paused" | "done" | "archived"
export type RequirementStatus = "todo" | "doing" | "done" | "archived"
export type TaskStatus = "todo" | "doing" | "done" | "cancelled"
export type Priority = "low" | "normal" | "high" | "urgent"

export type ProjectRecord = {
  id: string
  title: string
  description: string | null
  status: ProjectStatus
  priority: Priority
  color: string | null
  sortOrder: number
  startedAt: string | null
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type RequirementRecord = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: RequirementStatus
  priority: Priority
  color: string | null
  sortOrder: number
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type TaskRecord = {
  id: string
  projectId: string
  requirementId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  color: string | null
  isCompleted: 0 | 1
  sortOrder: number
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  projectTitle?: string | null
  requirementTitle?: string | null
}

export type LinkedNoteRecord = {
  id: string
  title: string
  filePath: string | null
  updatedAt: string
}

export type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

export type TaskFilters = {
  projectId?: string
  requirementId?: string
  status?: TaskStatus | ""
  statuses?: TaskStatus[]
  priority?: Priority | ""
  dueAt?: string
  dueAtFrom?: string
  dueAtTo?: string
  isCompleted?: boolean | ""
}

function requireHoraDB() {
  if (typeof window !== "undefined" && window.horaDB) {
    return window.horaDB
  }
  throw new Error("当前不是 Electron 运行环境，无法写入本地数据库")
}

export async function listProjects(): Promise<ProjectRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listProjects) return window.horaDB.listProjects()
  return []
}

export async function getProject(projectId: string): Promise<ProjectRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getProject) return window.horaDB.getProject(projectId)
  return null
}

export async function createProject(input: Partial<ProjectRecord> & { title: string }) {
  return requireHoraDB().createProject(input)
}

export async function updateProject(input: Partial<ProjectRecord> & { id: string }) {
  return requireHoraDB().updateProject(input)
}

export async function deleteProject(projectId: string) {
  return requireHoraDB().deleteProject(projectId)
}

export async function reorderProjects(input: { items: { id: string; sortOrder: number }[] }) {
  return requireHoraDB().reorderProjects(input)
}

export async function listRequirementsByProject(projectId: string): Promise<RequirementRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listRequirementsByProject) {
    return window.horaDB.listRequirementsByProject(projectId)
  }
  return []
}

export async function createRequirement(input: {
  projectId: string
  title: string
  description?: string
  status?: RequirementStatus
  priority?: Priority
  color?: string | null
  dueAt?: string | null
}) {
  return requireHoraDB().createRequirement(input)
}

export async function updateRequirement(input: Partial<RequirementRecord> & { id: string }) {
  return requireHoraDB().updateRequirement(input)
}

export async function deleteRequirement(requirementId: string) {
  return requireHoraDB().deleteRequirement(requirementId)
}

export async function reorderRequirements(input: { projectId: string; items: { id: string; sortOrder: number }[] }) {
  return requireHoraDB().reorderRequirements(input)
}

export async function listTasksByProject(projectId: string): Promise<TaskRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listTasksByProject) {
    return window.horaDB.listTasksByProject(projectId)
  }
  return []
}

export async function listAllTasks(filters: TaskFilters = {}): Promise<TaskRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listAllTasks) return window.horaDB.listAllTasks(filters)
  return []
}

export async function createTask(input: {
  projectId: string
  requirementId?: string | null
  title: string
  description?: string
  status?: TaskStatus
  priority?: Priority
  color?: string | null
  isCompleted?: boolean
  dueAt?: string | null
}) {
  return requireHoraDB().createTask(input)
}

export async function updateTask(input: Omit<Partial<TaskRecord>, "isCompleted"> & { id: string; isCompleted?: boolean | 0 | 1 }) {
  return requireHoraDB().updateTask(input)
}

export async function updateTaskStatus(input: { id: string; status?: TaskStatus; done?: boolean }) {
  return requireHoraDB().updateTaskStatus(input)
}

export async function deleteTask(taskId: string) {
  return requireHoraDB().deleteTask(taskId)
}

export async function reorderTasks(input: { projectId: string; items: { id: string; sortOrder: number }[] }) {
  return requireHoraDB().reorderTasks(input)
}

export async function listNotesByProject(projectId: string): Promise<LinkedNoteRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listNotesByProject) {
    return window.horaDB.listNotesByProject(projectId)
  }
  return []
}

export async function listNoteNodes(): Promise<NoteNodeRow[]> {
  if (typeof window !== "undefined" && window.horaDB?.listNoteNodes) return window.horaDB.listNoteNodes()
  return []
}

export async function createNoteNode(input: {
  parentId?: string | null
  nodeType: "folder" | "file"
  fileKind?: "markdown" | "drawing"
  title: string
}) {
  return requireHoraDB().createNoteNode(input)
}

export async function saveNoteContent(input: { noteId: string; content: string }) {
  return requireHoraDB().saveNoteContent(input)
}

export async function linkNoteToProject(noteId: string, projectId: string) {
  return requireHoraDB().linkNoteToProject(noteId, projectId)
}

export async function unlinkNoteFromProject(noteId: string, projectId: string) {
  return requireHoraDB().unlinkNoteFromProject(noteId, projectId)
}
