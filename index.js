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
 * @property {string} [loginLabel] - 登录按钮文字，默认「去登录 <域名>」
 * @property {boolean} [autoOpenLogin] - 401 时自动打开登录页，默认 false
 */

"use strict";
/**
 * GM.xmlHttpRequest 的 Promise 封装，并对 401 提供可配置回调。
 *
 * `GM.xmlHttpRequest` / `GM_xmlhttpRequest` 为 callback 风格（onload/onerror），
 * 前台脚本与 ScriptCat 后台/定时脚本均一致（后台脚本无 DOM，但 GM API 相同），
 * 故本封装统一将 callback 包成 Promise，无需按环境分流。
 *
 * 401 处理策略（由调用方配置，不写死业务逻辑）：
 *   - 命中 401 时调用 `onUnauthorized(response, retry)`；
 *   - 回调可返回 GM.XhrDetails 的部分字段用于重试（例如刷新 token 后重发），
 *     返回 false / void 则 reject 一个 UnauthorizedError。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与 logger.ts、index.ts 中的
 * 同名 namespace 自动合并（全局 script，由 outFile 拼接）。
 * `logger` 来自 logger.ts，合并后直接以裸名引用。
 * 请求/响应类型用 `GM.XhrDetails` / `GM.XhrResponse`（重导出自
 * @toil/gm-types，见 src/types/scriptcat.d.ts）。
 */
var USL;
(function (USL) {
    /** 401 专用错误类型，便于调用方 catch 区分 */
    class UnauthorizedError extends Error {
        constructor(response) {
            super(`Request unauthorized (401): ${(response === null || response === void 0 ? void 0 : response.finalUrl) || "(unknown url)"}`);
            this.name = "UnauthorizedError";
            this.response = response;
        }
    }
    USL.UnauthorizedError = UnauthorizedError;
    /** 底层执行一次 xmlHttpRequest，返回 Promise。
     *  ScriptCat 后台脚本与前台一致，均为 callback 风格（onload/onerror），
     *  返回 AbortHandle 而非 Promise，故统一在此包成 Promise。
     *  导出供 loginFlow.ts 等做探测请求复用（不走 gmRequest 的 401 重试逻辑）。 */
    function rawXhr(details) {
        const g = typeof globalThis !== "undefined" ? globalThis : {};
        const fn = typeof g.GM_xmlhttpRequest === "function"
            ? g.GM_xmlhttpRequest
            : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
                ? GM.xmlHttpRequest
                : undefined;
        if (!fn) {
            return Promise.reject(new Error("No GM xmlHttpRequest implementation available in this runtime"));
        }
        return new Promise((resolve, reject) => {
            try {
                fn({
                    ...details,
                    onload: (resp) => resolve(resp),
                    onerror: (err) => {
                        // Tampermonkey onerror 透传 response 对象（含可选 error 字段）；
                        // 其它实现可能传 Error。统一取 message/error。
                        const msg = (err === null || err === void 0 ? void 0 : err.error) ||
                            (err === null || err === void 0 ? void 0 : err.message) ||
                            "network error";
                        reject(new Error(`GM xmlHttpRequest error: ${msg}`));
                    },
                    ontimeout: () => reject(new Error("GM xmlHttpRequest timeout")),
                });
            }
            catch (e) {
                reject(e);
            }
        });
    }
    USL.rawXhr = rawXhr;
    /**
     * 发起 GM 请求，返回 Promise<GM.XhrResponse>。401 时按 onUnauthorized 处理。
     *
     * @param {USLGmRequestOptions} options - 请求配置（含 url/method/headers/timeout/onUnauthorized/maxRetry）
     * @returns {Promise<GMTypes.XHRResponse>} 响应对象
     * @example
     * const resp = await USL.gmRequest({
     *   method: "GET",
     *   url: "https://api.example.com/me",
     *   headers: { Authorization: `Bearer ${token}` },
     *   timeout: 10000,
     *   onUnauthorized: async () => {
     *     const token = await refreshToken();
     *     return { headers: { Authorization: `Bearer ${token}` } };
     *   },
     *   maxRetry: 2,
     * });
     */
    async function gmRequest(options) {
        // 剥离库控制字段，仅把 GM.XhrDetails 部分交给底层
        const { onUnauthorized, maxRetry: maxRetryOpt, ...xhrDetails } = options;
        const maxRetry = maxRetryOpt !== null && maxRetryOpt !== void 0 ? maxRetryOpt : 1;
        let attempt = 0;
        const mergedDetails = xhrDetails;
        const retry = async (next) => rawXhr(next);
        while (true) {
            const resp = await rawXhr(mergedDetails);
            if (resp.status !== 401) {
                return resp;
            }
            USL.logger.warn(`gmRequest 401 on ${mergedDetails.method || "GET"} ${mergedDetails.url}`);
            if (!onUnauthorized || attempt >= maxRetry) {
                throw new UnauthorizedError(resp);
            }
            attempt += 1;
            let decision;
            try {
                decision = await onUnauthorized(resp, retry);
            }
            catch (e) {
                throw e;
            }
            if (decision === false || decision == null) {
                throw new UnauthorizedError(resp);
            }
            Object.assign(mergedDetails, decision);
        }
    }
    USL.gmRequest = gmRequest;
    /**
     * 发起 GM 请求并将 responseText 按 JSON 解析返回。
     * @template T - 期望的响应数据类型
     * @param {USLGmRequestOptions} options - 请求配置
     * @returns {Promise<T>} 解析后的 JSON 数据
     */
    async function gmRequestJson(options) {
        const resp = await gmRequest(options);
        try {
            return JSON.parse(resp.responseText);
        }
        catch (e) {
            throw new Error(`gmRequestJson: failed to parse response as JSON: ${e.message}`);
        }
    }
    USL.gmRequestJson = gmRequestJson;
})(USL || (USL = {}));
/**
 * 跨管理器日志工具。
 *
 * - ScriptCat（含后台/定时脚本）：走 `GM.log` / `GM_log` 写入日志面板。
 *   后台脚本无 DOM/console 可靠输出，必须走 GM 日志入口，否则日志丢失。
 * - 其他管理器（Tampermonkey/Violentmonkey 等）：使用 `console.*`。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与 gmRequest.ts、index.ts 中的
 * 同名 namespace 自动合并（全局 script，由 outFile 拼接）。
 */
