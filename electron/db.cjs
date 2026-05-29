// Electron 本地数据库模块：文件系统驱动 Markdown，SQLite 仅做索引与 metadata。
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { app } = require("electron")
const Database = require("better-sqlite3")
const chokidar = require("chokidar")

let dbInstance = null
let notesWatcher = null

const WORKSPACE_ID = "ws_local_default"
const LOCAL_OWNER = "local_owner"

// 统一路径：Hora 数据目录。
function getHoraDataPath() {
  if (process.platform === "darwin") {
    return path.join(app.getPath("home"), "Library", "hora-notes", "hora-data")
  }
  return path.join(app.getPath("userData"), "hora-data")
}

// 统一路径：Vault 根目录。
function getVaultPath() {
  return path.join(getHoraDataPath(), "vault")
}

// 统一路径：notes 目录。
function getNotesPath() {
  return path.join(getVaultPath(), "notes")
}

// 统一路径：SQLite 文件。
function getDbPath() {
  return path.join(getHoraDataPath(), "hora.db")
}

// 解析初始化 SQL 路径：兼容开发与打包。
function resolveSqlPath() {
  if (app.isPackaged) {
    const packagedCandidates = [
      path.join(process.resourcesPath, "resources", "sql", "init_local_full.sql"),
      path.join(process.resourcesPath, "sql", "init_local_full.sql"),
    ]
    const packagedFound = packagedCandidates.find((filePath) => fs.existsSync(filePath))
    if (packagedFound) return packagedFound
    return packagedCandidates[0]
  }

  const appPath = app.getAppPath()
  const devCandidates = [
    path.join(appPath, "resources", "sql", "init_local_full.sql"),
    path.join(appPath, "electron", "resources", "sql", "init_local_full.sql"),
  ]
  const devFound = devCandidates.find((filePath) => fs.existsSync(filePath))
  if (devFound) return devFound
  return devCandidates[0]
}

// 计算文本哈希：用于内容变更识别。
function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex")
}

// 计算文件哈希：用于 watcher 的 change/update。
function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null
  const text = fs.readFileSync(filePath, "utf8")
  return sha256(text)
}

// 标题派生：xxx.md / xxx.excalidraw.md => xxx。
function titleFromFileName(fileName) {
  return fileName.replace(/\.excalidraw\.md$/i, "").replace(/\.md$/i, "")
}

// 判断是否是受支持的笔记文件。
function isSupportedNoteFileName(fileName) {
  const lower = fileName.toLowerCase()
  return lower.endsWith(".md") || lower.endsWith(".excalidraw")
}

// 判断是否是绘图文件（Obsidian 风格后缀）。
function isDrawingFileName(fileName) {
  const lower = fileName.toLowerCase()
  return lower.endsWith(".excalidraw.md") || lower.endsWith(".excalidraw")
}

// 根据路径保留文件后缀：普通笔记 .md，绘图文件 .excalidraw.md。
function getFileSuffixFromPath(filePath) {
  const fileName = path.posix.basename(filePath || "")
  if (fileName.toLowerCase().endsWith(".excalidraw.md")) return ".excalidraw.md"
  if (fileName.toLowerCase().endsWith(".excalidraw")) return ".excalidraw"
  return ".md"
}

// 生成稳定节点 ID：同一路径保持稳定。
function buildNodeId(prefix, relativePath) {
  const seed = `${prefix}:${relativePath}`
  const short = crypto.createHash("sha1").update(seed, "utf8").digest("hex").slice(0, 16)
  return `${prefix}_${short}`
}

// 绝对路径 => 相对 vault 路径。
function toVaultRelativePath(absPath) {
  const vaultPath = getVaultPath()
  const relative = path.relative(vaultPath, absPath)
  return relative.split(path.sep).join("/")
}

// 相对 vault 路径 => 绝对路径。
function toVaultAbsolutePath(relativePath) {
  return path.join(getVaultPath(), relativePath)
}

