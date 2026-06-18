# Spotlight 索引 + 启动台搜不到 App 排查记录

> 记录时间：2026-06-13
> 涉及产品：FanBox、HuaRec Studio（两个本地打包的 Electron app）
> 状态：**启动台问题已解决；Spotlight 搜索问题修复进行中（待重启验证）**

---

## 一、现象

1. 本地打包的 **FanBox 1.9.1** 装进 `/Applications` 后，在「应用程序」/ Spotlight 里**搜不到**。
2. 排查中发现**另一个产品 HuaRec Studio 也有类似问题**。
3. 进一步区分后，发现其实是**两个独立的问题**叠在一起：
   - **问题 A（启动台）**：FanBox 连启动台（Launchpad）都不出现；HuaRec 出现且能打开。
   - **问题 B（Spotlight 搜索）**：FanBox 和 HuaRec **都**无法在 Spotlight / 「应用程序」搜索里被搜到。

---

## 二、关键诊断证据

### app 本身是好的
- `/Applications/FanBox.app` 确实存在，版本 `1.9.1`，`CFBundleName=FanBox`，代码签名正常（`com.huashu.fanbox`，arm64）。
- `/Applications/HuaRec Studio.app` 同样存在且能从启动台打开。
- 所以**不是打包损坏 / 装错位置**。

### 问题 A 的根因：Launch Services 重复注册冲突
`lsregister -dump` 显示 `com.huashu.fanbox` 这个 bundle id **同时注册在多个路径**：
- `/Applications/FanBox.app` ✅ 正确的
- `/Volumes/FanBox/FanBox.app` ← 之前挂载的 DMG（反复构建/安装留下的）
- `/Users/alchain/Documents/_开发项目/fanbox/dist/mac-arm64/FanBox.app` ← 打包产物

同一 bundle id 多路径注册 → 启动台去重时混乱 → 干脆不显示 FanBox。HuaRec 没有这种冲突，所以正常。

### 问题 B 的根因：Data 卷 Spotlight 索引卡在错误状态
- `mdutil -as` 显示：
  - `/` → `Indexing enabled`
  - `/System/Volumes/Preboot` → `Indexing enabled`
  - **`/System/Volumes/Data` → `Error: unknown indexing state` / `invalid operation`**
- 用户的 `/Applications`、家目录等文件物理上都在 **Data 卷**上（`/Applications` 是 firmlink 到 `/System/Volumes/Data/Applications`）。
- 所以 Data 卷索引一卡死，**这之后装的任何 app/文件都进不了索引**，搜不到。
- `mdls /Applications/FanBox.app` 返回 `could not find` —— 证实该 app 没进索引。
- `/System/Volumes/Data/.Spotlight-V100` 目录存在（owner `root:_mds_stores`），外层目录 mtime 是 `2024-11-11`（注：目录 mtime 不代表索引一直坏着，不能据此断定是旧问题）。
- **没有** `.metadata_never_index` 标记文件 → 不是谁故意关的索引。

---

## 三、责任判定：**不是 app / 安装包的锅**（有证据）

用户合理质疑：前两天反复构建测试时都正常，问题是今/昨天才出现，担心是安装包导致。

排查结论：**app 代码只「读」Spotlight，不「写/改」**，安装方式也不碰索引配置。

- `server.js:345` 注释明确：「Spotlight（mdfind）内容搜索：白嫖系统索引」——只调 `mdfind` **查询**索引，给文件搜索功能用。
- `electron/main.js:395` 只是提到 Spotlight 会扫文件。
- 全项目（排除 vendor）搜 `mdutil` / `metadata_never_index` / `.Spotlight-V100` 的**唯一命中**是 `.claude/settings.local.json`——那是**本次调试**我跑命令被记进的权限白名单，不是 app 代码。
- `mdfind` 是纯只读查询命令，**不可能**关闭 / 损坏 / 重置索引。

