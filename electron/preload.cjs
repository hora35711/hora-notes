// Preload 桥接：给前端提供最小 DB API，避免直接暴露 Node 能力。
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("horaDB", {
  listProjects: () => ipcRenderer.invoke("db:projects:list"),
  createProject: (input) => ipcRenderer.invoke("db:projects:create", input),
  getProject: (projectId) => ipcRenderer.invoke("db:projects:get", projectId),
  updateProject: (input) => ipcRenderer.invoke("db:projects:update", input),
  deleteProject: (projectId) => ipcRenderer.invoke("db:projects:delete", projectId),
  reorderProjects: (input) => ipcRenderer.invoke("db:projects:reorder", input),

  listRequirementsByProject: (projectId) => ipcRenderer.invoke("db:requirements:listByProject", projectId),
  createRequirement: (input) => ipcRenderer.invoke("db:requirements:create", input),
  updateRequirement: (input) => ipcRenderer.invoke("db:requirements:update", input),
  deleteRequirement: (requirementId) => ipcRenderer.invoke("db:requirements:delete", requirementId),
  reorderRequirements: (input) => ipcRenderer.invoke("db:requirements:reorder", input),

  listTasksByProject: (projectId) => ipcRenderer.invoke("db:tasks:listByProject", projectId),
  listAllTasks: (filters) => ipcRenderer.invoke("db:tasks:listAll", filters),
  createTask: (input) => ipcRenderer.invoke("db:tasks:create", input),
  updateTask: (input) => ipcRenderer.invoke("db:tasks:update", input),
  updateTaskStatus: (input) => ipcRenderer.invoke("db:tasks:updateStatus", input),
  deleteTask: (taskId) => ipcRenderer.invoke("db:tasks:delete", taskId),
  reorderTasks: (input) => ipcRenderer.invoke("db:tasks:reorder", input),

  listNotesByProject: (projectId) => ipcRenderer.invoke("db:noteLinks:listByProject", projectId),
  listNotesByRequirement: (requirementId) => ipcRenderer.invoke("db:noteLinks:listByRequirement", requirementId),
  listNotesByTask: (taskId) => ipcRenderer.invoke("db:noteLinks:listByTask", taskId),
  linkNoteToProject: (noteId, projectId) => ipcRenderer.invoke("db:noteLinks:linkProject", noteId, projectId),
  unlinkNoteFromProject: (noteId, projectId) => ipcRenderer.invoke("db:noteLinks:unlinkProject", noteId, projectId),
  linkNoteToRequirement: (noteId, requirementId) => ipcRenderer.invoke("db:noteLinks:linkRequirement", noteId, requirementId),
  unlinkNoteFromRequirement: (noteId, requirementId) => ipcRenderer.invoke("db:noteLinks:unlinkRequirement", noteId, requirementId),
  linkNoteToTask: (noteId, taskId) => ipcRenderer.invoke("db:noteLinks:linkTask", noteId, taskId),
  unlinkNoteFromTask: (noteId, taskId) => ipcRenderer.invoke("db:noteLinks:unlinkTask", noteId, taskId),

  // 插件元数据和设置：通过数据库保存启用状态、排序和配置信息。
  listPlugins: () => ipcRenderer.invoke("db:plugins:list"),
  getPlugin: (pluginKey) => ipcRenderer.invoke("db:plugins:get", pluginKey),
  refreshPlugins: () => ipcRenderer.invoke("db:plugins:refresh"),
  updatePlugin: (input) => ipcRenderer.invoke("db:plugins:update", input),
  setPluginEnabled: (pluginKey, enabled) => ipcRenderer.invoke("db:plugins:setEnabled", pluginKey, enabled),
  reorderPlugins: (input) => ipcRenderer.invoke("db:plugins:reorder", input),
  updatePluginSettings: (input) => ipcRenderer.invoke("db:plugins:updateSettings", input),
  getPluginRootPath: () => ipcRenderer.invoke("db:plugins:getRootPath"),
  importPluginPackage: () => ipcRenderer.invoke("db:plugins:import"),
  restartApp: () => ipcRenderer.invoke("app:restart"),

  listNoteNodes: () => ipcRenderer.invoke("db:notes:list"),
  getNote: (noteId) => ipcRenderer.invoke("db:notes:get", noteId),
  readNoteContent: (noteId) => ipcRenderer.invoke("db:notes:read", noteId),
  saveNoteContent: (input) => ipcRenderer.invoke("db:notes:save", input),
  createNoteNode: (input) => ipcRenderer.invoke("db:notes:create", input),
  renameNoteNode: (input) => ipcRenderer.invoke("db:notes:rename", input),
  deleteNoteNode: (input) => ipcRenderer.invoke("db:notes:delete", input),
  moveNoteNode: (input) => ipcRenderer.invoke("db:notes:move", input),
  showNoteInFinder: (noteId) => ipcRenderer.invoke("shell:notes:showInFinder", noteId),
  openNoteWithDefaultApp: (noteId) => ipcRenderer.invoke("shell:notes:openDefault", noteId),

  // 前端订阅笔记目录变化：返回取消订阅函数。
  onNotesChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("notes-changed", listener)
    return () => {
      ipcRenderer.removeListener("notes-changed", listener)
    }
  },
})
