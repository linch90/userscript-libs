/**
 * @fileoverview userscript-libs JSDoc 类型声明（供 ScriptCat 编辑器补全）。
 * 构建时由 scripts/prepend-typedef.mjs 将本文件内容前置到 dist/index.js，
 * 确保这些 @typedef 在所有函数 @param 引用之前，供 Monaco/ScriptCat 编辑器解析。
 */

/**
 * @typedef {Object} USLGmRequestOptions
 * @property {string} url - 请求 URL
 * @property {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"} method - HTTP 方法
 * @property {Record<string, unknown>} [headers] - 请求头
 * @property {*} [data] - 请求体
 * @property {number} [timeout] - 超时 ms
 * @property {(response: GMTypes.XHRResponse) => (Partial<GMTypes.XHRDetails>|false|void|Promise<Partial<GMTypes.XHRDetails>|false|void>)} [onUnauthorized] - 401 回调：返回部分字段重试 / false 抛 UnauthorizedError
 * @property {number} [maxRetry] - 401 最大重试次数，默认 1
 */

/**
 * @typedef {Object} USLLogger
 * @property {(...args: unknown[]) => void} debug
 * @property {(...args: unknown[]) => void} info
 * @property {(...args: unknown[]) => void} warn
 * @property {(...args: unknown[]) => void} error
 * @property {(tag: string) => USLLogger} tag - 创建带前缀的子 logger
 */

/**
 * @typedef {Object} USLLoginFlowOptions
 * @property {string} url - 请求 URL
 * @property {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"} method - HTTP 方法
 * @property {Record<string, unknown>} [headers] - 请求头
 * @property {*} [data] - 请求体
 * @property {number} [timeout] - 超时 ms
 * @property {string} loginUrl - 登录页 URL，点击通知后 GM_openInTab 打开
 * @property {string} loginSignalKey - 前台脚本登录成功后 GM_setValue 的 key
 * @property {GMTypes.XHRDetails} [probeRequest] - 专用探测请求；不传则用原始请求重试探测
 * @property {number} [pollInterval] - 轮询间隔 ms，默认 10000
 * @property {number} [loginTimeout] - 登录流程总超时 ms，默认 300000 (5min)
 * @property {string} [notificationText] - 通知文案，默认「会话已过期，请重新登录（<域名>）」
 * @property {string} [notificationTitle] - 通知标题
 * @property {string} [notificationImage] - 通知图标 URL，默认用 getFavicon(loginUrl 域名) 取 data URL（最多等 8s，超时不带图标）
 * @property {string} [loginLabel] - 登录按钮文字，默认「去登录」
 * @property {boolean} [autoOpenLogin] - 401 时自动打开登录页，默认 false
 * @property {(response: GMTypes.XHRResponse) => boolean} [isUnauthorized] - 判定响应是否需登录，默认仅 status===401；站点未登录返回别的形态（302→/login、200 登录页 HTML 等）时传此回调扩展，如 (r)=>r.status===401||(r.finalUrl||"").includes("/login")
 */

/**
 * @typedef {Object} USLFaviconDetail
 * @property {string} dataUrl - 图标 data URL（真实站标或默认 SVG）
 * @property {boolean} isReal - true=真实站标；false=降级生成的默认字母图标
 * @property {string} [sourceUrl] - 原图标远程 URL；notifyLogin 在 dataURL（jpeg/过大）不适合通知时退回此 URL
 */

/**
 * @typedef {Object} USLMessageApi
 * @property {(text: string, options?: {duration?: number}) => void} success
 * @property {(text: string, options?: {duration?: number}) => void} error
 * @property {(text: string, options?: {duration?: number}) => void} warning
 * @property {(text: string, options?: {duration?: number}) => void} info
 * @property {(text: string, type: "success"|"error"|"warning"|"info", options?: {duration?: number}) => void} show
 */