**最可能的真实诱因**：前两天高强度反复构建（electron-builder 反复生成/删除 `node_modules`、`dist` 里 110MB DMG、签名、跑 app）制造海量文件变动（fsevents churn），`mds_stores` 索引进程在高强度抖动下卡进错误状态 → `unknown`。属构建活动副作用，非安装包植入。
- 查 2 天内 `mds`/`mds_stores`/`mdbulkimport` 崩溃日志为空，佐证不是被某条命令搞挂，而是状态卡住。

---

## 四、已尝试的思路（按时间）

| # | 尝试 | 结果 |
|---|------|------|
| 1 | `mdimport /Applications/FanBox.app` 单独强制索引 | ❌ 无效，仍 `could not find` |
| 2 | `sudo mdutil -i on/-E /System/Volumes/Data` | ❌ `-405 unable to perform operation` / `invalid operation`，命令行对 Data 卷使不上劲 |
| 3 | `sudo rm -rf /System/Volumes/Data/.Spotlight-V100` | ❌ `Operation not permitted`（终端缺「完全磁盘访问权限」，TCC 拦截） |
| 4 | `sudo mdutil -E /`（对已恢复的 `/` 强制重建） | ⚠️ 命令接受（回 `Indexing enabled`），但 Data 仍 `unknown`，实际没生效 |
| 5 | 系统设置 → Spotlight 隐私：加「Data」卷再移除（强制重置） | ❌ Data 仍 `unknown`，没推动 |
| 6 | **问题 A 修复**：退 DMG + `lsregister -u` 注销 dist 产物 + `lsregister -f` 重新注册 `/Applications` 两个 app + `killall Dock` | ✅ **成功**，FanBox 重新出现在启动台 |

> 注：sudo 命令必须在**真正的「终端」App** 里手动跑——Claude Code 的 `!` 前缀和工具调用都没有 TTY，`sudo` 无法读取密码。

---

## 五、当前正在做的方案（问题 B，待执行/验证）

最终采用「**删掉坏索引目录 + 重启重建**」，需要先给终端授权：

1. **给终端开权限**：系统设置 → 隐私与安全性 → 完全磁盘访问权限 → 加入「终端」并打开 → **⌘Q 完全退出终端再重开**。
2. **删坏索引**（重开的终端里）：
   ```
   sudo rm -rf /System/Volumes/Data/.Spotlight-V100
   ```
   （有了完全磁盘访问权限后应不再报 `Operation not permitted`）
3. **确保索引开关开着**：
   ```
   sudo mdutil -a -i on
   ```
4. **重启 Mac**。开机后 `mds` 发现索引库没了 → 自动从零重建（10～30 分钟，菜单栏 🔍 显示进度）。
5. **验证**：重建完成后
   ```
   mdfind "kMDItemFSName == 'FanBox.app'"
   mdfind "kMDItemFSName == 'HuaRec Studio.app'"
   mdutil -as          # Data 应变回 Indexing enabled
   ```

### 如果上述仍无效的兜底思路
- 检查系统设置 → Spotlight 隐私列表是否残留排除项，全部移除。
- 安全模式（开机按住电源键）下重建索引。
- 极端情况：`sudo mdutil -X /`（抹掉整盘索引重建，更彻底但更慢）。

---

## 六、给两个产品的长期建议（防复发 + 体验）

1. **构建产物别留在会被索引/注册的位置混淆系统**：`dist/` 已被 Launch Services 登记过，发版后及时清理旧 `dist/mac-arm64/*.app`，或 `.gitignore` 之外也定期手动清。
2. **装新版前先退掉旧 DMG**：`hdiutil detach /Volumes/FanBox`，避免 `/Volumes/...` 与 `/Applications` 同 bundle id 重复注册。
3. **覆盖安装后如果启动台/搜索异常**，标准复位三连（无需 sudo）：
   ```
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/FanBox.app
   killall Dock
   mdimport /Applications/FanBox.app
   ```
4. FanBox 的文件搜索**依赖系统 Spotlight 索引**（`mdfind`）。提醒：当用户机器索引坏掉时，FanBox 的 Spotlight 搜索会失效而只剩 grep 兜底——可考虑在搜索无结果时给一句「系统 Spotlight 索引可能异常」的提示，引导用户。
