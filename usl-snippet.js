// ============================================================
// userscript-libs (USL) 类型声明块 —— 粘贴到用户脚本顶部
// 用途：让 ScriptCat 编辑器对 USL.xxx 既弹成员名、又弹参数字段提示，
//       并消除 'USL' is not defined 报错。
// 原理：@require 注入的库函数 JSDoc 不被 ScriptCat(monaco) 跨文件解析，
//       故在用户脚本内重建 USL 对象（真实函数 + @param JSDoc），转调真实库。
// 对齐版本：linch90/userscript-libs@v0.1.3
// 用法：粘贴到 // ==/UserScript== 之后、业务代码之前。
// ============================================================

/** @typedef {Object} USLGmRequestOptions
 * @property {string} url - 请求 URL
 * @property {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"} method - HTTP 方法
 * @property {Record<string, unknown>} [headers] - 请求头
 * @property {*} [data] - 请求体
 * @property {number} [timeout] - 超时 ms
 * @property {(response: GMTypes.XHRResponse) => (Partial<GMTypes.XHRDetails>|false|void|Promise<Partial<GMTypes.XHRDetails>|false|void>)} [onUnauthorized] - 401 回调：返回部分字段重试 / false 抛 UnauthorizedError
 * @property {number} [maxRetry] - 401 最大重试次数，默认 1
 */

/** @typedef {Object} USLLogger
 * @property {(...args: unknown[]) => void} debug
 * @property {(...args: unknown[]) => void} info
 * @property {(...args: unknown[]) => void} warn
 * @property {(...args: unknown[]) => void} error
 * @property {(tag: string) => USLLogger} tag - 创建带前缀的子 logger
 */

/** @typedef {Object} USLLoginFlowOptions
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
 * @property {string} [notificationText] - 通知文案，默认「点击去登录」
 * @property {string} [notificationTitle] - 通知标题
 * @property {boolean} [autoOpenLogin] - 401 时自动打开登录页，默认 false
 */

// 运行时真实 USL（由 @require 的 index.js 注入）
const _USL = (typeof globalThis !== "undefined" ? globalThis : unsafeWindow).USL;

const USL = {
  /**
   * 发起 GM 请求，返回 Promise<GMTypes.XHRResponse>。401 时按 onUnauthorized 处理。
   * @param {USLGmRequestOptions} options - 请求配置
   * @returns {Promise<GMTypes.XHRResponse>}
   */
  gmRequest(options) { return _USL.gmRequest(options); },

  /**
   * 发起 GM 请求并将 responseText 按 JSON 解析。
   * @param {USLGmRequestOptions} options - 请求配置
   * @returns {Promise<any>} 解析后的 JSON 数据
   */
  gmRequestJson(options) { return _USL.gmRequestJson(options); },

  /**
   * 底层 xhr（不走 401 重试逻辑）。
   * @param {GMTypes.XHRDetails} details
   * @returns {Promise<GMTypes.XHRResponse>}
   */
  rawXhr(details) { return _USL.rawXhr(details); },

  /**
   * 401 引导登录后继续流程（ScriptCat 后台/定时脚本专用，前台也可用）。
   * 登录成功检测：前台 GM_setValue(loginSignalKey,true) 触发监听 + 轮询探测。
   * 超时抛 LoginTimeoutError。
   * @param {USLLoginFlowOptions} options - 请求配置（含登录流程字段）
   * @returns {Promise<GMTypes.XHRResponse>}
   */
  gmRequestWithLogin(options) { return _USL.gmRequestWithLogin(options); },

  /** @type {USLLogger} */
  logger: _USL && _USL.logger,

  /** 是否运行在 ScriptCat 环境 @returns {boolean} */
  isScriptCat() { return _USL.isScriptCat(); },

  /** @type {Function} 401 专用错误类 */
  UnauthorizedError: _USL && _USL.UnauthorizedError,
  /** @type {Function} 登录超时错误类 */
  LoginTimeoutError: _USL && _USL.LoginTimeoutError,
};
