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

namespace USL {
  // ---- GM_xmlhttpRequest 适配：双探全局函数形式 / GM.* 命名空间形式 ----
  // 与 gmRequest.rawXhr 一致，用户 grant 任一形式都能找到可用实现。
  // xmlHttpRequest 在 Tampermonkey / ScriptCat 均为 callback 风格（返回 handle），
  // 故统一在此包成 Promise。本模块需要 responseType(blob/text) 与 onprogress，
  // 不能直接复用 rawXhr（后者不支持 onprogress 提前 abort、且 response 类型固定为 text）。
  function pickXhr(): ((details: any) => any) | undefined {
    const g: any = typeof globalThis !== "undefined" ? globalThis : ({} as any);
    if (typeof g.GM_xmlhttpRequest === "function") return g.GM_xmlhttpRequest;
    const gmObj: any = typeof GM !== "undefined" ? GM : undefined;
    if (gmObj && typeof gmObj.xmlHttpRequest === "function") {
      return (d: any) => gmObj.xmlHttpRequest(d);
    }
    return undefined;
  }

  /** GM 存储适配：双探 GM_getValue/GM_setValue 同步形式与 GM.setValue Promise 形式。
   *  同步形式优先（前台脚本普遍可用）；FireMonkey 下两者并存时 GM_getValue 失效，
   *  退化到 GM.getValue（async）由调用处 await。 */
  function gmGet<T>(key: string, defaultValue?: T): T {
    const g: any = typeof globalThis !== "undefined" ? globalThis : ({} as any);
    if (typeof g.GM_getValue === "function") return g.GM_getValue(key, defaultValue);
    return defaultValue as T;
  }
  function gmSet<T>(key: string, value: T): void {
    const g: any = typeof globalThis !== "undefined" ? globalThis : ({} as any);
    if (typeof g.GM_setValue === "function") g.GM_setValue(key, value);
  }

