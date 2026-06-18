#!/usr/bin/env node
/**
 * App 启动包装脚本（Windows 兼容）
 *
 * Claude Code 的 shell 环境设置了 ELECTRON_RUN_AS_NODE=1，该变量被
 * electron/cli.js → spawn(electron.exe) 继承到 electron.exe 进程，
 * 导致 electron.exe 以 Node.js 模式而非 GUI 模式启动。
 *
 * 后果：require('electron') 返回路径字符串而非模块对象 →
 *       app 为 undefined → app.whenReady() 报 TypeError。
 *
 * 此脚本在 electron/cli.js 执行 spawn() 前删除该变量，
 * 确保 electron.exe 以正常 GUI 模式启动。
 *
 * 不影响 Claude Code 或其他依赖此变量的内部行为，
 * 因为我们仅在 spawn 子进程前删除，不改变当前 Shell 环境。
 */
delete process.env.ELECTRON_RUN_AS_NODE;

// Forward to Electron CLI — spawn(electron.exe, ...) 继承已清理的 env
require('../node_modules/electron/cli.js');
