# userscript-libs

油猴脚本公共库，TypeScript 开发，`tsc` 编译为单文件 IIFE，供 `@require` 直接引入。兼容 **Tampermonkey / Violentmonkey 前台脚本** 与 **ScriptCat 后台/定时脚本**。

## 功能

- `gmRequest(options)` — `GM.xmlHttpRequest` 的 Promise 封装（callback 风格统一包成 Promise），对 `401` 提供可配置回调。
- `gmRequestJson<T>(options)` — 在 `gmRequest` 基础上自动 `JSON.parse(responseText)`。
- `gmRequestWithLogin(options)` — 需登录时（默认 401；可配 `isUnauthorized` 覆盖，如站点未登录返回 302→`/login` 或 200 登录页 HTML）引导用户登录后继续流程（ScriptCat 后台/定时脚本专用，前台也可用）。
- `gmRequestJsonWithLogin<T>(options)` — 在 `gmRequestWithLogin` 基础上自动 `JSON.parse(responseText)`；解析失败时报错带 status/finalUrl/正文片段，便于定位「未登录返回 HTML」之类。
- `UnauthorizedError` / `LoginTimeoutError` — 专用错误类，便于 `try/catch` 区分。
- `logger` — 跨管理器日志：ScriptCat 走 `GM.log`/`GM_log`，其他走 `console.*`；支持 `logger.tag("xxx")` 子前缀。
- `message` — 轻量页面内提示（类似 ElMessage）：`message.success/error/warning/info(text)`，前台注入顶部居中浮层，3s 自动消失；后台/定时脚本无 DOM 时优先降级 `GM_notification`，不可用再降级走 `logger`。需 `@grant GM_notification` 才能用桌面通知降级。
- `getFavicon(domain)` / `getFaviconDetail(domain)` — 获取站点 favicon 并返回 data URL（前台 / ScriptCat 后台脚本均可）。双策略逐级降级：根目录 `favicon.ico` → 读 HTML 前 16KB 解析 `apple-touch-icon`/`icon`/`shortcut icon` → 域名首字母默认 SVG；命中真站标时带 30 天 `GM_getValue`/`GM_setValue` 缓存（失败结果不缓存，避免一次抖动锁死默认字母图），永不 reject。`getFaviconDetail` 额外返回 `isReal` 标记 + `sourceUrl`（原图远程 URL）。
- `getNotificationImage(domain)` — 取**适合通知展示**的图标 URL（给 `USL.message.options.image` 或 `GM_notification({image})` 用）。通知端只渲染 ico/png/svg 小 dataURL，jpeg 或 >64KB dataURL 被静默丢弃，故本函数自动判定：不适合时退回 `sourceUrl` 远程原图让通知端自拉（framehdr 354KB jpeg 走此路）。永不 reject，前台/后台均可。`gmRequestWithLogin` 的通知图标默认值即走此逻辑。

## 构建

```bash
npm install
npm run build      # 输出到 dist/index.js（+ .map）
npm run watch      # 监听变更自动编译
```

产物 `dist/index.js` 为单文件 IIFE，无 CommonJS 包裹，`@require` 拼接后挂载全局 `USL`。

## 发布与引用（jsDelivr）

发布流程由 GitHub Actions 自动完成（`.github/workflows/release.yml`）：
打 `v*` tag → CI `npm run build` → 把 `dist/index.js` 提交到 master 根 `index.js` →
把 tag 移到含产物的 commit。

### 发新版（快捷脚本）

```bash
# 工作区干净时，一行命令发版（改版本号 + commit + tag + push，CI 自动发布产物）
npm run release -- patch      # 0.1.0 -> 0.1.1
npm run release -- minor      # 0.1.0 -> 0.2.0
npm run release -- major      # 0.1.0 -> 1.0.0
npm run release -- 1.2.3      # 指定具体版本
```

脚本会自动：检查工作区干净 → 同步远程 → `npm version` 改版本号/commit/tag → push。
若工作区有未提交改动或本地落后远程，会中止并提示。关注 Actions：
https://github.com/linch90/userscript-libs/actions

### 引用