  /**
   * 生成默认 SVG 图标（基于域名首字母）。
   * @param domain 域名
   * @returns data:image/svg+xml;base64,... 格式的 data URL
   */
  export function generateDefaultIcon(domain: string): string {
    const letter = domain.charAt(0).toUpperCase();
    const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                <rect width="64" height="64" rx="8" fill="#4285F4" />
                <text x="32" y="42" font-size="32" text-anchor="middle" fill="white" font-family="Arial">${letter}</text>
            </svg>
        `;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  /**
   * 将图片 URL 转换为 data:image（带超时和大小校验）。
   * @param imageUrl 图片地址
   * @param timeout 超时 ms，默认 3000
   * @returns data URL；无效图片（非 200 / 体积 ≤ 100B）会 reject
   */
  export function urlToDataUrl(imageUrl: string, timeout = 3000): Promise<string> {
    const fn = pickXhr();
    return new Promise<string>((resolve, reject) => {
      if (!fn) {
        reject(new Error("No GM xmlHttpRequest implementation available"));
        return;
      }
      fn({
        method: "GET",
        url: imageUrl,
        responseType: "blob",
        timeout: timeout,
        onload: function (resp: any) {
          // 检查状态和内容大小（过滤掉 404 页面或极小的无效图片）
          if (resp.status === 200 && resp.response && resp.response.size > 100) {
            const reader = new FileReader();
            reader.onloadend = function () {
              resolve(reader.result as string);
            };
            reader.onerror = () =>
              reject(new Error("FileReader 读取失败"));
            reader.readAsDataURL(resp.response);
          } else {
            reject(
              new Error(
                `无效图片 (status=${resp.status}, size=${resp.response?.size || 0})`,
              ),
            );
          }
        },
        onerror: (err: any) =>
          reject(new Error(err?.error || err?.message || "图片请求失败")),
        ontimeout: () => reject(new Error("图片请求超时")),
      });
    });
  }

  /**
   * 只获取 HTML 的前若干字节（用于快速提取图标）。
   * 用 onprogress 在累积到 maxBytes 时主动 abort，避免拉取整页。
   * @param url 目标网址
   * @param maxBytes 最大读取字节数（默认 16KB）
   * @param timeout 超时时间 ms（默认 5000，同时作保护性超时）
   * @returns 已读取的 HTML 文本
   */
  export function fetchHtmlPartial(
    url: string,
    maxBytes = 16384,
    timeout = 5000,
  ): Promise<string> {
    const fn = pickXhr();
    return new Promise<string>((resolve, reject) => {
      if (!fn) {
        reject(new Error("No GM xmlHttpRequest implementation available"));
        return;
      }
      let resolved = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const xhr = fn({
        method: "GET",
        url: url,
        responseType: "text",
        timeout: timeout,
        onprogress: function (resp: any) {
          if (
            !resolved &&
            resp.responseText &&
            resp.responseText.length >= maxBytes
          ) {
            resolved = true;
            clearTimeout(timer!);
            xhr.abort(); // 主动终止，不再接收更多数据
            resolve(resp.responseText);
          }
        },
        onload: function (resp: any) {
          // 如果整个页面小于 maxBytes，自然结束
          if (!resolved) {
            resolved = true;
            clearTimeout(timer!);
            resolve(resp.responseText);
          }
        },
        onerror: function (err: any) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer!);
            reject(new Error(err?.error || err?.message || "HTML 请求失败"));
          }
        },
        onabort: function () {
          // 主动 abort 可能触发 onabort，但我们已经 resolve 了，忽略
          if (!resolved) {
            resolved = true;
            clearTimeout(timer!);
            reject(new Error("请求被中止"));
          }
        },
        ontimeout: function () {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer!);
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
          } catch {}
          reject(new Error("HTML 请求超时（保护性）"));
        }
      }, timeout);
    });
  }

  /**
   * 从 HTML 片段中解析图标 URL（按优先级）。
   * 优先级：apple-touch-icon(-precomposed) > icon > shortcut icon。
   * @param html HTML 片段
   * @param baseUrl 用于解析相对 href 的基准 URL
   * @returns 绝对图标 URL；未找到返回 null
   */
  export function parseIconFromHtml(html: string, baseUrl: string): string | null {
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
          } catch {
            // URL 无效，继续查找
          }
        }
      }
    }
    return null;
  }

  // ===================== 主获取函数（带缓存，双策略） =====================

  /** getFaviconDetail 返回值：dataUrl 是可直接使用的图标 data URL，
   *  isReal 区分「真实站标」与「降级生成的默认字母图」。 */
  export interface FaviconDetail {
    /** 图标 data URL（真实站标或默认 SVG） */
    dataUrl: string;
    /** true=真实站标；false=策略一/二都失败后生成的默认字母图标 */
    isReal: boolean;
    /** 原图标远程 URL（命中真站标时为 favicon.ico 或 link href；降级字母图为 undefined）。
     *  供调用方在 dataURL 不适合某些场景（如通知消费端不渲染大尺寸 jpeg dataURL）时，
     *  回退用远程原图让消费端自行拉取缩放。 */
    sourceUrl?: string;
  }

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
  export async function getFaviconDetail(domain: string): Promise<FaviconDetail> {
    const cacheKey = `favicon_${domain}`;
    const expireKey = `favicon_${domain}_expire`;
    const now = Date.now();

    // 1. 检查缓存（有效期 30 天）。仅缓存「真实站标」(isReal=true)；读到
    //    isReal=false 或旧版裸 data URL 均视为无效，丢弃后重取（新版本绝不
    //    写 isReal=false 缓存，读到它说明是 v0.2.1 之前的遗留，需清掉）。
    const cached = gmGet<string | null>(cacheKey, null);
    const expire = gmGet<number>(expireKey, 0);
    if (cached && now < expire) {
      try {
        const detail = JSON.parse(cached) as FaviconDetail;
        if (detail && typeof detail.dataUrl === "string" && detail.isReal) {
          logger.debug(`[favicon 缓存命中] ${domain} (isReal=true)`);
          return detail;
        }
      } catch {
        // 旧版缓存可能是裸 data URL，格式不符则丢弃重取
      }
    }

    let iconDataUrl: string | null = null;
    let sourceUrl: string | undefined; // 命中真站标时记录原 URL，供通知场景回退

    // 2. 策略一（快速）：请求根目录 favicon.ico
    try {
      const rootUrl = `https://${domain}/favicon.ico`;
      iconDataUrl = await urlToDataUrl(rootUrl, 3000);
      sourceUrl = rootUrl;
      logger.debug(`[favicon 根目录成功] ${rootUrl}`);
    } catch (e) {
      logger.debug(`[favicon 根目录失败] ${(e as Error).message}`);
    }

    // 3. 策略二（较慢但更准确）：如果根目录失败，读取 HTML 前 16KB 解析
    if (!iconDataUrl) {
      try {
        const pageUrl = `https://${domain}/`;
        logger.debug(`[favicon 开始解析 HTML] 获取前16KB ${pageUrl}...`);
        const htmlSnippet = await fetchHtmlPartial(pageUrl, 16384, 5000);
        const parsedUrl = parseIconFromHtml(htmlSnippet, pageUrl);
        if (parsedUrl) {
          logger.debug(`[favicon HTML 解析到的 URL] ${parsedUrl}`);
          iconDataUrl = await urlToDataUrl(parsedUrl, 3000);
          sourceUrl = parsedUrl;
          logger.debug(`[favicon HTML 解析成功]`);
        } else {
          logger.debug(`[favicon HTML 中未找到图标声明]`);
        }
      } catch (e) {
        logger.debug(`[favicon HTML 解析失败] ${(e as Error).message}`);
      }
    }