var USL;
(function (USL) {
    /** 是否运行在 ScriptCat 环境下 */
    function isScriptCat() {
        try {
            return (typeof GM_info !== "undefined" &&
                ((GM_info === null || GM_info === void 0 ? void 0 : GM_info.scriptHandler) === "ScriptCat"));
        }
        catch {
            return false;
        }
    }
    USL.isScriptCat = isScriptCat;
    const LEVEL_PREFIX = {
        debug: "DEBUG",
        info: "INFO",
        warn: "WARN",
        error: "ERROR",
    };
    function emit(level, prefix, args) {
        const tag = `[${LEVEL_PREFIX[level]}]${prefix ? " " + prefix : ""}`;
        const payload = [tag, ...args];
        if (isScriptCat()) {
            // ScriptCat（含后台/定时脚本）走 GM.log / GM_log 写入日志面板。
            // 后台脚本无 DOM/console 可靠输出，必须走 GM 日志入口。
            const gm = typeof GM !== "undefined" ? GM : undefined;
            if (typeof (gm === null || gm === void 0 ? void 0 : gm.log) === "function") {
                gm.log(...payload);
                return;
            }
            const g = typeof globalThis !== "undefined" ? globalThis : {};
            if (typeof g.GM_log === "function") {
                g.GM_log(...payload);
                return;
            }
        }
        const fn = level === "error"
            ? console.error
            : level === "warn"
                ? console.warn
                : level === "debug"
                    ? console.debug
                    : console.log;
        fn(...payload);
    }
    function createLogger(prefix) {
        return {
            debug: (...a) => emit("debug", prefix, a),
            info: (...a) => emit("info", prefix, a),
            warn: (...a) => emit("warn", prefix, a),
            error: (...a) => emit("error", prefix, a),
            tag: (t) => createLogger(prefix ? `${prefix}:${t}` : t),
        };
    }
    /** 默认 logger，无前缀。
     * @type {USLLogger} */
    USL.logger = createLogger("");
})(USL || (USL = {}));
/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/**
 * ScriptCat 后台/定时脚本专用：401 时引导用户登录后继续后续流程的请求封装。
 *
 * 流程：
 *   1. 发原始请求；非 401 直接返回。
 *   2. 401 → GM.notification 展示「去登录」，用户点击通知 → GM_openInTab 打开登录页。
 *   3. 并行两路等待登录成功（先到即继续，互斥清理）：
 *        路 A：GM_addValueChangeListener(loginSignalKey) 监听到前台脚本
 *              登录成功后 GM_setValue(key, true) 写入的标记。
 *        路 B：轮询重试探测（默认每 10s），发 probeRequest ?? 原始请求，
 *              status !== 401 即视为已登录。兜底——未安装前台脚本时靠它。
 *   4. 任一路成功 → 重试原请求 → resolve 给调用方。
 *   5. loginTimeout（默认 5min）内未成功 → reject LoginTimeoutError。
 *
 * 探测请求走底层 rawXhr（不走 gmRequest 的 401 重试逻辑，避免嵌套触发登录流程）。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与 gmRequest.ts/logger.ts/index.ts
 * 中的同名 namespace 自动合并（全局 script，由 outFile 拼接）。
 */
