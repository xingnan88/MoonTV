---
name: deploy
description: 构建 MoonTV 项目并部署到 Cloudflare Pages
---

# 部署 MoonTV 到 Cloudflare Pages

将当前 MoonTV 项目构建并部署到 Cloudflare Pages。

## 步骤

1. 运行构建命令：

   ```bash
   pnpm build
   ```

2. 部署到 Cloudflare Pages：

   ```bash
   npx wrangler pages deploy .vercel/output/static --project-name moontv --commit-dirty=true
   ```

3. 部署完成后，验证站点是否正常：
   ```bash
   curl -s https://alumo.dpdns.org/api/server-config
   ```
   预期返回：`{"SiteName":"MoonTV","StorageType":"d1"}`

## 项目信息

- Cloudflare Pages 项目名：moontv
- 默认域名：moontv-29q.pages.dev
- 自定义域名：alumo.dpdns.org
- D1 数据库绑定：DB → moontv-db (d8b70d69-d660-43c8-be58-b1b149c2b2a6)
- 环境变量：NEXT_PUBLIC_STORAGE_TYPE=d1, USERNAME/PASSWORD (secrets)
- 兼容性：nodejs_compat, 2024-09-23

## 注意事项

- 构建前会自动运行 `pnpm gen:runtime` 和 `pnpm gen:manifest` 生成配置文件
- 如果只修改了环境变量或 D1 绑定（通过 Cloudflare Dashboard/API），需要重新部署一次才能生效
- `--commit-dirty=true` 用于忽略未提交更改的警告