    // 4. 真实站标判定：策略一/二任一成功拿到 data URL 即 isReal=true；
    //    全部失败则生成默认字母图标，isReal=false（sourceUrl 留空）。
    let isReal = true;
    if (!iconDataUrl) {
      iconDataUrl = generateDefaultIcon(domain);
      isReal = false;
      sourceUrl = undefined;
      logger.debug(`[favicon 使用默认图标] ${domain}`);
    }

    const detail: FaviconDetail = { dataUrl: iconDataUrl, isReal, sourceUrl };

    // 5. 仅缓存「真实站标」。失败结果（isReal=false 默认字母图）不落缓存——
    //    否则一次网络抖动 / 临时不可达会把默认字母图锁 30 天，调用方（如
    //    notifyLogin 只要真站标、丢弃字母图）会长期取不到图标。失败则下次
    //    仍重试真站标。同时清掉可能遗留的同 key 旧缓存（含旧版裸 data URL）。
    try {
      if (isReal) {
        gmSet(cacheKey, JSON.stringify(detail));
        gmSet(expireKey, now + 30 * 24 * 60 * 60 * 1000);
      } else {
        gmSet(cacheKey, null as unknown as string);
        gmSet(expireKey, 0);
      }
    } catch {
      // GM 存储不可用（如未 grant / 后台脚本受限）忽略，仅牺牲缓存
    }

    return detail;
  }

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
  export async function getFavicon(domain: string): Promise<string> {
    return (await getFaviconDetail(domain)).dataUrl;
  }

  // ---- 通知用图标适配 ----
  // 通知消费端（ScriptCat/浏览器 GM_notification）对 dataURL 图标支持有限：
  // 实测 ico/png/svg 小图能渲染，jpeg 或过大（>64KB）dataURL 常被静默丢弃
  // （如 framehdr 真站标是 354KB jpeg dataURL，通知不显示）。故 dataURL 不适合
  // 通知时退回原图远程 URL（sourceUrl），让消费端自行拉取缩放——远 URL 更可靠。

  /** 通知端可渲染的 dataURL MIME 白名单 */
  export const NOTIFY_DATAURL_MIME_OK = [
    "image/png",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/svg+xml",
  ];
  /** 通知端 dataURL 大小上限（超出则退回远程原图） */
  export const NOTIFY_DATAURL_MAX_BYTES = 64 * 1024;

  /** 判定 dataURL 是否适合通知端渲染（mime 在白名单且不超大小上限）。
   *  导出供调用方自行决策。 */
  export function isDataUrlGoodForNotification(dataUrl: string): boolean {
    if (!dataUrl) return false;
    const mime = dataUrl.slice(0, dataUrl.indexOf(";"));
    return (
      NOTIFY_DATAURL_MIME_OK.includes(mime) &&
      dataUrl.length <= NOTIFY_DATAURL_MAX_BYTES
    );
  }

  /**
   * 取适合通知展示的图标 URL（data URL 或远程原图 URL）。
   * 等价于 `getFaviconDetail` 后自动适配：
   *   - dataURL 适合通知（ico/png/svg 且 ≤64KB）→ 返回 dataURL；
   *   - dataURL 不适合（jpeg 或 >64KB，如 framehdr 354KB jpg）且有 sourceUrl → 返回远程原图 URL；
   *   - 仅默认字母图（svg，小图适合）→ 返回该 dataURL。
   * 永不 reject。前台/后台脚本均可。给 `USL.message.options.image` 或 `GM_notification({image})` 用。
   *
   * @param domain 站点域名（hostname），如 "framehdr.com"
   * @returns 适合通知的图标 URL（data URL 或远程 URL），失败返回默认字母图 dataURL
   * @example
   * const icon = await USL.getNotificationImage("framehdr.com");
   * USL.message.success("签到成功", { image: icon });
   */
  export async function getNotificationImage(domain: string): Promise<string> {
    const detail = await getFaviconDetail(domain);
    const mime = detail.dataUrl.slice(0, detail.dataUrl.indexOf(";"));
    const tooBig = detail.dataUrl.length > NOTIFY_DATAURL_MAX_BYTES;
    const mimeBad = !NOTIFY_DATAURL_MIME_OK.includes(mime);
    if ((tooBig || mimeBad) && detail.sourceUrl) {
      return detail.sourceUrl;
    }
    return detail.dataUrl;
  }
}
