<div align="center">

# ACoffee

**在两人中间，喝一杯好咖啡。**

输入两到三个地址，ACoffee 帮你们找一家评分高、对每个人都公平的咖啡馆——
按每个人的实际通勤时间来选，而不只是地图上的中点。

[**acoffee.com**](https://acoffee.com) · 免费 · 无需注册 · 开源

[English](README.md) · [日本語](README.ja.md) · 简体中文

<sub>ACoffee 是一个独立项目，与 Buy Me a Coffee（buymeacoffee.com）没有任何关联。</sub>

<img src="public/og/home-zh.png" alt="ACoffee — 在两人中间，喝一杯好咖啡。" width="720" />

</div>

## 为什么做这个

"去哪见面？"最后往往是一个人多走一倍的路。地图上的中点也帮不上什么忙：它可能落在公园、河上，或者某个人要换乘好几次的地方。ACoffee 在大家的中间一带搜索，再按路程分摊得是否均匀，给真实的咖啡馆排序。

## 功能

- **两到三人的公平见面地点。** 按每个人乘坐公共交通的实际时间排序，并用公平分显示路程分摊得有多均匀。
- **搜索模式：** 🤝 公平 · ⚡ 最快（总路程最短） · ✨ 氛围 · 🌙 安静 · 🕐 现在。
- **按见面时间筛选。** 选"周六下午 3 点"，卡片会显示每家店那时是否营业。按咖啡馆当地时间判断，所以提前规划外地的见面也没问题。
- **评论摘要。** 从 Google 评论里总结出两行：氛围、座位、Wi-Fi、人多不多。
- **发送提案。** 把咖啡馆和时间做成一个链接发给朋友，对方可以接受、调整时间，或换下一家。双方都不需要注册。
- **聪明的地址识别。** 像"Central Park, New York"这样有歧义的地名，会在另一个人附近找匹配，而不是用地理编码在全球排第一的结果。
- **附近的咖啡馆。** 找你当前位置附近评分最高的咖啡馆。
- **咖啡护照。** 给去过的咖啡馆盖章，写笔记、打分，查看你的咖啡地图和连续打卡。不登录也能用，登录后多设备同步。
- **个人公开主页** `acoffee.com/yourname`（可选），可以展示推荐的咖啡馆，别人一键约你喝咖啡。
- 支持 **English、日本語、简体中文**，可以作为 PWA 安装。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, TypeScript, Vite, CSS Modules, PWA (vite-plugin-pwa) |
| 后端 | Cloudflare Pages Functions |
| 数据 | Cloudflare D1 (SQLite) + Drizzle ORM · KV（API 缓存） · R2（头像、店铺照片） |
| 登录 | Better Auth — 邮箱魔法链接（Resend），可选 Google 登录 |
| 地图 | Google Maps Platform — Maps JS, Places (New), Geocoding, Routes |
| AI | DeepSeek V4 Flash，通过 Vercel AI SDK 调用（评论摘要） |

## 快速开始

需要：Node.js 22（与 CI 相同的版本）、一个 Google Maps Platform API key。如果要跑 API，还需要 Wrangler CLI（已包含在开发依赖里）。

```bash
git clone https://github.com/nomadcafe/acoffeemeetup.git
cd acoffeemeetup
npm install

cp .env.example .env              # 浏览器端的 key（VITE_*）
cp .dev.vars.example .dev.vars    # wrangler 用的服务端密钥

# 创建本地 D1 数据表
npx wrangler d1 migrations apply acoffee-dev --local
```

然后二选一：

```bash
npm run dev        # 只跑前端（Vite）。搜索、地图、护照都能用，/api 不能用
npm run pages:dev  # 前端 + API：:5173 的 Vite 会把 /api 转发到 :8788 的 wrangler
```

打开 **http://localhost:5173**。如果你的 Maps key 限制了 HTTP 来源，记得允许 `localhost:5173`。

### 环境变量

**浏览器端（`.env`）**

| 名称 | 必填 | 用途 |
| --- | --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | 是 | Maps JS, Places (New), Geocoding |
| `VITE_GOOGLE_MAPS_MAP_ID` | 建议 | 显示地图标记（Advanced Markers）需要 |
| `VITE_AUTH_ENABLED` | 否 | 设为 `true` 开启登录和护照同步 |
| `VITE_GA_MEASUREMENT_ID` | 否 | Google Analytics 4 |

**服务端（本地用 `.dev.vars`，生产环境用 Cloudflare Pages 的环境变量）**

| 名称 | 必填 | 用途 |
| --- | --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | 通勤时间、照片需要 | Routes, Places, Geocoding 用的服务端 key（没设置会退回用浏览器端 key） |
| `DEEPSEEK_API_KEY` | 评论摘要需要 | 评论摘要；可用 `AI_SUMMARY_MODEL` 换模型 |
| `AUTH_SECRET`, `AUTH_BASE_URL` | 登录需要 | Better Auth 的会话签名和回调地址 |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | 登录需要 | 发送魔法链接和预约邮件 |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | 否 | Google 登录 |
| `CRON_SECRET` | 否 | 保护定时清理接口 |
| `ROUTES_DAILY_ELEMENT_CAP`, `PLACE_PHOTO_DAILY_CAP` | 否 | 公开 Google 代理接口的每日费用上限（默认 10,000 / 2,000） |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（只有前端） |
| `npm run pages:dev` | Vite + `wrangler pages dev`（前端和 API） |
| `npm run build` | 类型检查并构建到 `dist/` |
| `npm run typecheck` | 检查前端和 Pages Functions 的类型 |
| `npm run lint` | ESLint |

## 目录结构

```
src/            React 应用 — components、context（应用 + 多语言）、i18n/locales（en / ja / zh）、utils
functions/      Cloudflare Pages Functions
  api/          REST 接口（places、ai、auth、account、passport、proposals、bookings 等）
  _lib/         登录、D1 表结构和迁移、Google Maps 客户端、限流、费用上限
  _middleware.ts  按语言输出 SEO / 链接预览标签、个人主页的 Open Graph
public/         静态文件、_headers（CSP）、分享图
```

## 部署

项目运行在 Cloudflare Pages 上（构建命令 `npm run build`，输出目录 `dist/`）。绑定在 `wrangler.toml` 里声明：`DB`（D1）、`ROUTES_CACHE`（KV）、`AVATARS` 和 `PLACE_PHOTOS`（R2）。在 Pages 后台设置上面的服务端变量，然后给生产库执行迁移：

```bash
npx wrangler d1 migrations apply <your-prod-db> --remote --env production
```

建议在你自己的 Google Cloud 项目里设好 Places API (New) 的每日配额（`GetPlaceRequest`、`SearchNearbyRequest`）和账单预算提醒，防止费用失控。

## 参与贡献

欢迎提 Issue 和 Pull Request。提 PR 之前请先跑 `npm run lint`、`npm run typecheck` 和 `npm run build`，CI 也会跑这三项。

## 许可证

[MIT](LICENSE) © nomadcafe