var USL;
(function (USL) {
    /** 登录超时专用错误类型 */
    class LoginTimeoutError extends Error {
        constructor(timeoutMs) {
            super(`Login flow timed out after ${timeoutMs}ms`);
            this.name = "LoginTimeoutError";
        }
    }
    USL.LoginTimeoutError = LoginTimeoutError;
    // ---- GM API 适配器：双探 GM_* 全局函数形式 / GM.* 命名空间形式 ----
    // 与 logger/gmRequest 一致：用户 grant 任一形式都能找到可用实现。
    // 注意 GM.* 形式为 Promise 风格，GM_* 为同步；适配器统一封装差异。
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    const gmObj = typeof GM !== "undefined" ? GM : undefined;
    /** 取可用的 notification 调用器（返回 void/Promise，fire-and-forget） */
    function pickNotification() {
        if (typeof g.GM_notification === "function")
            return g.GM_notification;
        if (gmObj && typeof gmObj.notification === "function") {
            return (d) => gmObj.notification(d);
        }
        return undefined;
    }
    /** 取可用的 openInTab 调用器（返回 Tab/Promise<Tab>，fire-and-forget） */
    function pickOpenInTab() {
        if (typeof g.GM_openInTab === "function")
            return g.GM_openInTab;
        if (gmObj && typeof gmObj.openInTab === "function") {
            return (url, opts) => gmObj.openInTab(url, opts);
        }
        return undefined;
    }
    /** 取可用的 addValueChangeListener 调用器（同步返回 number 或 Promise<number>） */
    function pickAddValueChangeListener() {
        if (typeof g.GM_addValueChangeListener === "function")
            return g.GM_addValueChangeListener;
        if (gmObj && typeof gmObj.addValueChangeListener === "function") {
            return (name, listener) => gmObj.addValueChangeListener(name, listener);
        }
        return undefined;
    }
    /** 取可用的 removeValueChangeListener 调用器 */
    function pickRemoveValueChangeListener() {
        if (typeof g.GM_removeValueChangeListener === "function")
            return g.GM_removeValueChangeListener;
        if (gmObj && typeof gmObj.removeValueChangeListener === "function") {
            return (id) => gmObj.removeValueChangeListener(id);
        }
        return undefined;
    }
    /** 检测 Firefox：Firefox 的 GM_notification 不支持 buttons、不可靠触发
     *  onclick/打开 url，故 Firefox 下需直接 openTab 而非依赖点击通知。 */
    function isFirefox() {
        try {
            return typeof navigator !== "undefined" &&
                /Firefox/i.test(navigator.userAgent);
        }
        catch {
            return false;
        }
    }
    /** 通知用户去登录：弹 GM_notification，点击通知打开登录页。
     *  Firefox 下直接 openTab（不依赖点击），通知仅作提示。 */
    function notifyLogin(options) {
        var _a, _b, _c;
        // 从 loginUrl 提取域名，让用户看到去登录哪个网站
        let domain = options.loginUrl;
        try {
            domain = new URL(options.loginUrl).hostname;
        }
        catch { }
        const label = (_a = options.loginLabel) !== null && _a !== void 0 ? _a : `去登录`;
        const ff = isFirefox();
        // text 默认带域名：Firefox 不支持 buttons 看不到按钮，且直接 openTab，
        // 文案改为「已打开登录页」；非 Firefox 为「请重新登录」
        const text = (_b = options.notificationText) !== null && _b !== void 0 ? _b : (ff
            ? `会话已过期，已为你打开登录页（${domain}）`
            : `会话已过期，请重新登录（${domain}）`);
        let title = options.notificationTitle;
        if (!title) {
            try {
                title = ((_c = GM_info === null || GM_info === void 0 ? void 0 : GM_info.script) === null || _c === void 0 ? void 0 : _c.name) || "登录";
            }
            catch {
                title = "登录";
            }
        }
        const openTab = pickOpenInTab();
        let opened = false; // 防 url 自动打开 + onclick 重复打开
        const open = () => {
            if (opened)
                return;
            opened = true;
            if (!openTab) {
                USL.logger.error("GM_openInTab unavailable (grant GM_openInTab or GM.openInTab)");
                return;
            }
            try {
                openTab(options.loginUrl, { active: true });
            }
            catch (e) {
                USL.logger.error("GM_openInTab failed", e);
            }
        };
        // Firefox：GM_notification 不可靠触发点击跳转，直接打开登录页
        // 非 Firefox：autoOpenLogin 或点通知时打开
        if (ff || options.autoOpenLogin)
            open();
        const notify = pickNotification();
        if (!notify) {
            // notification 不可用，直接打开登录页
            USL.logger.warn("GM_notification unavailable, opening login directly");
            open();
            return;
        }
        try {
            // 双保险打开登录页：
            // - url: 管理器原生「点通知打开关联 url」，Firefox 也可靠（不依赖 onclick 回调）
            // - onclick: Chrome/SC 桌面点通知/按钮时回调，手动 open 兜底
            // - buttons: Chrome 显示「去登录 <域名>」按钮；Firefox 自动忽略
            // opened 标记防止 url 与 onclick 重复打开两个标签页
            notify({
                text,
                title,
                url: options.loginUrl,
                onclick: (event) => {
                    // 点通知本体(event.event==="click")或按钮(isButtonClick)都打开
                    if (!event || event.event === "click" || event.isButtonClick) {
                        open();
                    }
                },
                buttons: [{ title: label }],
            });
        }
        catch (e) {
            USL.logger.warn("GM_notification failed, opening login directly", e);
            open();
        }
    }
    /** 登录超时时弹 notification 提醒用户 */
    function notifyTimeout(options) {
        var _a, _b;
        const notify = pickNotification();
        if (!notify)
            return;
        let domain = options.loginUrl;
        try {
            domain = new URL(options.loginUrl).hostname;
        }
        catch { }
        let title = "登录超时";
        try {
            title = `${((_a = GM_info === null || GM_info === void 0 ? void 0 : GM_info.script) === null || _a === void 0 ? void 0 : _a.name) || "登录"} - 超时`;
        }
        catch { }
        try {
            notify({
                title,
                text: `${domain} 在 ${Math.round(((_b = options.loginTimeout) !== null && _b !== void 0 ? _b : 300000) / 1000)}s 内未完成登录，请重新触发任务`,
                // 超时通知不再带按钮，仅提示
            });
        }
        catch (e) {
            USL.logger.warn("notify timeout failed", e);
        }
    }
    /**
     * 等待登录成功：valueChange 监听 + 轮询探测并行，先到即解除。
     * 返回的 Promise resolve 后所有监听/定时器已清理。
     * @param options 登录流程配置
     * @param fallbackProbe 探测请求退化值（原始请求的 XhrDetails）
     */
    function waitForLogin(options, fallbackProbe) {
        var _a, _b, _c;
        const pollInterval = (_a = options.pollInterval) !== null && _a !== void 0 ? _a : 10000;
        const timeout = (_b = options.loginTimeout) !== null && _b !== void 0 ? _b : 300000;
        const probeDetails = (_c = options.probeRequest) !== null && _c !== void 0 ? _c : fallbackProbe;
        return new Promise((resolve, reject) => {
            let done = false;
            let pollTimer;
            let timeoutTimer;
            // listenerId 可能同步拿到(number)或异步(Promise<number>，GM.* 风格)
            let listenerId;
            let listenerIdPromise;
            let listenerRegistered = false;
            const removeListener = () => {
                if (listenerId !== undefined) {
                    // 同步形式已拿到 id
                    const rm = pickRemoveValueChangeListener();
                    if (rm) {
                        try {
                            rm(listenerId);
                        }
                        catch { }
                    }
                }
                else if (listenerIdPromise) {
                    // Promise 形式：id 还没 resolve，等拿到再 remove
                    listenerIdPromise.then((id) => {
                        const rm = pickRemoveValueChangeListener();
                        if (rm) {
                            try {
                                rm(id);
                            }
                            catch { }
                        }
                    });
                }
            };
            const cleanup = () => {
                if (pollTimer)
                    clearInterval(pollTimer);
                if (timeoutTimer)
                    clearTimeout(timeoutTimer);
                if (listenerRegistered)
                    removeListener();
            };
            const finish = (ok, err) => {
                if (done)
                    return;
                done = true;
                cleanup();
                if (ok) {
                    resolve();
                }
                else {
                    // 超时提醒：弹 notification 告知登录超时
                    notifyTimeout(options);
                    reject(err !== null && err !== void 0 ? err : new LoginTimeoutError(timeout));
                }
            };
            // 路 A：监听前台脚本 setValue 写入真值（双探 GM_* / GM.*）
            const addListener = pickAddValueChangeListener();
            if (addListener) {
                try {
                    const result = addListener(options.loginSignalKey, (_name, _oldV, newV, _remote) => {
                        if (newV)
                            finish(true);
                    });
                    if (typeof result === "number") {
                        listenerId = result;
                        listenerRegistered = true;
                    }
                    else if (result && typeof result.then === "function") {
                        listenerIdPromise = result;
                        listenerRegistered = true;
                        // 若等待 id 期间已 finish，拿到后立即 remove（cleanup 里的 .then 会处理）
                    }
                }
                catch (e) {
                    USL.logger.warn("GM_addValueChangeListener failed, rely on polling only", e);
                }
            }
            else {
                USL.logger.warn("GM_addValueChangeListener unavailable, rely on polling only");
            }
            // 路 B：轮询探测
            const poll = async () => {
                try {
                    const resp = await USL.rawXhr(probeDetails);
                    if (resp.status !== 401) {
                        finish(true);
                    }
                }
                catch (e) {
                    // 探测请求本身出错（网络等），不致命，继续轮询
                    USL.logger.debug("login probe error (will retry)", e);
                }
            };
            // 立即探测一次，再按间隔轮询
            poll();
            pollTimer = setInterval(poll, pollInterval);
            // 超时
            timeoutTimer = setTimeout(() => finish(false), timeout);
        });
    }
    /**
     * 带登录引导的请求：401 时弹通知引导用户登录，登录成功后重试原请求。
     * ScriptCat 后台/定时脚本专用（前台也可用）。登录成功检测：前台脚本
     * GM_setValue(loginSignalKey, true) 触发监听 + 轮询探测，任一即解除。
     * 超时抛 LoginTimeoutError。
     *
     * @param {USLLoginFlowOptions} options - 请求配置（含 url/method + 登录流程字段）
     * @returns {Promise<GMTypes.XHRResponse>} 登录后重试成功的响应
     * @throws {USL.LoginTimeoutError} loginTimeout 内未登录成功
     * @example
     * const resp = await USL.gmRequestWithLogin({
     *   method: "GET",
     *   url: "https://api.example.com/me",
     *   loginUrl: "https://example.com/login",
     *   loginSignalKey: "myapp:logged-in",
     *   probeRequest: { method: "GET", url: "https://api.example.com/ping" },
     * });
     */
    async function gmRequestWithLogin(options) {
        // 剥离库控制字段（与 gmRequest 一致），先发原始请求探测是否 401。
        // 显式标注为 GM.XhrDetails：跨文件 namespace 内 interface 继承链对
        // GM.XhrDetails 字段在某些 TS 解析路径下会退化，此处用类型断言锁定。
        const { onUnauthorized, maxRetry, ...rest } = options;
        const xhrDetails = rest;
        let resp;
        try {
            resp = await USL.rawXhr(xhrDetails);
        }
        catch (e) {
            throw e;
        }
        if (resp.status !== 401) {
            return resp;
        }
        // 401：引导登录
        USL.logger.warn(`gmRequestWithLogin 401 on ${xhrDetails.method || "GET"} ${xhrDetails.url}, guiding login`);
        notifyLogin(options);
        // 等待登录成功（valueChange + 轮询），超时抛 LoginTimeoutError
        await waitForLogin(options, xhrDetails);
        // 登录成功后重试原请求
        return USL.rawXhr(xhrDetails);
    }
    USL.gmRequestWithLogin = gmRequestWithLogin;
})(USL || (USL = {}));
/// <reference path="./types/scriptcat.d.ts" />
/**
 * userscript-libs 公共入口
 *
 * 编译后通过 @require 引入；所有功能挂在全局命名空间 `USL` 上：
 *
 *   // @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.3/index.js
 *   const { gmRequest, gmRequestWithLogin, logger, UnauthorizedError } = USL;
 *   const resp = await gmRequest({ method: "GET", url: "..." });
 *   logger.info("done", resp.status);
 *
 * 在 ScriptCat 后台/定时脚本中同样可用（GM API 与前台一致，无 DOM）。
 *
 * 结构：logger.ts / gmRequest.ts / loginFlow.ts 各以 `namespace USL` 贡献成员，
 * 均为全局 script，由 outFile 拼接合并。
 */
