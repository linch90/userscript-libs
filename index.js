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
 */

/**
 * @typedef {Object} USLMessageApi
 * @property {(text: string, options?: {duration?: number}) => void} success
 * @property {(text: string, options?: {duration?: number}) => void} error
 * @property {(text: string, options?: {duration?: number}) => void} warning
 * @property {(text: string, options?: {duration?: number}) => void} info
 * @property {(text: string, type: "success"|"error"|"warning"|"info", options?: {duration?: number}) => void} show
 */


"use strict";
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
/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/**
 * 站点 favicon 获取工具（前台 / ScriptCat 后台脚本均可）。
 *
 * 双策略获取，逐级降级，全程带 GM 存储缓存（命中真站标才写缓存，30 天有效）：
 *   1. 策略一（快速）：直接请求根目录 `https://<domain>/favicon.ico`，
 *      状态 200 且体积 > 100B 视为有效（过滤 404 占位页/极小无效图），
 *      用 FileReader 将 blob 转 data URL。
 *   2. 策略二（较慢但更准）：读 HTML 前 16KB，按优先级解析 link 声明：
 *        apple-touch-icon(-precomposed) > icon > shortcut icon，
 *      拿到 href 后转 data URL。读取用 onprogress 提前 abort，避免拉整页。
 *   3. 全部失败：生成基于域名首字母的默认 SVG 图标（isReal=false，不落缓存）。
 *
 * 环境兼容：策略一/二走 GM_xmlhttpRequest（前后台一致）。转 data URL 用
 *   FileReader + DOMParser；后台脚本若这两者不可用，策略一/二失败后降级到
 *   默认字母图，但**不缓存**，下次仍会重试真站标。
 * 关键：失败结果（isReal=false）绝不缓存——避免一次网络抖动把默认字母图
 *   锁 30 天，导致调用方（如 notifyLogin 只要真图标）长期取不到站标。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与其它源文件同名 namespace 自动合并
 * （全局 script，由 outFile 拼接）。`logger` 来自 logger.ts。
 */