// 确保 note_nodes 具备文件系统驱动字段。
function ensureNoteSchema(db) {
  const columns = db.prepare("PRAGMA table_info(note_nodes)").all()
  const hasColumn = (name) => columns.some((col) => col.name === name)

  if (!hasColumn("file_path")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_path TEXT")
  if (!hasColumn("file_size")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0")
  if (!hasColumn("file_hash")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_hash TEXT")
  if (!hasColumn("sync_status")) db.exec("ALTER TABLE note_nodes ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'")
  if (!hasColumn("content_updated_at")) db.exec("ALTER TABLE note_nodes ADD COLUMN content_updated_at TEXT")
  if (!hasColumn("meta_updated_at")) db.exec("ALTER TABLE note_nodes ADD COLUMN meta_updated_at TEXT")

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_note_nodes_file_path_alive
    ON note_nodes(file_path)
    WHERE is_deleted = 0 AND file_path IS NOT NULL
  `)
}

// 递归扫描 notes：收集文件夹与受支持文件。
function scanNotesTree() {
  const notesPath = getNotesPath()
  const folders = []
  const files = []

  // 深度优先扫描：保证父目录先于子目录处理。
  function walk(currentAbsPath, relativePath) {
    const entries = fs.readdirSync(currentAbsPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))

    const childFolders = []
    const childFiles = []

    for (const entry of entries) {
      const childAbsPath = path.join(currentAbsPath, entry.name)
      const childRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : `notes/${entry.name}`

      if (entry.isDirectory()) {
        childFolders.push(childRelativePath)
        walk(childAbsPath, childRelativePath)
        continue
      }

      if (entry.isFile()) {
        const lower = entry.name.toLowerCase()
        if (isSupportedNoteFileName(lower)) {
          childFiles.push(childRelativePath)
        }
      }
    }

    // 记录当前目录下节点顺序：先目录后文件。
    childFolders.forEach((folderPath, index) => {
      folders.push({ relativePath: folderPath, sortOrder: index })
    })
    childFiles.forEach((filePath, index) => {
      files.push({ relativePath: filePath, sortOrder: childFolders.length + index })
    })
  }

  if (!fs.existsSync(notesPath)) {
    return { folders, files }
  }

  walk(notesPath, "")
  return { folders, files }
}

// 确保首启默认文件：notes 为空时创建 welcome.md。
function ensureDefaultWelcomeFile() {
  const notesPath = getNotesPath()
  fs.mkdirSync(notesPath, { recursive: true })

  const hasAnyNote = fs.readdirSync(notesPath).some((name) => {
    const lower = name.toLowerCase()
    return isSupportedNoteFileName(lower)
  })
  if (hasAnyNote) {
    return
  }

  const welcomePath = path.join(notesPath, "welcome.md")
  const welcomeText = "# Welcome to Hora\n\n这是你的第一篇本地 Markdown 笔记。\n"
  fs.writeFileSync(welcomePath, welcomeText, "utf8")
}

// 全量同步：文件系统 -> SQLite。
function syncVaultToDatabase() {
  const db = getDb()
  const now = new Date().toISOString()

  const { folders, files } = scanNotesTree()
  const alivePaths = new Set()

  const selectByPath = db.prepare(`
    SELECT id, node_type AS nodeType
    FROM note_nodes
    WHERE workspace_id = ? AND file_path = ?
    LIMIT 1
  `)

  const upsertNode = db.prepare(`
    INSERT INTO note_nodes (
      id, workspace_id, parent_id, node_type, title, file_path, file_size, file_hash, sync_status,
      sort_order, is_deleted, created_by, updated_by, created_at, updated_at, content_updated_at, meta_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, 0, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id = excluded.parent_id,
      node_type = excluded.node_type,
      title = excluded.title,
      file_path = excluded.file_path,
      file_size = excluded.file_size,
      file_hash = excluded.file_hash,
      sort_order = excluded.sort_order,
      is_deleted = 0,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at,
      content_updated_at = excluded.content_updated_at,
      meta_updated_at = excluded.meta_updated_at
  `)

  const txn = db.transaction(() => {
    // 目录先按深度排序：保证父目录一定在子目录前插入，避免 parent_id 外键失败。
    const sortedFolders = [...folders].sort((a, b) => {
      const aDepth = a.relativePath.split("/").length
      const bDepth = b.relativePath.split("/").length
      if (aDepth !== bDepth) {
        return aDepth - bDepth
      }
      return a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN")
    })

    // 目录节点同步：用于构建树。
    for (const folder of sortedFolders) {
      const existing = selectByPath.get(WORKSPACE_ID, folder.relativePath)
      const folderId = existing?.id || buildNodeId("folder", folder.relativePath)

      const parentRelative = path.posix.dirname(folder.relativePath)
      const parentPath = parentRelative === "notes" ? null : parentRelative
      const parentId = parentPath
        ? (selectByPath.get(WORKSPACE_ID, parentPath)?.id || buildNodeId("folder", parentPath))
        : null

      const title = path.posix.basename(folder.relativePath)
      upsertNode.run(
        folderId,
        WORKSPACE_ID,
        parentId,
        "folder",
        title,
        folder.relativePath,
        0,
        null,
        folder.sortOrder,
        LOCAL_OWNER,
        LOCAL_OWNER,
        now,
        now,
        now,
        now,
      )
      alivePaths.add(folder.relativePath)
    }

    // 文件节点同步：正文以 .md 为准，DB 存 metadata。
    for (const file of files) {
      const absPath = toVaultAbsolutePath(file.relativePath)
      const stat = fs.statSync(absPath)
      const hash = sha256File(absPath)

      const existing = selectByPath.get(WORKSPACE_ID, file.relativePath)
      const fileId = existing?.id || buildNodeId("note", file.relativePath)

      const parentRelative = path.posix.dirname(file.relativePath)
      const parentPath = parentRelative === "notes" ? null : parentRelative
      const parentId = parentPath
        ? (selectByPath.get(WORKSPACE_ID, parentPath)?.id || buildNodeId("folder", parentPath))
        : null

      const title = titleFromFileName(path.posix.basename(file.relativePath))
      upsertNode.run(
        fileId,
        WORKSPACE_ID,
        parentId,
        "file",
        title,
        file.relativePath,
        stat.size,
        hash,
        file.sortOrder,
        LOCAL_OWNER,
        LOCAL_OWNER,
        now,
        now,
        now,
        now,
      )
      alivePaths.add(file.relativePath)
    }

    // 逻辑删除：DB 有但文件系统已不存在。
    const rows = db.prepare(`
      SELECT id, file_path AS filePath
      FROM note_nodes
      WHERE workspace_id = ?
        AND is_deleted = 0
        AND file_path IS NOT NULL
        AND (file_path = 'notes' OR file_path LIKE 'notes/%')
    `).all(WORKSPACE_ID)

    const markDeleted = db.prepare(`
      UPDATE note_nodes
      SET is_deleted = 1, updated_by = ?, updated_at = ?, meta_updated_at = ?
      WHERE id = ?
    `)

    for (const row of rows) {
      if (!alivePaths.has(row.filePath)) {
        markDeleted.run(LOCAL_OWNER, now, now, row.id)
      }
    }
  })

  txn()
}

// 初始化数据库：首启建库 + 默认文件 + 全量同步。
function initDatabase() {
  const dbPath = getDbPath()
  const sqlPath = resolveSqlPath()

  const isFirstInit = !fs.existsSync(dbPath)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.mkdirSync(getVaultPath(), { recursive: true })
  fs.mkdirSync(getNotesPath(), { recursive: true })

  const db = new Database(dbPath)
  db.pragma("journal_mode = DELETE")

  if (isFirstInit) {
    const initSql = fs.readFileSync(sqlPath, "utf8")
    db.exec(initSql)
  }

  ensureNoteSchema(db)
  ensureDefaultWelcomeFile()

  return db
}

// 懒加载 DB 实例：首次调用时触发同步。
function getDb() {
  if (dbInstance) return dbInstance
  dbInstance = initDatabase()
  syncVaultToDatabase()
  return dbInstance
}

// 对外：查询项目列表。
function listProjects() {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, title, description, status, sort_order AS sortOrder, updated_at AS updatedAt
    FROM projects
    WHERE workspace_id = ? AND is_deleted = 0
    ORDER BY sort_order ASC, updated_at DESC
  `)
  return stmt.all(WORKSPACE_ID)
}

// 对外：创建项目。
function createProject(input) {
  const db = getDb()
  const id = `proj_${Date.now()}`
  const now = new Date().toISOString()
  const sortStmt = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort
    FROM projects
    WHERE workspace_id = ? AND is_deleted = 0
  `)
  const { nextSort } = sortStmt.get(WORKSPACE_ID)
  const insertStmt = db.prepare(`
    INSERT INTO projects (
      id, workspace_id, title, description, status, sort_order, is_deleted, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?)
  `)
  insertStmt.run(id, WORKSPACE_ID, input.title, input.description || null, nextSort, LOCAL_OWNER, LOCAL_OWNER, now, now)
  return { id, title: input.title, description: input.description || null, status: "active", sortOrder: nextSort, updatedAt: now }
}

// 对外：按项目查询需求。
function listRequirementsByProject(projectId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, title, description, status, priority, sort_order AS sortOrder, updated_at AS updatedAt
    FROM requirements
    WHERE project_id = ? AND is_deleted = 0
    ORDER BY sort_order ASC, updated_at DESC
  `)
  return stmt.all(projectId)
}

// 对外：创建需求。
function createRequirement(input) {
  const db = getDb()
  const id = `req_${Date.now()}`
  const now = new Date().toISOString()
  const sortStmt = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort
    FROM requirements
    WHERE project_id = ? AND is_deleted = 0
  `)
  const { nextSort } = sortStmt.get(input.projectId)
  const insertStmt = db.prepare(`
    INSERT INTO requirements (
      id, project_id, title, description, status, priority, sort_order, is_deleted, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'todo', ?, ?, 0, ?, ?, ?, ?)
  `)
  insertStmt.run(id, input.projectId, input.title, input.description || null, input.priority || "normal", nextSort, LOCAL_OWNER, LOCAL_OWNER, now, now)
  return { id, title: input.title, description: input.description || null, status: "todo", priority: input.priority || "normal", sortOrder: nextSort, updatedAt: now }
}

// 对外：更新需求完成状态。
function updateRequirementStatus(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE requirements
    SET status = ?, completed_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `)
  const status = input.done ? "done" : "todo"
  stmt.run(status, input.done ? now : null, LOCAL_OWNER, now, input.id)
  return { id: input.id, status }
}

// 对外：按 ID 获取项目。
function getProjectById(projectId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, title, description, status
    FROM projects
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `)
  return stmt.get(projectId) || null
}

// 对外：列出笔记节点（侧边栏树）。
function listNoteNodes() {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, title, sort_order AS sortOrder, file_path AS filePath
    FROM note_nodes
    WHERE workspace_id = ? AND is_deleted = 0
      AND file_path IS NOT NULL
      AND (file_path = 'notes' OR file_path LIKE 'notes/%')
    ORDER BY parent_id ASC, sort_order ASC, title ASC
  `)
  return stmt.all(WORKSPACE_ID)
}