/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/// <reference path="./loginFlow.ts" />
// ============================= 全局挂载 =============================
//
// module:none 下 `namespace USL` 编译为顶层 `var USL`，但 @require 引入时
// 管理器可能把库代码包进闭包，导致 `USL` 不暴露到用户脚本作用域。
// 故显式挂到所有可用的全局对象，让用户脚本从任一处都能访问：
//   USL / unsafeWindow.USL / window.USL / globalThis.USL / self.USL
//
// 关键：挂到「所有」而非「第一个」，因为 @require 拼接的脚本作用域
// 与 unsafeWindow / globalThis 在沙箱里可能是不同对象，只挂一处会漏。
(function attachGlobal() {
    const targets = [];
    try {
        // @ts-ignore unsafeWindow 仅油猴环境存在，grant 后可用
        if (typeof unsafeWindow !== "undefined")
            targets.push(unsafeWindow);
    }
    catch { }
    try {
        if (typeof globalThis !== "undefined")
            targets.push(globalThis);
    }
    catch { }
    try {
        // @ts-ignore self 在 worker/后台可用
        if (typeof self !== "undefined")
            targets.push(self);
    }
    catch { }
    try {
        // @ts-ignore window 前台脚本可用
        if (typeof window !== "undefined")
            targets.push(window);
    }
    catch { }
    try {
        // @ts-ignore 非 strict 模式下的 this 也可作为全局回退
        if (this)
            targets.push(this);
    }
    catch { }
    for (const t of targets) {
        try {
            if (t && !t.USL)
                t.USL = USL;
        }
        catch {
            /* 某些全局对象可能只读或抛错，忽略单个失败 */
        }
    }
})();
//# sourceMappingURL=index.js.map