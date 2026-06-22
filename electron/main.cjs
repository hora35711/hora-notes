// Electron 主进程：启动窗口、注册 IPC，并桥接笔记变更事件。
const path = require("node:path")
const fs = require("node:fs")
const { app, BrowserWindow, ipcMain, shell } = require("electron")
const db = require("./db.cjs")

let mainWindow = null

// 广播笔记变更：通知所有渲染进程刷新侧边栏目录。
function notifyNotesChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notes-changed")
  }
}

// 注册 IPC：渲染层通过 preload 调用本地数据库方法。
function registerDbIpc() {
  ipcMain.handle("shell:notes:showInFinder", (_event, noteId) => {
    const note = db.getNoteById(noteId)
    if (!note || !note.filePath) {
      throw new Error("目标节点不存在")
    }

    const targetPath = path.join(db.getVaultPath(), note.filePath)
    if (!fs.existsSync(targetPath)) {
      throw new Error("目标路径不存在")
    }

    // 只让系统 Finder 定位当前文件或文件夹，不触发目录刷新或路由变化。
    shell.showItemInFolder(targetPath)
    return true
  })

  ipcMain.handle("shell:notes:openDefault", async (_event, noteId) => {
    const note = db.getNoteById(noteId)
    if (!note || !note.filePath) {
      throw new Error("目标节点不存在")
    }

    const targetPath = path.join(db.getVaultPath(), note.filePath)
    if (!fs.existsSync(targetPath)) {
      throw new Error("目标路径不存在")
    }

    // 使用系统默认应用打开 PDF/Word/Excel 等不适合直接进入编辑器的文件。
    const errorMessage = await shell.openPath(targetPath)
    if (errorMessage) {
      throw new Error(errorMessage)
    }
    return true
  })

  ipcMain.handle("db:projects:list", () => db.listProjects())
  ipcMain.handle("db:projects:create", (_event, input) => db.createProject(input))
  ipcMain.handle("db:projects:get", (_event, projectId) => db.getProjectById(projectId))
  ipcMain.handle("db:projects:update", (_event, input) => db.updateProject(input))
  ipcMain.handle("db:projects:delete", (_event, projectId) => db.deleteProject(projectId))
  ipcMain.handle("db:projects:reorder", (_event, input) => db.reorderProjects(input))

  ipcMain.handle("db:requirements:listByProject", (_event, projectId) =>
    db.listRequirementsByProject(projectId),
  )
  ipcMain.handle("db:requirements:create", (_event, input) =>
    db.createRequirement(input),
  )
  ipcMain.handle("db:requirements:update", (_event, input) =>
    db.updateRequirement(input),
  )
  ipcMain.handle("db:requirements:delete", (_event, requirementId) => db.deleteRequirement(requirementId))
  ipcMain.handle("db:requirements:reorder", (_event, input) => db.reorderRequirements(input))

  ipcMain.handle("db:tasks:listByProject", (_event, projectId) => db.listTasksByProject(projectId))
  ipcMain.handle("db:tasks:listAll", (_event, filters) => db.listAllTasks(filters))
  ipcMain.handle("db:tasks:create", (_event, input) => db.createTask(input))
  ipcMain.handle("db:tasks:update", (_event, input) => db.updateTask(input))
  ipcMain.handle("db:tasks:updateStatus", (_event, input) => db.updateTaskStatus(input))
  ipcMain.handle("db:tasks:delete", (_event, taskId) => db.deleteTask(taskId))
  ipcMain.handle("db:tasks:reorder", (_event, input) => db.reorderTasks(input))

  ipcMain.handle("db:noteLinks:listByProject", (_event, projectId) => db.listNotesByProject(projectId))
  ipcMain.handle("db:noteLinks:listByRequirement", (_event, requirementId) => db.listNotesByRequirement(requirementId))
  ipcMain.handle("db:noteLinks:listByTask", (_event, taskId) => db.listNotesByTask(taskId))
  ipcMain.handle("db:noteLinks:linkProject", (_event, noteId, projectId) => db.linkNoteToProject(noteId, projectId))
  ipcMain.handle("db:noteLinks:unlinkProject", (_event, noteId, projectId) => db.unlinkNoteFromProject(noteId, projectId))
  ipcMain.handle("db:noteLinks:linkRequirement", (_event, noteId, requirementId) => db.linkNoteToRequirement(noteId, requirementId))
  ipcMain.handle("db:noteLinks:unlinkRequirement", (_event, noteId, requirementId) => db.unlinkNoteFromRequirement(noteId, requirementId))
  ipcMain.handle("db:noteLinks:linkTask", (_event, noteId, taskId) => db.linkNoteToTask(noteId, taskId))
  ipcMain.handle("db:noteLinks:unlinkTask", (_event, noteId, taskId) => db.unlinkNoteFromTask(noteId, taskId))

  ipcMain.handle("db:notes:list", () => db.listNoteNodes())
  ipcMain.handle("db:notes:get", (_event, noteId) => db.getNoteById(noteId))
  ipcMain.handle("db:notes:read", (_event, noteId) => db.readNoteContent(noteId))
  ipcMain.handle("db:notes:save", (_event, input) => db.saveNoteContent(input))
  ipcMain.handle("db:notes:create", (_event, input) => {
    const result = db.createNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:rename", (_event, input) => {
    const result = db.renameNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:delete", (_event, input) => {
    const result = db.deleteNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:move", (_event, input) => {
    const result = db.moveNoteNode(input)
    notifyNotesChanged()
    return result
  })
}

// 创建窗口：开发态加载 Next dev server，打包态加载本地占位页面。
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win

  const devUrl = process.env.ELECTRON_RENDERER_URL

  if (devUrl) {
    // 开发模式
    win.loadURL(devUrl)
  } else {
    // ✅ 生产模式（关键修改）
    win.loadURL("http://localhost:3000")
  }
}

app.whenReady().then(() => {
  // 启动后先做一次同步，保证 UI 初次读取就是最新目录。
  db.syncVaultToDatabase()

  // 启动文件监听：任何 notes 目录变化都推送前端刷新。
  db.startNotesWatcher(() => {
    notifyNotesChanged()
  })

  registerDbIpc()
  createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