```js
// 锁定版本（推荐，永不变化）
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.5/index.js

// 跟踪 master 最新产物（master 的 index.js 仅在打 tag 时更新）
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@master/index.js
```

> 仅打 tag 时才会 build 并更新 master 根目录的 `index.js`；普通 push 源码不触发产物更新。

## ScriptCat 编辑器补全

ScriptCat 编辑器（Monaco）不解析 `@require` 库的 JSDoc，直接敲 `USL.` 不弹成员、
`USL.gmRequest(` 不弹参数字段。但 ScriptCat 提供了「编辑器类型定义」全局类型源：
**设置 → 编辑器类型定义**输入框（里面已内置 `GMTypes` 等声明）。

把仓库根的 [`usl.d.ts`](./usl.d.ts) 内容**追加**到该输入框现有内容之后（保留原内容，
勿覆盖）。之后所有用户脚本里 `USL.` 弹成员、`USL.gmRequest({` 弹参数字段，一次配置
全局生效，无需在每个脚本粘贴。`usl.d.ts` 依赖输入框已有的 `GMTypes.XHRDetails` /
`GMTypes.XHRResponse`。

```js
// ==UserScript==
// ...
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.5/index.js
// ==/UserScript==

USL.gmRequest({ method: "GET", url: "..." });   // 弹 url/method/onUnauthorized...
USL.logger.info("hi");                           // 弹 info/warn/...
```

> d.ts 可直接从 jsDelivr 取：`https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.5/usl.d.ts`
> （浏览器打开复制其内容追加到编辑器类型定义输入框）。

## @grant 权限清单

库内部调用的 GM API，必须在你用户脚本头 `@grant` 声明（`@require` 的库与主脚本共享同一份 `@grant`）。按使用功能分级：

**只用 gmRequest / gmRequestJson / logger（最小集）**
```
// @grant unsafeWindow
// @grant GM_xmlhttpRequest
// @grant GM_log
```

**还要用 gmRequestWithLogin（完整集）**
```
// @grant unsafeWindow
// @grant GM_xmlhttpRequest
// @grant GM_log
// @grant GM_notification
// @grant GM_openInTab
// @grant GM_setValue
// @grant GM_addValueChangeListener
// @grant GM_removeValueChangeListener
```

说明：
- `unsafeWindow` — 库把 `USL` 挂到全局对象；前台脚本需 grant。ScriptCat 后台脚本无 `unsafeWindow`，库会回退到 `globalThis`/`self`，可不 grant。
- `GM_xmlhttpRequest` — gmRequest 必需。
- `GM_log` — logger 在 ScriptCat 下走 GM 日志面板；不 grant 则退回 `console.*`（前台可用，后台脚本无 console 会丢失日志）。
- `GM_notification`/`GM_openInTab` — gmRequestWithLogin 弹通知 + 打开登录页。
- `GM_setValue` — **前台脚本**登录成功后写标记用（约定 key）；后台脚本只是监听，但若前后台同一脚本则也需 grant。`getFavicon` 缓存亦用它写入。
- `GM_getValue` — `getFavicon` 读 favicon 缓存用（前台脚本）。
- `GM_addValueChangeListener`/`GM_removeValueChangeListener` — **后台脚本**监听登录标记；gmRequestWithLogin 的路 A。未 grant 时自动退化为仅靠轮询探测（路 B）。

### @connect（跨域请求白名单，关键易漏）

`GM_xmlhttpRequest` 跨域请求目标域名必须在你用户脚本头 `@connect` 声明，否则管理器直接拦截（报 `Refused to connect ... not a part of the @connect list`）。`@connect` 是**精确域名匹配**，`@connect www.example.com` **不会**覆盖裸域 `example.com`，子/父域要分别声明。

