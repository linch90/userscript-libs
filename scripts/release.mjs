// 发版快捷脚本：改 package.json 版本号 → commit → push master（让 CI 自动 build + 打 tag）。
// 用法：
//   npm run release -- patch      # 0.1.0 -> 0.1.1
//   npm run release -- minor      # 0.1.0 -> 0.2.0
//   npm run release -- major      # 0.1.0 -> 1.0.0
//   npm run release -- 1.2.3      # 指定具体版本
//
// 本脚本只做：改版本号 + commit 源码 + push master。
// 不打 tag —— 由 GitHub Actions(.github/workflows/release.yml) 在 build 产物后，
// 在产物 commit 上打 v<version> tag 并 push。这样 tag 从诞生即指向含产物 commit，
// jsDelivr 首次拉取即新内容，避免 force-move tag 的缓存问题。
//
// 要求工作区干净（npm version 会校验），且本地不落后远程。

import { execSync } from "node:child_process";

const bump = process.argv[2];

if (!bump) {
  console.error("用法: npm run release -- <patch|minor|major|具体版本号>");
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

// 1. 确认工作区干净
try {
  execSync("git diff --quiet && git diff --cached --quiet", { stdio: "ignore" });
} catch {
  console.error("✗ 工作区有未提交改动，请先 commit 或 stash 再发版。");
  process.exit(1);
}

// 2. 同步远程，确保不落后
run("git fetch origin master");
const behind = execSync("git rev-list --count HEAD..origin/master")
  .toString()
  .trim();
if (behind !== "0") {
  console.error(`✗ 本地 master 落后远程 ${behind} 个 commit，请先 git pull。`);
  process.exit(1);
}

// 3. npm version：改版本号 + commit（不打 tag，--no-git-tag-version 不行因为要 commit；
//    用 npm version 默认会 commit+tag，我们随后删除它打的 tag，只保留 commit）
//    更简洁：先 no-tag 改版本，再手动 commit
execSync(`npm version ${bump} --no-git-tag-version -m "chore: release %s"`, {
  stdio: "inherit",
});
const newVersion = JSON.parse(
  execSync("node -p JSON.stringify(require('./package.json').version)").toString()
);

run(`git add -A`);
run(`git commit -m "chore: release v${newVersion}"`);

// 4. push master —— CI 检测到 package.json version 变化，自动 build 并打 tag
run("git push origin master");

console.log(`\n✓ 已推送 v${newVersion} 源码到 master，CI 将自动 build + 打 tag v${newVersion}。`);
console.log("  关注: https://github.com/linch90/userscript-libs/actions");
console.log(`  发布后引用: https://cdn.jsdelivr.net/gh/linch90/userscript-libs@v${newVersion}/index.js`);
