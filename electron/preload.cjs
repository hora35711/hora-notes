// Preload 桥接：给前端提供最小 DB API，避免直接暴露 Node 能力。
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("horaDB", {
  listProjects: () => ipcRenderer.invoke("db:projects:list"),
  createProject: (input) => ipcRenderer.invoke("db:projects:create", input),
  getProject: (projectId) => ipcRenderer.invoke("db:projects:get", projectId),

  listRequirementsByProject: (projectId) => ipcRenderer.invoke("db:requirements:listByProject", projectId),
  createRequirement: (input) => ipcRenderer.invoke("db:requirements:create", input),
  updateRequirementStatus: (input) => ipcRenderer.invoke("db:requirements:updateStatus", input),

  listNoteNodes: () => ipcRenderer.invoke("db:notes:list"),
  getNote: (noteId) => ipcRenderer.invoke("db:notes:get", noteId),
  readNoteContent: (noteId) => ipcRenderer.invoke("db:notes:read", noteId),
  saveNoteContent: (input) => ipcRenderer.invoke("db:notes:save", input),
  createNoteNode: (input) => ipcRenderer.invoke("db:notes:create", input),
  renameNoteNode: (input) => ipcRenderer.invoke("db:notes:rename", input),
  deleteNoteNode: (input) => ipcRenderer.invoke("db:notes:delete", input),
  moveNoteNode: (input) => ipcRenderer.invoke("db:notes:move", input),
  showNoteInFinder: (noteId) => ipcRenderer.invoke("shell:notes:showInFinder", noteId),

  // 前端订阅笔记目录变化：返回取消订阅函数。
  onNotesChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("notes-changed", listener)
    return () => {
      ipcRenderer.removeListener("notes-changed", listener)
    }
  },
})
