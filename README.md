# userscript-libs

油猴脚本公共库，TypeScript 开发，`tsc` 编译为单文件 IIFE，供 `@require` 直接引入。兼容 **Tampermonkey / Violentmonkey 前台脚本** 与 **ScriptCat 后台/定时脚本**。

## 功能

- `gmRequest(details, options?)` — `GM.xmlHttpRequest` 的 Promise 封装，自动适配前台 callback 风格 / ScriptCat `GM.api` Promise 风格；对 `401` 提供可配置回调。
- `gmRequestJson<T>(details, options?)` — 在 `gmRequest` 基础上自动 `JSON.parse(responseText)`。
- `UnauthorizedError` — 401 专用错误类，便于 `try/catch` 区分。
- `logger` — 跨管理器日志：ScriptCat 走 `GM.api.log`/`GM.log`，其他走 `console.*`；支持 `logger.tag("xxx")` 子前缀。

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
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.0/index.js

// 跟踪 master 最新产物（master 的 index.js 仅在打 tag 时更新）
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@master/index.js
```

> 仅打 tag 时才会 build 并更新 master 根目录的 `index.js`；普通 push 源码不触发产物更新。

## ScriptCat 编辑器补全

`@require` 引入的库函数 JSDoc 不被 ScriptCat 编辑器（Monaco）跨文件解析，直接敲
`USL.` 不会弹成员、`USL.gmRequest(` 不会弹参数字段，且会报 `'USL' is not defined`。

解决：把仓库根的 [`usl-snippet.js`](./usl-snippet.js) 整块粘贴到用户脚本
`// ==/UserScript==` 之后。它在用户脚本内重建 `USL` 对象（每个方法带 `@param` JSDoc
转调真实库），让编辑器既弹成员名、又弹参数字段，同时消除未定义报错。

```js
// ==UserScript==
// ...
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.3/index.js
// ==/UserScript==

// ↓ 粘贴 usl-snippet.js 内容（约 70 行）
// ... typedef + const _USL = ...USL + const USL = { gmRequest, ... } ...

// 之后即可补全：
USL.gmRequest({ method: "GET", url: "..." });   // 弹 url/method/onUnauthorized...
USL.logger.info("hi");                           // 弹 info/warn/...
```

> snippet 与版本对齐，发版时版本号注释会随 `usl-snippet.js` 更新。
> Monaco 对 `@typedef` 中函数类型 property 的成员列表补全不完整，故 snippet
> 采用「重建真实对象 + 每方法自带 @param」而非纯 typedef，以同时拿到成员列表
> 与参数字段提示。

## 在油猴脚本中使用

```js
// @require https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v0.1.0/index.js

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

- **module: none + namespace**：避免 @require 沙箱中无模块加载器导致的 `export` 语法错误；编译为全局 `var USL` + IIFE 挂载到 `unsafeWindow`/`globalThis`。
- **ScriptCat 探测**：通过 `GM_info.scriptHandler === "ScriptCat"` 判断，后台脚本仅有 `GM.api` 统一入口，故 `rawXhr`/`logger` 优先走 `GM.api`。
- **401 不写死业务**：`onUnauthorized` 由调用方注入，返回新 `XHRRequest` 即触发一次重试，返回 `false`/`void` 则以 `UnauthorizedError` reject；`maxRetry` 默认 `1` 防止无限循环。