var USL;
(function (USL) {
    // ---- GM_xmlhttpRequest 适配：双探全局函数形式 / GM.* 命名空间形式 ----
    // 与 gmRequest.rawXhr 一致，用户 grant 任一形式都能找到可用实现。
    // xmlHttpRequest 在 Tampermonkey / ScriptCat 均为 callback 风格（返回 handle），
    // 故统一在此包成 Promise。本模块需要 responseType(blob/text) 与 onprogress，
    // 不能直接复用 rawXhr（后者不支持 onprogress 提前 abort、且 response 类型固定为 text）。
    function pickXhr() {
        const g = typeof globalThis !== "undefined" ? globalThis : {};
        if (typeof g.GM_xmlhttpRequest === "function")
            return g.GM_xmlhttpRequest;
        const gmObj = typeof GM !== "undefined" ? GM : undefined;
        if (gmObj && typeof gmObj.xmlHttpRequest === "function") {
            return (d) => gmObj.xmlHttpRequest(d);
        }
        return undefined;
    }
    /** GM 存储适配：双探 GM_getValue/GM_setValue 同步形式与 GM.setValue Promise 形式。
     *  同步形式优先（前台脚本普遍可用）；FireMonkey 下两者并存时 GM_getValue 失效，
     *  退化到 GM.getValue（async）由调用处 await。 */
    function gmGet(key, defaultValue) {
        const g = typeof globalThis !== "undefined" ? globalThis : {};
        if (typeof g.GM_getValue === "function")
            return g.GM_getValue(key, defaultValue);
        return defaultValue;
    }
    function gmSet(key, value) {
        const g = typeof globalThis !== "undefined" ? globalThis : {};
        if (typeof g.GM_setValue === "function")
            g.GM_setValue(key, value);
    }
    /**
     * 生成默认 SVG 图标（基于域名首字母）。
     * @param domain 域名
     * @returns data:image/svg+xml;base64,... 格式的 data URL
     */
    function generateDefaultIcon(domain) {
        const letter = domain.charAt(0).toUpperCase();
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                <rect width="64" height="64" rx="8" fill="#4285F4" />
                <text x="32" y="42" font-size="32" text-anchor="middle" fill="white" font-family="Arial">${letter}</text>
            </svg>
        `;
        return `data:image/svg+xml;base64,${btoa(svg)}`;
    }
    USL.generateDefaultIcon = generateDefaultIcon;
    /**
     * 将图片 URL 转换为 data:image（带超时和大小校验）。
     * @param imageUrl 图片地址
     * @param timeout 超时 ms，默认 3000
     * @returns data URL；无效图片（非 200 / 体积 ≤ 100B）会 reject
     */
    function urlToDataUrl(imageUrl, timeout = 3000) {
        const fn = pickXhr();
        return new Promise((resolve, reject) => {
            if (!fn) {
                reject(new Error("No GM xmlHttpRequest implementation available"));
                return;
            }
            fn({
                method: "GET",
                url: imageUrl,
                responseType: "blob",
                timeout: timeout,
                onload: function (resp) {
                    var _a;
                    // 检查状态和内容大小（过滤掉 404 页面或极小的无效图片）
                    if (resp.status === 200 && resp.response && resp.response.size > 100) {
                        const reader = new FileReader();
                        reader.onloadend = function () {
                            resolve(reader.result);
                        };
                        reader.onerror = () => reject(new Error("FileReader 读取失败"));
                        reader.readAsDataURL(resp.response);
                    }
                    else {
                        reject(new Error(`无效图片 (status=${resp.status}, size=${((_a = resp.response) === null || _a === void 0 ? void 0 : _a.size) || 0})`));
                    }
                },
                onerror: (err) => reject(new Error((err === null || err === void 0 ? void 0 : err.error) || (err === null || err === void 0 ? void 0 : err.message) || "图片请求失败")),
                ontimeout: () => reject(new Error("图片请求超时")),
            });
        });
    }
    USL.urlToDataUrl = urlToDataUrl;
    /**
     * 只获取 HTML 的前若干字节（用于快速提取图标）。
     * 用 onprogress 在累积到 maxBytes 时主动 abort，避免拉取整页。
     * @param url 目标网址
     * @param maxBytes 最大读取字节数（默认 16KB）
     * @param timeout 超时时间 ms（默认 5000，同时作保护性超时）
     * @returns 已读取的 HTML 文本
     */
    function fetchHtmlPartial(url, maxBytes = 16384, timeout = 5000) {
        const fn = pickXhr();
        return new Promise((resolve, reject) => {
            if (!fn) {
                reject(new Error("No GM xmlHttpRequest implementation available"));
                return;
            }
            let resolved = false;
            let timer = null;
            const xhr = fn({
                method: "GET",
                url: url,
                responseType: "text",
                timeout: timeout,
                onprogress: function (resp) {
                    if (!resolved &&
                        resp.responseText &&
                        resp.responseText.length >= maxBytes) {
                        resolved = true;
                        clearTimeout(timer);
                        xhr.abort(); // 主动终止，不再接收更多数据
                        resolve(resp.responseText);
                    }
                },
                onload: function (resp) {
                    // 如果整个页面小于 maxBytes，自然结束
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(resp.responseText);
                    }
                },
                onerror: function (err) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        reject(new Error((err === null || err === void 0 ? void 0 : err.error) || (err === null || err === void 0 ? void 0 : err.message) || "HTML 请求失败"));
                    }
                },
                onabort: function () {
                    // 主动 abort 可能触发 onabort，但我们已经 resolve 了，忽略
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        reject(new Error("请求被中止"));
                    }
                },
                ontimeout: function () {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        reject(new Error("HTML 请求超时"));
                    }
                },
            });
            // 保护性超时（防止 onprogress 永远不触发）
            timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    try {
                        xhr.abort();
                    }
                    catch { }
                    reject(new Error("HTML 请求超时（保护性）"));
                }
            }, timeout);
        });
    }
    USL.fetchHtmlPartial = fetchHtmlPartial;
    /**
     * 从 HTML 片段中解析图标 URL（按优先级）。
     * 优先级：apple-touch-icon(-precomposed) > icon > shortcut icon。
     * @param html HTML 片段
     * @param baseUrl 用于解析相对 href 的基准 URL
     * @returns 绝对图标 URL；未找到返回 null
     */
    function parseIconFromHtml(html, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const selectors = [
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
        ];
        for (const sel of selectors) {
            const link = doc.querySelector(sel);
            if (link) {
                const href = link.getAttribute("href");
                if (href) {
                    try {
                        return new URL(href, baseUrl).href;
                    }
                    catch {
                        // URL 无效，继续查找
                    }
                }
            }
        }
        return null;
    }
    USL.parseIconFromHtml = parseIconFromHtml;
    /**
     * 获取站点 favicon，返回带「是否真实站标」标记的 detail。
     * 双策略逐级降级（根 favicon.ico → HTML 解析 → 默认图标），命中真站标
     * 时带 30 天 GM 存储缓存（key 仅 `favicon_<domain>` + `_expire`，不做任何
     * 域名改写，故调用方在父域上调用与子域上调用各自落各自的 key）。永不
     * reject（失败返回 isReal=false 的默认图标，但**不落缓存**，下次仍重试真站标）。
     *
     * 设计要点：缓存 key 恒等于入参 domain。父域回退/去 www 等候选逻辑由
     * 调用方组织（见 loginFlow.notifyLogin），逐个候选调本函数，命中真实
     * 站标（isReal=true）即停——这样直接 USL.getFavicon("www.example.com")
     * 与 gmRequestWithLogin 预热的同一域名会命中同一缓存。
     *
     * @param domain 站点域名（hostname），如 "example.com"
     * @returns {dataUrl, isReal}
     * @example
     * const { dataUrl, isReal } = await USL.getFaviconDetail("example.com");
     */
    async function getFaviconDetail(domain) {
        const cacheKey = `favicon_${domain}`;
        const expireKey = `favicon_${domain}_expire`;
        const now = Date.now();
        // 1. 检查缓存（有效期 30 天）。仅缓存「真实站标」(isReal=true)；读到
        //    isReal=false 或旧版裸 data URL 均视为无效，丢弃后重取（新版本绝不
        //    写 isReal=false 缓存，读到它说明是 v0.2.1 之前的遗留，需清掉）。
        const cached = gmGet(cacheKey, null);
        const expire = gmGet(expireKey, 0);
        if (cached && now < expire) {
            try {
                const detail = JSON.parse(cached);
                if (detail && typeof detail.dataUrl === "string" && detail.isReal) {
                    USL.logger.debug(`[favicon 缓存命中] ${domain} (isReal=true)`);
                    return detail;
                }
            }
            catch {
                // 旧版缓存可能是裸 data URL，格式不符则丢弃重取
            }
        }
        let iconDataUrl = null;
        // 2. 策略一（快速）：请求根目录 favicon.ico
        try {
            const rootUrl = `https://${domain}/favicon.ico`;
            iconDataUrl = await urlToDataUrl(rootUrl, 3000);
            USL.logger.debug(`[favicon 根目录成功] ${rootUrl}`);
        }
        catch (e) {
            USL.logger.debug(`[favicon 根目录失败] ${e.message}`);
        }
        // 3. 策略二（较慢但更准确）：如果根目录失败，读取 HTML 前 16KB 解析
        if (!iconDataUrl) {
            try {
                const pageUrl = `https://${domain}/`;
                USL.logger.debug(`[favicon 开始解析 HTML] 获取前16KB ${pageUrl}...`);
                const htmlSnippet = await fetchHtmlPartial(pageUrl, 16384, 5000);
                const parsedUrl = parseIconFromHtml(htmlSnippet, pageUrl);
                if (parsedUrl) {
                    USL.logger.debug(`[favicon HTML 解析到的 URL] ${parsedUrl}`);
                    iconDataUrl = await urlToDataUrl(parsedUrl, 3000);
                    USL.logger.debug(`[favicon HTML 解析成功]`);
                }
                else {
                    USL.logger.debug(`[favicon HTML 中未找到图标声明]`);
                }
            }
            catch (e) {
                USL.logger.debug(`[favicon HTML 解析失败] ${e.message}`);
            }
        }
        // 4. 真实站标判定：策略一/二任一成功拿到 data URL 即 isReal=true；
        //    全部失败则生成默认字母图标，isReal=false。
        let isReal = true;
        if (!iconDataUrl) {
            iconDataUrl = generateDefaultIcon(domain);
            isReal = false;
            USL.logger.debug(`[favicon 使用默认图标] ${domain}`);
        }
        const detail = { dataUrl: iconDataUrl, isReal };
        // 5. 仅缓存「真实站标」。失败结果（isReal=false 默认字母图）不落缓存——
        //    否则一次网络抖动 / 临时不可达会把默认字母图锁 30 天，调用方（如
        //    notifyLogin 只要真站标、丢弃字母图）会长期取不到图标。失败则下次
        //    仍重试真站标。同时清掉可能遗留的同 key 旧缓存（含旧版裸 data URL）。
        try {
            if (isReal) {
                gmSet(cacheKey, JSON.stringify(detail));
                gmSet(expireKey, now + 30 * 24 * 60 * 60 * 1000);
            }
            else {
                gmSet(cacheKey, null);
                gmSet(expireKey, 0);
            }
        }
        catch {
            // GM 存储不可用（如未 grant / 后台脚本受限）忽略，仅牺牲缓存
        }
        return detail;
    }
    USL.getFaviconDetail = getFaviconDetail;
    /**
     * 获取站点 favicon，返回 data URL。
     * 等价于 `(await getFaviconDetail(domain)).dataUrl`，适合「不关心是否真实站标」
     * 的场景。需要区分真实/默认图标的，用 `getFaviconDetail`。
     *
     * 双策略逐级降级，结果带 30 天 GM 存储缓存，永不 reject（失败返回默认图标）。
     *
     * @param domain 站点域名（hostname），如 "example.com"
     * @returns data URL（图片或默认 SVG）
     * @example
     * const icon = await USL.getFavicon("example.com");
     * GM_notification({ title: "标题", text: "内容", image: icon });
     */
    async function getFavicon(domain) {
        return (await getFaviconDetail(domain)).dataUrl;
    }
    USL.getFavicon = getFavicon;
})(USL || (USL = {}));
/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/// <reference path="./favicon.ts" />
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
    /** 登录超时专用错误类型，可 catch 后用 USL.message 等自行提示 */
    class LoginTimeoutError extends Error {
        constructor(timeoutMs) {
            super(`登录超时：在 ${Math.round(timeoutMs / 1000)}s 内未完成登录`);
            this.name = "LoginTimeoutError";
            this.timeoutMs = timeoutMs;
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
     *  Firefox 下直接 openTab（不依赖点击），通知仅作提示。
     *  通知图标默认值由 getFavicon 异步获取（双策略 + data URL），故本函数为 async；
     *  取图标过程中任一步失败都不阻塞登录引导 —— 拿不到就不带图标，照常弹通知。 */
    async function notifyLogin(options) {
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
        // 通知图标：优先调用方显式传入，否则用 getFavicon 取 data URL。
        // 候选域名链：hostname → 逐级父域（去掉 www. 前缀；按「至少留两段」启发式剥到
        //   eTLD+1，如 auth.example.com → example.com，再剥就停）。
        // 子域常无根 favicon / link 声明，父域才有，故逐级回退，命中真实站标
        //   (isReal=true) 即停，避免错用子域降级的默认字母图。
        // 每个 candidate 各自走 getFaviconDetail，缓存 key = 该域名本身 —— 故直接
        //   USL.getFavicon("www.example.com") 与这里的预热命中同一缓存。
        // 不设等待上限会让 401 登录引导被拉图标阻塞（最坏每候选走完 3s+5s+3s），
        //   整体用 race 包 8s 硬上限，超时就放弃图标直接弹通知（已有 image 用已有）。
        // 兜底：若所有候选都未取到真实站标（isReal=false），用最后一个候选返回的
        //   默认字母图，而非丢弃——有图标总比通知空白强。真站标未取到多半是临时
        //   不可达（isReal=false 不缓存，下次会重试真站标）。
        let image = options.notificationImage;
        if (image === undefined) {
            const candidate = (hostname) => {
                const parts = hostname.replace(/^www\./i, "").split(".").filter(Boolean);
                return parts.length >= 2 ? parts.join(".") : undefined;
            };
            // 生成候选链：当前 hostname → 逐级父域，每段至少留两段
            const candidates = [];
            let cur = candidate(domain);
            while (cur) {
                candidates.push(cur);
                const parts = cur.split(".");
                if (parts.length <= 2)
                    break;
                cur = parts.slice(1).join(".");
            }
            const pickIcon = async () => {
                let fallback; // 全部非真实时兜底用最后一个（默认字母图也优于空白）
                for (const c of candidates) {
                    try {
                        const detail = await USL.getFaviconDetail(c);
                        if (detail.isReal)
                            return detail.dataUrl;
                        if (detail.dataUrl)
                            fallback = detail.dataUrl;
                    }
                    catch {
                        // getFaviconDetail 永不 reject，此处仅防御性
                    }
                }
                // 没拿到真实站标：兜底用默认字母图（有图标总比通知空白强）。
                // 真站标可能因临时不可达未取到（isReal=false 不缓存，下次会重试）。
                return fallback;
            };
            try {
                image = await Promise.race([
                    pickIcon(),
                    new Promise((r) => setTimeout(() => r(undefined), 8000)),
                ]);
            }
            catch {
                image = undefined;
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
                image,
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
                    // 超时不主动弹通知，仅抛语义化错误，由调用方自行提示
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
            // 路 B：轮询探测——用与初始请求相同的判定识别是否已登录。
            // 仅 status===401 不够：站点未登录时若返回 302→/login 或 200 登录页，
            // 必须沿用 options.isUnauthorized 才能正确识别「未登录」并继续等待。
            const checkProbe = (r) => r.status === 401 ||
                (options.isUnauthorized ? !!options.isUnauthorized(r) : false);
            const poll = async () => {
                try {
                    const resp = await USL.rawXhr(probeDetails);
                    if (!checkProbe(resp)) {
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
        const { onUnauthorized, maxRetry, isUnauthorized, ...rest } = options;
        const xhrDetails = rest;
        // 「需要登录」判定：默认 status===401；调用方可传 isUnauthorized 扩展
        // （如 finalUrl 含 /login、200 登录页 HTML 等）。初始请求与登录探测复用同一判定。
        const checkUnauthorized = (r) => r.status === 401 || (isUnauthorized ? !!isUnauthorized(r) : false);
        let resp;
        try {
            resp = await USL.rawXhr(xhrDetails);
        }
        catch (e) {
            throw e;
        }
        if (!checkUnauthorized(resp)) {
            return resp;
        }
        // 需登录：引导登录
        USL.logger.warn(`gmRequestWithLogin unauthorized (status=${resp.status}) on ${xhrDetails.method || "GET"} ${xhrDetails.url}, guiding login`);
        await notifyLogin(options);
        // 等待登录成功（valueChange + 轮询），超时抛 LoginTimeoutError
        await waitForLogin(options, xhrDetails);
        // 登录成功后重试原请求
        return USL.rawXhr(xhrDetails);
    }
    USL.gmRequestWithLogin = gmRequestWithLogin;
    /**
     * 带登录引导的请求并将 responseText 按 JSON 解析返回。
     * 等价于 gmRequestWithLogin + JSON.parse(responseText)。
     * @template T - 期望的响应数据类型
     * @param {USLLoginFlowOptions} options - 请求配置（含登录流程字段）
     * @returns {Promise<T>} 解析后的 JSON 数据
     * @throws {USL.LoginTimeoutError} loginTimeout 内未登录成功
     */
    async function gmRequestJsonWithLogin(options) {
        const resp = await gmRequestWithLogin(options);
        try {
            return JSON.parse(resp.responseText);
        }
        catch (e) {
            // 解析失败多半是登录态判定没覆盖该站点的「未登录响应」(返回了 HTML 而非
            // JSON)。带上 status + finalUrl + 正文前 N 字，方便定位是哪种形态。
            const body = (resp.responseText || "").slice(0, 120).replace(/\s+/g, " ");
            throw new Error(`gmRequestJsonWithLogin: failed to parse response as JSON (status=${resp.status}, finalUrl=${resp.finalUrl || "?"}, body="${body}"): ${e.message}`);
        }
    }
    USL.gmRequestJsonWithLogin = gmRequestJsonWithLogin;
})(USL || (USL = {}));
/**
 * 轻量页面内 message 提示（类似 ElMessage）。
 *
 * - 前台脚本（有可视 DOM）：注入顶部居中的浮层容器 + style，按类型显示彩色提示，
 *   duration（默认 3000ms）后自动淡出消失，多条垂直堆叠。
 * - 后台/定时脚本（ScriptCat @background/@crontab，background page DOM 不可见）：
 *   优先降级 GM_notification（桌面通知），不可用再降级 logger
 *   （GM 日志面板/console），不报错。由 GM_info.script.header 含
 *   @background/@crontab 判定后台脚本。
 *
 * 用法：
 *   USL.message.success("保存成功");
 *   USL.message.error("出错了");
 *   USL.message.warning("注意");
 *   USL.message.info("提示");
 *   USL.message.success("自定义时长", { duration: 5000 });
 *
 * 注：本文件以 `namespace USL` 贡献成员，与其它源文件同名 namespace 自动合并。
 */
var USL;
(function (USL) {
    const CONTAINER_ID = "usl-message-container";
    const STYLE_ID = "usl-message-style";
    const STYLE_CSS = `
#${CONTAINER_ID} {
  position: fixed !important; top: 20px !important; left: 50% !important;
  transform: translateX(-50%) !important;
  display: flex !important; flex-direction: column !important;
  align-items: center !important;
  z-index: 999999 !important;
  pointer-events: none !important;
}
#${CONTAINER_ID} > .usl-msg {
  margin: 8px 0 !important; padding: 10px 20px !important;
  color: #fff !important; border-radius: 4px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
  font-size: 14px !important; line-height: 1.5 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  animation: uslMsgFadeIn 0.3s !important;
  transition: opacity 0.3s, transform 0.3s !important;
  max-width: 80vw !important; word-break: break-word !important;
  pointer-events: auto !important;
}
#${CONTAINER_ID} > .usl-msg-success { background-color: #52c41a !important; }
#${CONTAINER_ID} > .usl-msg-error   { background-color: #ff4d4f !important; }
#${CONTAINER_ID} > .usl-msg-warning { background-color: #faad14 !important; }
#${CONTAINER_ID} > .usl-msg-info    { background-color: #1890ff !important; }
@keyframes uslMsgFadeIn {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
    /** 是否为 ScriptCat 后台/定时脚本。
     *  通过 GM_info.script.header 中的 @background / @crontab 元数据判定。
     *  后台/定时脚本运行在隐藏 background page，DOM 不可见。 */
    function isBackgroundScript() {
        var _a, _b;
        try {
            if (typeof GM_info === "undefined")
                return false;
            if ((GM_info === null || GM_info === void 0 ? void 0 : GM_info.scriptHandler) !== "ScriptCat")
                return false;
            const header = (_b = (_a = GM_info === null || GM_info === void 0 ? void 0 : GM_info.script) === null || _a === void 0 ? void 0 : _a.header) !== null && _b !== void 0 ? _b : "";
            // 词边界匹配，避免 @background-xxx 之类误匹配
            return /@background\b/.test(header) || /@crontab\b/.test(header);
        }
        catch {
            return false;
        }
    }
    /** 是否有可用的可视 DOM（前台脚本）。
     *  ScriptCat 后台/定时脚本运行在隐藏 background page，document.body 存在
     *  但页面不可见，注入浮层用户看不到，故排除。 */
    function hasDom() {
        try {
            if (typeof document === "undefined" || !document.body)
                return false;
            if (isBackgroundScript())
                return false;
            return true;
        }
        catch {
            return false;
        }
    }
    /** 确保样式已注入（仅一次） */
    let styleInjected = false;
    function ensureStyle() {
        if (styleInjected || !hasDom())
            return;
        if (document.getElementById(STYLE_ID)) {
            styleInjected = true;
            return;
        }
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = STYLE_CSS;
        document.head.appendChild(style);
        styleInjected = true;
    }
    /** 取/创建容器 */
    function ensureContainer() {
        if (!hasDom())
            return null;
        ensureStyle();
        let el = document.getElementById(CONTAINER_ID);
        if (!el) {
            el = document.createElement("div");
            el.id = CONTAINER_ID;
            document.body.appendChild(el);
        }
        return el;
    }
    function showDom(text, type, duration) {
        const container = ensureContainer();
        if (!container)
            return;
        const p = document.createElement("div");
        p.className = `usl-msg usl-msg-${type}`;
        p.textContent = text;
        container.appendChild(p);
        const remove = () => {
            if (p.parentNode) {
                p.style.opacity = "0";
                p.style.transform = "translateY(-12px)";
                setTimeout(() => p.remove(), 300);
            }
        };
        if (duration > 0) {
            setTimeout(remove, duration);
        }
    }
    /** 无 DOM 时的降级：优先 GM_notification（桌面通知），其次 logger */
    const gMsg = typeof globalThis !== "undefined" ? globalThis : {};
    const gmMsgObj = typeof GM !== "undefined" ? GM : undefined;
    function pickNotify() {
        if (typeof gMsg.GM_notification === "function")
            return gMsg.GM_notification;
        if (gmMsgObj && typeof gmMsgObj.notification === "function") {
            return (d) => gmMsgObj.notification(d);
        }
        return undefined;
    }
    const TYPE_LEVEL = {
        success: "info",
        error: "error",
        warning: "warn",
        info: "info",
    };
    const TYPE_TITLE = {
        success: "成功",
        error: "错误",
        warning: "警告",
        info: "提示",
    };
    function showFallback(text, type, options) {
        var _a;
        // 优先桌面通知（后台脚本常见，比 logger 更直观）
        const notify = pickNotify();
        if (notify) {
            // 默认标题：options.title > GM_info.script.name > 类型中文
            let title = options === null || options === void 0 ? void 0 : options.title;
            if (!title) {
                try {
                    title = ((_a = GM_info === null || GM_info === void 0 ? void 0 : GM_info.script) === null || _a === void 0 ? void 0 : _a.name) || TYPE_TITLE[type];
                }
                catch {
                    title = TYPE_TITLE[type];
                }
            }
            const details = {
                title,
                text,
                highlight: type === "error",
            };
            if (options === null || options === void 0 ? void 0 : options.image)
                details.image = options.image;
            if (options === null || options === void 0 ? void 0 : options.onclick)
                details.onclick = options.onclick;
            try {
                notify(details);
                return;
            }
            catch (e) {
                USL.logger.debug("message fallback notification failed, use logger", e);
            }
        }
        // 最终降级 logger（带 title 前缀若有）
        const prefix = (options === null || options === void 0 ? void 0 : options.title) ? `[${options.title}] ` : "";
        USL.logger[TYPE_LEVEL[type]](`${prefix}[message:${type}] ${text}`);
    }
    function show(text, type, options) {
        var _a;
        const duration = (_a = options === null || options === void 0 ? void 0 : options.duration) !== null && _a !== void 0 ? _a : 3000;
        if (hasDom()) {
            showDom(text, type, duration);
        }
        else {
            showFallback(text, type, options);
        }
    }
    USL.message = {
        success: (text, options) => show(text, "success", options),
        error: (text, options) => show(text, "error", options),
        warning: (text, options) => show(text, "warning", options),
        info: (text, options) => show(text, "info", options),
        show,
    };
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
/// <reference path="./message.ts" />
/// <reference path="./favicon.ts" />
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