// 前端 DB 访问层：优先调用 Electron 注入的 SQLite API，浏览器环境降级为本地静态兜底。
export type ProjectRecord = {
  id: string
  title: string
  description: string | null
  status: "active" | "archived"
  sortOrder: number
  updatedAt: string
}

export type RequirementRecord = {
  id: string
  title: string
  description: string | null
  status: "todo" | "done"
  priority: "normal" | "urgent"
  sortOrder: number
  updatedAt: string
}

// 读取项目列表：Electron 环境走 IPC，Web 环境返回空列表。
export async function listProjects(): Promise<ProjectRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listProjects) {
    return window.horaDB.listProjects()
  }

  return []
}

// 创建项目：Electron 环境走 IPC，Web 环境抛出提示错误。
export async function createProject(input: {
  title: string
  description?: string
}): Promise<ProjectRecord> {
  if (typeof window !== "undefined" && window.horaDB?.createProject) {
    return window.horaDB.createProject(input)
  }

  throw new Error("当前不是 Electron 运行环境，无法写入本地数据库")
}

// 读取单个项目信息：用于详情页标题。
export async function getProject(projectId: string): Promise<ProjectRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getProject) {
    return window.horaDB.getProject(projectId)
  }

  return null
}

// 查询项目下任务列表。
export async function listRequirementsByProject(projectId: string): Promise<RequirementRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listRequirementsByProject) {
    return window.horaDB.listRequirementsByProject(projectId)
  }

  return []
}

// 创建任务。
export async function createRequirement(input: {
  projectId: string
  title: string
  description?: string
  priority?: "normal" | "urgent"
}): Promise<RequirementRecord> {
  if (typeof window !== "undefined" && window.horaDB?.createRequirement) {
    return window.horaDB.createRequirement(input)
  }

  throw new Error("当前不是 Electron 运行环境，无法写入本地数据库")
}

// 更新任务完成状态。
export async function updateRequirementStatus(input: {
  id: string
  done: boolean
}): Promise<{ id: string; status: "todo" | "done" }> {
  if (typeof window !== "undefined" && window.horaDB?.updateRequirementStatus) {
    return window.horaDB.updateRequirementStatus(input)
  }

  throw new Error("当前不是 Electron 运行环境，无法写入本地数据库")
}