库内会额外跨域请求的几处（除了你业务请求的域，这几类域也要 `@connect`）：
- **`getFavicon` / `getFaviconDetail`**：会请求 `https://<domain>/favicon.ico` 和站点根 HTML。`domain` 即调用时传入的 hostname。`gmRequestWithLogin` 的通知图标默认会取 `loginUrl` 的 hostname（含 `www` 子域）及其去 `www` 后的裸域与逐级父域（如 `loginUrl=https://www.acfun.cn/` → 候选 `www.acfun.cn`、`acfun.cn`），故这些域都要 `@connect`，否则通知拿不到真站标图标。
- **`gmRequestWithLogin` 登录探测**：探测请求走原始请求 URL，该域通常已 `@connect`（否则签到请求本身也发不出）。但若 `loginUrl` 与请求 API 不同域（如 OAuth 登录页在 `oauth.example.com`，API 在 `www.example.com`），`loginUrl` 域不影响探测（探测不发到 loginUrl），仅 `GM_openInTab` 打开它。

举例（kungal 站，API 在 `www.kungal.com`，登录也在此域，通知图标走 `kungal.com` 裸域 favicon）：
```
// @connect www.kungal.com
// @connect kungal.com
// @connect oauth.kungal.com   ← 若 loginUrl 跨子域
```

> ScriptCat 里 `@grant GM_xxx`（全局函数形式）与 `@grant GM.xxx`（命名空间形式）二选一即可——库对所有用到的 GM API 都做了双探，两种形式都能找到可用实现。推荐统一一种形式（`GM_*` 与 ScriptCat 文档示例一致）。

## 在油猴脚本中使用

```js
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.5/index.js

const { gmRequest, gmRequestJson, logger, UnauthorizedError } = USL;

// 普通请求
const resp = await gmRequest({ method: "GET", url: "https://api.example.com/me" });

// 401 自动刷新 token 后重试
const data = await gmRequestJson(
  {
    method: "GET",
    url: "https://api.example.com/protected",
    headers: { Authorization: `Bearer ${token}` },
  },
  {
    onUnauthorized: async () => {
      const fresh = await refreshToken();
      return { headers: { Authorization: `Bearer ${fresh}` } };
    },
  }
);

try {
  await gmRequest({ url: "..." });
} catch (e) {
  if (e instanceof UnauthorizedError) {
    logger.error("需要重新登录");
  }
}

// 获取站点 favicon 作为通知图标（前台脚本）
const icon = await USL.getFavicon("example.com");
GM_notification({ title: "提醒", text: "内容", image: icon });
```

## 设计要点

- **module: none + namespace**：避免 @require 沙箱中无模块加载器导致的 `export` 语法错误；编译为全局 `var USL` + IIFE 挂载到 `unsafeWindow`/`globalThis`/`self`/`window`。
- **ScriptCat 探测**：通过 `GM_info.scriptHandler === "ScriptCat"` 判断。后台/定时脚本与前台 GM API 一致（callback 风格，无 DOM），不存在单独的 `GM.api` Promise 入口，故无需分流。
- **401 不写死业务**：`onUnauthorized` 由调用方注入，返回 `Partial<GMTypes.XHRDetails>` 即合并重试，返回 `false`/`void` 则以 `UnauthorizedError` reject；`maxRetry` 默认 `1` 防止无限循环。
- **gmRequestWithLogin**：需登录时 `GM_notification` 引导 → `GM_openInTab` 打开登录页 → 并行两路等登录成功（`GM_addValueChangeListener` 监听前台 `GM_setValue` 标记 + 轮询探测兜底），超时抛 `LoginTimeoutError`。
- **isUnauthorized 覆盖「需登录」判定**：默认仅 `status===401` 触发登录流程。若站点未登录时不返回 401（而是 302 → `/login` 或 200 登录页 HTML），传 `isUnauthorized(resp)` 回调扩展判定。该回调同时用于初始请求与登录成功轮询探测，故只在「确实未登录」时返回 true，否则会在已登录状态下被误判回登录流程。解析失败时报错带 `status`/`finalUrl`/正文片段，便于定位「未登录返回 HTML」之类：

```js
await USL.gmRequestJsonWithLogin({
  method: "GET",
  url: "https://api.example.com/me",
  loginUrl: "https://example.com/login",
  loginSignalKey: "myapp:logged-in",
  // 该站点未登录时 302 重定向到 /login，finalUrl 会带上 /login
  isUnauthorized: (resp) =>
    resp.status === 401 || (resp.finalUrl || "").includes("/login"),
});
```