// 对外：按 ID 获取笔记。
function getNoteById(noteId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, title, node_type AS nodeType, file_path AS filePath, updated_at AS updatedAt
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `)
  return stmt.get(noteId) || null
}

// 对外：读取 Markdown 正文。
function readNoteContent(noteId) {
  const note = getNoteById(noteId)
  if (!note || note.nodeType !== "file" || !note.filePath) return ""

  const targetPath = toVaultAbsolutePath(note.filePath)
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, "", "utf8")
  }
  return fs.readFileSync(targetPath, "utf8")
}

// 对外：保存 Markdown 正文，只更新 metadata。
function saveNoteContent(input) {
  const db = getDb()
  const note = getNoteById(input.noteId)
  if (!note || note.nodeType !== "file" || !note.filePath) throw new Error("目标笔记不存在或不是文件")

  const now = new Date().toISOString()
  const targetPath = toVaultAbsolutePath(note.filePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, input.content, "utf8")

  const stats = fs.statSync(targetPath)
  const hash = sha256(input.content)

  const stmt = db.prepare(`
    UPDATE note_nodes
    SET file_size = ?, file_hash = ?, sync_status = 'local', updated_by = ?, updated_at = ?, content_updated_at = ?, meta_updated_at = COALESCE(meta_updated_at, ?)
    WHERE id = ?
  `)
  stmt.run(stats.size, hash, LOCAL_OWNER, now, now, now, note.id)

  return { id: note.id, filePath: note.filePath, fileSize: stats.size, fileHash: hash, updatedAt: now }
}

// 标准化标题：用于文件名/目录名生成。
function normalizeNodeName(rawName) {
  const base = String(rawName || "").trim()
  if (!base) return "untitled"
  return base.replace(/[\\/:*?"<>|]/g, "_")
}

// 生成唯一相对路径：避免同目录重名冲突。
function buildUniqueChildPath(parentRelativePath, targetName, isFile, fileExt = ".md") {
  const parentAbsPath = parentRelativePath
    ? toVaultAbsolutePath(parentRelativePath)
    : getNotesPath()
  const ext = isFile ? fileExt : ""
  const normalized = normalizeNodeName(targetName)
    .replace(/\.excalidraw\.md$/i, "")
    .replace(/\.excalidraw$/i, "")
    .replace(/\.md$/i, "")

  let seq = 0
  while (true) {
    const suffix = seq === 0 ? "" : `-${seq}`
    const nextName = `${normalized}${suffix}${ext}`
    const nextAbsPath = path.join(parentAbsPath, nextName)
    if (!fs.existsSync(nextAbsPath)) {
      const nextRelativePath = parentRelativePath
        ? `${parentRelativePath}/${nextName}`
        : `notes/${nextName}`
      return nextRelativePath
    }
    seq += 1
  }
}

// 新建节点：文件支持 .md/.excalidraw.md；目录创建文件夹。
function createNoteNode(input) {
  const db = getDb()
  const parentId = input.parentId || null
  const nodeType = input.nodeType === "folder" ? "folder" : "file"
  const title = normalizeNodeName(input.title || (nodeType === "folder" ? "新建文件夹" : "新建文件"))
  // 文件类型：默认 markdown，可选 drawing。
  const fileExt = input.fileKind === "drawing" ? ".excalidraw.md" : ".md"

  let parentRelativePath = null
  if (parentId) {
    const parent = db.prepare(`
      SELECT id, node_type AS nodeType, file_path AS filePath
      FROM note_nodes
      WHERE id = ? AND is_deleted = 0
      LIMIT 1
    `).get(parentId)
    if (!parent || parent.nodeType !== "folder") {
      throw new Error("父目录不存在或不是文件夹")
    }
    parentRelativePath = parent.filePath
  }

  const nextRelativePath = buildUniqueChildPath(parentRelativePath, title, nodeType === "file", fileExt)
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  if (nodeType === "folder") {
    fs.mkdirSync(nextAbsPath, { recursive: true })
  } else {
    fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
    fs.writeFileSync(nextAbsPath, "", "utf8")
  }

  syncVaultToDatabase()

  const created = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, title, file_path AS filePath
    FROM note_nodes
    WHERE workspace_id = ? AND file_path = ? AND is_deleted = 0
    LIMIT 1
  `).get(WORKSPACE_ID, nextRelativePath)

  return created || null
}

