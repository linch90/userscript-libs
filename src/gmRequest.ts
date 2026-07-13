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

namespace USL {
  /** 401 专用错误类型，便于调用方 catch 区分 */
  export class UnauthorizedError extends Error {
    readonly response: GM.XhrResponse;
    constructor(response: GM.XhrResponse) {
      super(
        `Request unauthorized (401): ${response?.finalUrl || "(unknown url)"}`,
      );
      this.name = "UnauthorizedError";
      this.response = response;
    }
  }

  /**
   * 请求配置项。直接扩展 GM.XhrDetails，因此 url/method/headers/timeout 等
   * 请求字段与库控制字段（onUnauthorized/maxRetry）写在同一个对象里。
   *
   * 库控制字段会被剥离，不会透传给底层 GM.xmlHttpRequest；
   * onload/onerror/ontimeout 等回调字段即便传入也会被内部控制流覆盖。
   */
  export interface GmRequestOptions extends GM.XhrDetails {
    /**
     * 401 命中时的回调。
     * - 返回 GM.XhrDetails 的部分字段：用其合并到原请求后重试（适合刷新 token 后重发）。
     * - 返回 false / void：以 UnauthorizedError reject。
     * - 抛错：以该错误 reject。
     */
    onUnauthorized?: (
      response: GM.XhrResponse,
      retry: (details: GM.XhrDetails) => Promise<GM.XhrResponse>,
    ) =>
      | Partial<GM.XhrDetails>
      | false
      | void
      | Promise<Partial<GM.XhrDetails> | false | void>;

    /** 401 回调触发的最大重试次数，默认 1（避免无限循环） */
    maxRetry?: number;
  }

  /** 底层执行一次 xmlHttpRequest，返回 Promise。
   *  ScriptCat 后台脚本与前台一致，均为 callback 风格（onload/onerror），
   *  返回 AbortHandle 而非 Promise，故统一在此包成 Promise。
   *  导出供 loginFlow.ts 等做探测请求复用（不走 gmRequest 的 401 重试逻辑）。 */
  export function rawXhr(details: GM.XhrDetails): Promise<GM.XhrResponse> {
    const g = typeof globalThis !== "undefined" ? globalThis : ({} as any);
    const fn: ((d: GM.XhrDetails) => void) | undefined =
      typeof g.GM_xmlhttpRequest === "function"
        ? (g.GM_xmlhttpRequest as (d: GM.XhrDetails) => void)
        : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
          ? GM.xmlHttpRequest
          : undefined;

    if (!fn) {
      return Promise.reject(
        new Error(
          "No GM xmlHttpRequest implementation available in this runtime",
        ),
      );
    }

    return new Promise<GM.XhrResponse>((resolve, reject) => {
      try {
        fn({
          ...details,
          onload: (resp: GM.XhrResponse) => resolve(resp),
          onerror: (err: GM.XhrResponse | Error) => {
            // Tampermonkey onerror 透传 response 对象（含可选 error 字段）；
            // 其它实现可能传 Error。统一取 message/error。
            const msg =
              (err as GM.XhrResponse)?.error ||
              (err as Error)?.message ||
              "network error";
            reject(new Error(`GM xmlHttpRequest error: ${msg}`));
          },
          ontimeout: () => reject(new Error("GM xmlHttpRequest timeout")),
        });
      } catch (e) {
        reject(e);
      }
    });
  }

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
  export async function gmRequest(
    options: GmRequestOptions,
  ): Promise<GM.XhrResponse> {
    // 剥离库控制字段，仅把 GM.XhrDetails 部分交给底层
    const { onUnauthorized, maxRetry: maxRetryOpt, ...xhrDetails } = options;
    const maxRetry = maxRetryOpt ?? 1;
    let attempt = 0;

    const mergedDetails: GM.XhrDetails = xhrDetails;

    const retry = async (next: GM.XhrDetails): Promise<GM.XhrResponse> =>
      rawXhr(next);

    while (true) {
      const resp = await rawXhr(mergedDetails);

      if (resp.status !== 401) {
        return resp;
      }

      logger.warn(
        `gmRequest 401 on ${mergedDetails.method || "GET"} ${mergedDetails.url}`,
      );

      if (!onUnauthorized || attempt >= maxRetry) {
        throw new UnauthorizedError(resp);
      }

      attempt += 1;
      let decision: Partial<GM.XhrDetails> | false | void;
      try {
        decision = await onUnauthorized(resp, retry);
      } catch (e) {
        throw e;
      }

      if (decision === false || decision == null) {
        throw new UnauthorizedError(resp);
      }

      Object.assign(mergedDetails, decision);
    }
  }

  /**
   * 发起 GM 请求并将 responseText 按 JSON 解析返回。
   * @template T - 期望的响应数据类型
   * @param {USLGmRequestOptions} options - 请求配置
   * @returns {Promise<T>} 解析后的 JSON 数据
   */
  export async function gmRequestJson<T = unknown>(
    options: GmRequestOptions,
  ): Promise<T> {
    const resp = await gmRequest(options);
    try {
      return JSON.parse(resp.responseText) as T;
    } catch (e) {
      throw new Error(
        `gmRequestJson: failed to parse response as JSON: ${(e as Error).message}`,
      );
    }
  }
}
