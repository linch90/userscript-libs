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
     * 发起 GM 请求，返回 Promise<GM.XhrResponse>。
     *
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
    /** 取 responseText 并按 JSON 解析 */
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
    /** 默认 logger，无前缀 */
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
    /** 通知用户去登录：弹 GM_notification，点击后打开登录页 */
    function notifyLogin(options) {
        var _a, _b;
        const text = (_a = options.notificationText) !== null && _a !== void 0 ? _a : "点击去登录";
        let title = options.notificationTitle;
        if (!title) {
            try {
                title = ((_b = GM_info === null || GM_info === void 0 ? void 0 : GM_info.script) === null || _b === void 0 ? void 0 : _b.name) || "登录";
            }
            catch {
                title = "登录";
            }
        }
        const open = () => {
            try {
                GM_openInTab(options.loginUrl, { active: true });
            }
            catch (e) {
                USL.logger.error("GM_openInTab failed", e);
            }
        };
        if (options.autoOpenLogin)
            open();
        try {
            // 点击通知打开登录页
            GM_notification({ text, title, onclick: open });
        }
        catch (e) {
            // notification 不可用时退化为直接打开
            USL.logger.warn("GM_notification failed, opening login directly", e);
            open();
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
            let listenerId;
            const cleanup = () => {
                if (pollTimer)
                    clearInterval(pollTimer);
                if (timeoutTimer)
                    clearTimeout(timeoutTimer);
                if (listenerId !== undefined) {
                    try {
                        GM_removeValueChangeListener(listenerId);
                    }
                    catch { }
                }
            };
            const finish = (ok, err) => {
                if (done)
                    return;
                done = true;
                cleanup();
                if (ok)
                    resolve();
                else
                    reject(err !== null && err !== void 0 ? err : new LoginTimeoutError(timeout));
            };
            // 路 A：监听前台脚本 setValue 写入真值
            try {
                listenerId = GM_addValueChangeListener(options.loginSignalKey, (_name, _oldV, newV, _remote) => {
                    if (newV)
                        finish(true);
                });
            }
            catch (e) {
                USL.logger.warn("GM_addValueChangeListener unavailable, rely on polling only", e);
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
     *
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
 *   // @require https://your.cdn/userscript-libs/dist/index.js
 *   const { gmRequest, gmRequestWithLogin, logger, UnauthorizedError } = USL;
 *   const resp = await gmRequest({ method: "GET", url: "..." });
 *   logger.info("done", resp.status);
 *
 * 在 ScriptCat 后台/定时脚本中同样可用（GM API 与前台一致，无 DOM）。
 *
 * 结构：logger.ts / gmRequest.ts 各以 `namespace USL` 贡献成员，三个文件
 * 均为全局 script（无顶层 import/export），由 tsconfig include 收入同一
 * program 后 TypeScript 自动合并同名 namespace。module:none 下编译产物为
 * 挂载到全局的 IIFE，@require 友好。
 */
/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/// <reference path="./loginFlow.ts" />
// ============================= 全局挂载 =============================
//
// module:none 下 `namespace USL` 编译为全局 `var USL`，理论上已是全局；
// 但油猴脚本本体常被沙箱闭包包裹，需显式挂到 unsafeWindow 才能可靠访问。
// ScriptCat 后台脚本无 unsafeWindow，回退到 globalThis/self。
(function attachGlobal() {
    try {
        let root = undefined;
        try {
            // @ts-ignore unsafeWindow 仅油猴环境存在
            if (typeof unsafeWindow !== "undefined")
                root = unsafeWindow;
        }
        catch { }
        if (!root) {
            try {
                if (typeof globalThis !== "undefined")
                    root = globalThis;
            }
            catch { }
        }
        if (!root) {
            try {
                // @ts-ignore self 在 worker/WebWorker 后台可用
                if (typeof self !== "undefined")
                    root = self;
            }
            catch { }
        }
        if (!root) {
            // @ts-ignore 非 strict 模式回退
            root = this;
        }
        if (root)
            root.USL = USL;
    }
    catch {
        /* 挂载失败时忽略，namespace 本身仍可能作为全局可见 */
    }
})();
//# sourceMappingURL=index.js.map