// 重命名节点：文件保留原始扩展名，目录重命名文件夹。
function renameNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const oldAbsPath = toVaultAbsolutePath(node.filePath)
  const parentRelativePath = path.posix.dirname(node.filePath) === "notes"
    ? null
    : path.posix.dirname(node.filePath)
  const oldExt = node.nodeType === "file" ? getFileSuffixFromPath(node.filePath || "") : ""
  const nextRelativePath = buildUniqueChildPath(
    parentRelativePath,
    normalizeNodeName(input.title || "untitled"),
    node.nodeType === "file",
    oldExt,
  )
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
  fs.renameSync(oldAbsPath, nextAbsPath)

  syncVaultToDatabase()
  return true
}

// 删除节点：文件删除文件，目录递归删除。
function deleteNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, node_type AS nodeType, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const targetAbsPath = toVaultAbsolutePath(node.filePath)
  if (fs.existsSync(targetAbsPath)) {
    if (node.nodeType === "folder") {
      fs.rmSync(targetAbsPath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(targetAbsPath)
    }
  }

  syncVaultToDatabase()
  return true
}

// 移动节点：文件和目录都通过真实文件系统移动，再同步回数据库。
function moveNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, node_type AS nodeType, title, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const targetParentId = input.parentId || null
  let targetParentPath = null
  if (targetParentId) {
    const parent = db.prepare(`
      SELECT id, node_type AS nodeType, file_path AS filePath
      FROM note_nodes
      WHERE id = ? AND is_deleted = 0
      LIMIT 1
    `).get(targetParentId)
    if (!parent || parent.nodeType !== "folder" || !parent.filePath) {
      throw new Error("目标目录不存在或不是文件夹")
    }
    if (parent.id === node.id || parent.filePath.startsWith(`${node.filePath}/`)) {
      throw new Error("不能移动到自身或子目录中")
    }
    targetParentPath = parent.filePath
  }

  const oldAbsPath = toVaultAbsolutePath(node.filePath)
  if (!fs.existsSync(oldAbsPath)) {
    throw new Error("源文件不存在")
  }

  // 文件移动时保留原始扩展名；目录移动时保留目录名。
  const fileExt = node.nodeType === "file" ? getFileSuffixFromPath(node.filePath || "") : ""
  const baseName = path.posix.basename(node.filePath)
    .replace(/\.excalidraw\.md$/i, "")
    .replace(/\.excalidraw$/i, "")
    .replace(/\.md$/i, "")
  const nextRelativePath = buildUniqueChildPath(targetParentPath, baseName, node.nodeType === "file", fileExt)
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
  fs.renameSync(oldAbsPath, nextAbsPath)

  syncVaultToDatabase()
  return true
}

