# userscript-libs

油猴脚本公共库，TypeScript 开发，`tsc` 编译为单文件 IIFE，供 `@require` 直接引入。兼容 **Tampermonkey / Violentmonkey 前台脚本** 与 **ScriptCat 后台/定时脚本**。

## 功能

- `gmRequest(options)` — `GM.xmlHttpRequest` 的 Promise 封装（callback 风格统一包成 Promise），对 `401` 提供可配置回调。
- `gmRequestJson<T>(options)` — 在 `gmRequest` 基础上自动 `JSON.parse(responseText)`。
- `gmRequestWithLogin(options)` — 401 时引导用户登录后继续流程（ScriptCat 后台/定时脚本专用，前台也可用）。
- `gmRequestJsonWithLogin<T>(options)` — 在 `gmRequestWithLogin` 基础上自动 `JSON.parse(responseText)`。
- `UnauthorizedError` / `LoginTimeoutError` — 专用错误类，便于 `try/catch` 区分。
- `logger` — 跨管理器日志：ScriptCat 走 `GM.log`/`GM_log`，其他走 `console.*`；支持 `logger.tag("xxx")` 子前缀。
- `message` — 轻量页面内提示（类似 ElMessage）：`message.success/error/warning/info(text)`，前台注入顶部居中浮层，3s 自动消失；后台/定时脚本无 DOM 时优先降级 `GM_notification`，不可用再降级走 `logger`。需 `@grant GM_notification` 才能用桌面通知降级。

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
- `GM_setValue` — **前台脚本**登录成功后写标记用（约定 key）；后台脚本只是监听，但若前后台同一脚本则也需 grant。
- `GM_addValueChangeListener`/`GM_removeValueChangeListener` — **后台脚本**监听登录标记；gmRequestWithLogin 的路 A。未 grant 时自动退化为仅靠轮询探测（路 B）。

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
```

## 设计要点

- **module: none + namespace**：避免 @require 沙箱中无模块加载器导致的 `export` 语法错误；编译为全局 `var USL` + IIFE 挂载到 `unsafeWindow`/`globalThis`/`self`/`window`。
- **ScriptCat 探测**：通过 `GM_info.scriptHandler === "ScriptCat"` 判断。后台/定时脚本与前台 GM API 一致（callback 风格，无 DOM），不存在单独的 `GM.api` Promise 入口，故无需分流。
- **401 不写死业务**：`onUnauthorized` 由调用方注入，返回 `Partial<GMTypes.XHRDetails>` 即合并重试，返回 `false`/`void` 则以 `UnauthorizedError` reject；`maxRetry` 默认 `1` 防止无限循环。
- **gmRequestWithLogin**：401 时 `GM_notification` 引导 → `GM_openInTab` 打开登录页 → 并行两路等登录成功（`GM_addValueChangeListener` 监听前台 `GM_setValue` 标记 + 轮询探测兜底），超时抛 `LoginTimeoutError`。
