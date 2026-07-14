/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/**
 * 站点 favicon 获取工具（前台脚本专用）。
 *
 * 双策略获取，逐级降级，全程带 30 天 GM 存储缓存：
 *   1. 策略一（快速）：直接请求根目录 `https://<domain>/favicon.ico`，
 *      状态 200 且体积 > 100B 视为有效（过滤 404 占位页/极小无效图）。
 *   2. 策略二（较慢但更准）：读 HTML 前 16KB，按优先级解析 link 声明：
 *        apple-touch-icon(-precomposed) > icon > shortcut icon，
 *      拿到 href 后转 data URL。读取用 onprogress 提前 abort，避免拉整页。
 *   3. 全部失败：生成基于域名首字母的默认 SVG 图标。
 *
 * 限制：依赖 DOMParser / FileReader / btoa，仅前台脚本可用。ScriptCat
 * 后台/定时脚本无 DOM，策略一/二的 DOM 依赖部分会失败并降级到默认图标
 * （整体 getFavicon 永不 reject，至少返回默认图标）。
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
  }

  /**
   * 获取站点 favicon，返回带「是否真实站标」标记的 detail。
   * 双策略逐级降级（根 favicon.ico → HTML 解析 → 默认图标），结果带 30 天
   * GM 存储缓存（key 仅 `favicon_<domain>` + `_expire`，不做任何域名改写，
   * 故调用方在父域上调用与子域上调用各自落各自的 key）。永不 reject
   * （失败返回 isReal=false 的默认图标）。
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

    // 1. 检查缓存（有效期 30 天）。缓存存 {dataUrl, isReal} 串化的 JSON，
    //    命中即直接还原，避免重复网络请求。
    const cached = gmGet<string | null>(cacheKey, null);
    const expire = gmGet<number>(expireKey, 0);
    if (cached && now < expire) {
      try {
        const detail = JSON.parse(cached) as FaviconDetail;
        if (detail && typeof detail.dataUrl === "string") {
          logger.debug(`[favicon 缓存命中] ${domain} (isReal=${detail.isReal})`);
          return detail;
        }
      } catch {
        // 旧版缓存可能是裸 data URL，格式不符则丢弃重取
      }
    }

    let iconDataUrl: string | null = null;

    // 2. 策略一（快速）：请求根目录 favicon.ico
    try {
      const rootUrl = `https://${domain}/favicon.ico`;
      iconDataUrl = await urlToDataUrl(rootUrl, 3000);
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
          logger.debug(`[favicon HTML 解析成功]`);
        } else {
          logger.debug(`[favicon HTML 中未找到图标声明]`);
        }
      } catch (e) {
        logger.debug(`[favicon HTML 解析失败] ${(e as Error).message}`);
      }
    }

    // 4. 真实站标判定：策略一/二任一成功拿到 data URL 即 isReal=true；
    //    全部失败则生成默认字母图标，isReal=false。
    let isReal = true;
    if (!iconDataUrl) {
      iconDataUrl = generateDefaultIcon(domain);
      isReal = false;
      logger.debug(`[favicon 使用默认图标] ${domain}`);
    }

    const detail: FaviconDetail = { dataUrl: iconDataUrl, isReal };

    // 5. 存入缓存（30 天有效期）。旧版若存的是裸 data URL，此处覆盖为 JSON。
    try {
      gmSet(cacheKey, JSON.stringify(detail));
      gmSet(expireKey, now + 30 * 24 * 60 * 60 * 1000);
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
}