// 文件变更处理：将 chokidar 事件收敛到一次同步。
function handleFsChanged(onNotesChanged) {
  try {
    syncVaultToDatabase()
    if (onNotesChanged) onNotesChanged()
  } catch (error) {
    console.error("[hora] syncVaultToDatabase failed:", error)
  }
}

// 启动实时监听：监听 notes 目录变更并通知前端。
function startNotesWatcher(onNotesChanged) {
  if (notesWatcher) {
    return notesWatcher
  }

  const notesPath = getNotesPath()
  fs.mkdirSync(notesPath, { recursive: true })

  notesWatcher = chokidar.watch(notesPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  })

  // add：新增受支持文件。
  notesWatcher.on("add", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // unlink：删除受支持文件。
  notesWatcher.on("unlink", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // change：文件内容变化。
  notesWatcher.on("change", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // addDir：新增文件夹。
  notesWatcher.on("addDir", () => {
    handleFsChanged(onNotesChanged)
  })

  // unlinkDir：删除文件夹。
  notesWatcher.on("unlinkDir", () => {
    handleFsChanged(onNotesChanged)
  })

  return notesWatcher
}

module.exports = {
  getHoraDataPath,
  getVaultPath,
  getNotesPath,
  syncVaultToDatabase,
  startNotesWatcher,
  listProjects,
  createProject,
  listRequirementsByProject,
  createRequirement,
  updateRequirementStatus,
  getProjectById,
  listNoteNodes,
  getNoteById,
  readNoteContent,
  saveNoteContent,
  createNoteNode,
  renameNoteNode,
  deleteNoteNode,
  moveNoteNode,
}
