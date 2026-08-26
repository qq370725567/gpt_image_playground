# sub2api API 接口文档

> 本文档基于 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 源码整理（Go + Gin，路由前缀 `/api/v1`）。
> 不同 fork 可能存在路径差异（如 `/api/v1/keys` 与 `/api/v1/api-keys`），对接时以实际部署为准。

## 1. 概述与本项目集成

sub2api 是一站式开源中转服务，将 Claude、OpenAI、Gemini、Grok 等订阅统一接入为 OpenAI 兼容 API。用户登录后可在面板中创建多个 API Key（每个 Key 可绑定一个分组 group，分组决定供应商平台）。

**本项目（gpt-image-playground）的集成方式**：sub2api 菜单以 iframe/新窗口方式打开本应用，URL 携带：

```
?src_url={sub2api 页面地址}&user_id={用户ID}&token={JWT}&ui_mode=embedded&...
```

- `src_url`：sub2api 页面地址（如 `https://sub2.example.com/custom/app-id`），本应用先提取其 origin（`https://sub2.example.com`），再据此：
  1. 推导管理接口地址（`{origin}/api/v1/keys`）拉取当前用户的 Key 列表，用于 API Key 弹窗下拉选择；
  2. 自动替换图像/文本 profile 的默认 API URL（`{origin}/v1`，仅当当前仍是默认 OpenAI 地址时才替换）。
- 仍兼容旧版 `src_host` 参数。
- `user_id` / `token`：sub2api 用户标识与登录态 JWT（管理接口认证用，JWT 中本身含 `user_id`）。

相关代码：

| 文件                                   | 说明                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| `src/lib/sub2apiKeys.ts`               | 解析 URL 参数、请求 `/api/v1/keys`、防御性解析并过滤 |
| `src/components/ApiKeyPromptModal.tsx` | 弹窗下拉选择 Key（仅 OpenAI 供应商）                 |
| `src/lib/urlSettings.ts`               | `src_url` 提取 origin 后替换 profile API URL（补 `/v1`） |

## 2. 通用约定

### 2.1 Base URL

- 管理接口（面板 API）：`https://{host}/api/v1/...`
- 网关接口（OpenAI 兼容）：`https://{host}/v1/...`

### 2.2 认证

管理接口使用 **JWT Bearer** 认证（`jwt_auth.go` 中间件，仅接受 Authorization 头，不支持 query/cookie 传 token）：

```
Authorization: Bearer <access_token>
```

JWT 主要 claims：`user_id`、`email`、`role`、`token_version`（改密后失效）、`exp`、`iat` 等。
用户身份一律从 token 解析，**不依赖 query 参数**（`user_id` 参数仅作冗余/校验用）。

认证失败返回 `401`，常见 reason：

| reason                             | 含义                        |
| ---------------------------------- | --------------------------- |
| `UNAUTHORIZED`                     | 缺少 Authorization 头       |
| `INVALID_AUTH_HEADER`              | 头格式不是 `Bearer {token}` |
| `EMPTY_TOKEN`                      | token 为空                  |
| `TOKEN_EXPIRED`                    | token 已过期                |
| `INVALID_TOKEN`                    | token 非法                  |
| `TOKEN_REVOKED`                    | token 已吊销（密码已修改）  |
| `USER_NOT_FOUND` / `USER_INACTIVE` | 用户不存在 / 账户未激活     |

### 2.3 响应封装

所有管理接口统一返回 `response.Response` 结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误响应（HTTP 状态码与 `code` 一致）：

```json
{
  "code": 401,
  "message": "Unauthorized",
  "reason": "TOKEN_EXPIRED",
  "metadata": {}
}
```

### 2.4 分页格式

列表接口使用分页包装，`data` 为：

```json
{
  "items": [],
  "total": 10,
  "page": 1,
  "page_size": 20,
  "pages": 1
}
```

分页参数：`page`（默认 1）、`page_size` 或 `limit`（默认 20，**最大 1000**）。

### 2.5 常见错误码（Key 相关）

| 错误                                                                                 | 含义             |
| ------------------------------------------------------------------------------------ | ---------------- |
| `API_KEY_NOT_FOUND`                                                                  | Key 不存在       |
| `API_KEY_EXPIRED`                                                                    | Key 已过期       |
| `API_KEY_QUOTA_EXHAUSTED`                                                            | Key 配额耗尽     |
| `API_KEY_RATE_5H_EXCEEDED` / `API_KEY_RATE_1D_EXCEEDED` / `API_KEY_RATE_7D_EXCEEDED` | 滑动窗口限流超限 |

## 3. API Key 管理（本项目正在使用）

### 3.1 获取 Key 列表（重点）

```
GET /api/v1/keys?page=1&page_size=1000
Authorization: Bearer <JWT>
```

查询参数（均可选）：

| 参数                  | 说明                                      |
| --------------------- | ----------------------------------------- |
| `page`                | 页码，默认 1                              |
| `page_size` / `limit` | 每页数量，默认 20，最大 1000              |
| `search`              | 按名称/Key 模糊搜索（最长 100 字符）      |
| `status`              | 按状态过滤（`active` / `disabled` / ...） |
| `group_id`            | 按分组过滤                                |
| `sort_by`             | 排序字段，默认 `created_at`               |
| `sort_order`          | `asc` / `desc`，默认 `desc`               |

**响应示例**（已脱敏）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": 1001,
        "user_id": 42,
        "key": "sk-example1234567890abcdef1234567890abcdef1234567890abcdef",
        "name": "示例 Key",
        "group_id": 7,
        "status": "active",
        "ip_whitelist": null,
        "ip_blacklist": null,
        "last_used_at": "2026-01-15T10:00:00+08:00",
        "quota": 0,
        "quota_used": 0,
        "expires_at": null,
        "created_at": "2026-01-01T08:30:00+08:00",
        "rate_limit_5h": 0,
        "rate_limit_1d": 0,
        "rate_limit_7d": 0,
        "group": {
          "id": 7,
          "name": "OpenAI 余额",
          "platform": "openai",
          "rate_multiplier": 1,
          "is_exclusive": true
        }
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 1000,
    "pages": 1
  }
}
```

**APIKey 字段说明**：

| 字段                            | 类型     | 说明                                                  |
| ------------------------------- | -------- | ----------------------------------------------------- |
| `id`                            | int64    | Key ID                                                |
| `user_id`                       | int64    | 所属用户                                              |
| `key`                           | string   | **实际 Key 值**（`sk-` 前缀），下拉选择时作为 value   |
| `name`                          | string   | Key 名称                                              |
| `group_id`                      | int64?   | 绑定分组 ID（null = 不绑定分组）                      |
| `status`                        | string   | `active` / `disabled` / `expired` / `quota_exhausted` |
| `ip_whitelist` / `ip_blacklist` | string[] | IP 白/黑名单（CIDR）                                  |
| `last_used_at`                  | string?  | 最后使用时间                                          |
| `quota` / `quota_used`          | float64  | 配额上限 / 已用（USD，0 = 不限）                      |
| `expires_at`                    | string?  | 过期时间（null = 永不过期）                           |
| `rate_limit_5h/1d/7d`           | float64  | 滑动窗口限流上限（0 = 不限）                          |
| `usage_5h/1d/7d`                | float64  | 对应窗口已用量                                        |
| `group`                         | object?  | 内嵌分组信息，**`group.platform` 即供应商平台**       |

**group.platform 常见取值**：`openai`（含 Codex）、`anthropic`（Claude）、`gemini`、`grok`、`antigravity` 等。

**本项目过滤规则**（`extractSub2ApiKeyItems`）：仅保留 `status === 'active'` 且 `group.platform === 'openai'` 的 Key；`group` 为 null/缺失（不绑定分组）的 Key 无法判断供应商，予以保留。

**fork 兼容**：部分 fork 使用 `/api/v1/api-keys` 路径，本应用在 `/api/v1/keys` 返回 404 时自动回退重试该路径。

### 3.2 创建 Key

```
POST /api/v1/keys
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "name": "新 Key",
  "group_id": 54,
  "custom_key": "sk-自定义key(可选,需≥16字符,取决于系统设置)",
  "ip_whitelist": [],
  "ip_blacklist": [],
  "quota": 0,
  "expires_in_days": 30,
  "rate_limit_5h": 0,
  "rate_limit_1d": 0,
  "rate_limit_7d": 0
}
```

### 3.3 获取单个 Key

```
GET /api/v1/keys/:id
Authorization: Bearer <JWT>
```

返回单个 APIKey 对象（含所有权校验，非本人 Key 返回 403）。

### 3.4 更新 Key

```
PUT /api/v1/keys/:id
Authorization: Bearer <JWT>
```

```json
{
  "name": "改名",
  "status": "active",
  "ip_whitelist": [],
  "ip_blacklist": [],
  "quota": 0,
  "expires_at": "2026-12-31T23:59:59+08:00",
  "reset_quota": true,
  "rate_limit_5h": 0,
  "rate_limit_1d": 0,
  "rate_limit_7d": 0,
  "reset_rate_limit_usage": true
}
```

`status` 仅允许 `active` / `inactive`。

### 3.5 删除 Key

```
DELETE /api/v1/keys/:id
Authorization: Bearer <JWT>
```

删除并记录审计日志。

### 3.6 Key 每日用量

```
GET /api/v1/user/api-keys/:id/usage/daily
Authorization: Bearer <JWT>
```

## 4. 认证接口

| 方法 | 路径                                               | 说明                                                       |
| ---- | -------------------------------------------------- | ---------------------------------------------------------- |
| POST | `/api/v1/auth/register`                            | 注册                                                       |
| POST | `/api/v1/auth/login`                               | 登录，返回 `access_token` / `refresh_token` / `expires_in` |
| POST | `/api/v1/auth/login/2fa`                           | 双因素登录                                                 |
| POST | `/api/v1/auth/refresh`                             | 刷新 token                                                 |
| POST | `/api/v1/auth/logout`                              | 登出                                                       |
| POST | `/api/v1/auth/send-verify-code`                    | 发送验证码                                                 |
| POST | `/api/v1/auth/forgot-password` / `reset-password`  | 忘记/重置密码                                              |
| GET  | `/api/v1/auth/oauth/{provider}/start` / `callback` | OAuth 登录（github/google/linuxdo/wechat/oidc/dingtalk）   |

**登录响应**（`AuthResponse`）：

```json
{
  "access_token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "expires_in": 86400,
  "token_type": "Bearer",
  "user": {
    "id": 42,
    "email": "user@example.com",
    "username": "user",
    "role": "user",
    "balance": 10.5,
    "status": "active",
    "allowed_groups": [7]
  }
}
```

**User 对象主要字段**：`id`、`email`、`username`、`role`（`user` / `admin`）、`balance`（余额 USD）、`concurrency`、`status`、`allowed_groups`（可用分组 ID 列表）、`total_recharged` 等。

## 5. 用户接口（需 JWT）

| 方法     | 路径                        | 说明                         |
| -------- | --------------------------- | ---------------------------- |
| GET      | `/api/v1/user/profile`      | 用户资料（含余额）           |
| PUT      | `/api/v1/user`              | 更新资料                     |
| PUT      | `/api/v1/user/password`     | 修改密码                     |
| GET      | `/api/v1/auth/me`           | 当前用户资料、余额、认证绑定 |
| GET      | `/api/v1/user/aff`          | 推广信息                     |
| POST     | `/api/v1/user/aff/transfer` | 推广配额转入                 |
| GET/POST | `/api/v1/keys/...`          | 见上文第 3 节                |
| GET      | `/api/v1/groups/available`  | 当前用户可用分组列表         |
| GET/POST | `/api/v1/redeem/...`        | 卡密兑换                     |
| GET/POST | `/api/v1/announcements/...` | 公告                         |
| GET      | `/api/v1/settings/public`   | 公开系统设置（**无需认证**） |

## 6. 网关接口（OpenAI 兼容，用 API Key 而非 JWT）

网关路由注册在 `/v1` 前缀，认证使用 API Key（`Authorization: Bearer sk-...`、`x-api-key` 头均可）。

| 方法 | 路径                        | 说明                     |
| ---- | --------------------------- | ------------------------ |
| POST | `/v1/chat/completions`      | Chat Completions         |
| POST | `/v1/responses`（及子路径） | Responses API            |
| GET  | `/v1/responses`             | Responses WebSocket 流式 |
| POST | `/v1/images/generations`    | 图像生成                 |
| POST | `/v1/images/edits`          | 图像编辑                 |
| GET  | `/v1/models`                | 模型列表                 |
| GET  | `/v1/usage`                 | 用量统计                 |

其他兼容前缀：`/v1beta`（Gemini）、`/backend-api/codex`（Codex CLI 直连）、`/antigravity/v1`（Antigravity）。
不支持平台会返回 `{"error": {"type": "not_found_error", "message": "Images API is not supported for this platform"}}` 之类的错误——即 Key 绑定的分组平台不支持该端点时调用失败。

## 7. 本项目完整调用链（菜单跳转场景）

```
sub2api 菜单点击 → 打开 https://{app}/?src_url=https://sub2.example.com/custom/app-id&user_id=42&token={JWT}&...
                    │
                    ├─ urlSettings.ts：src_url → 提取 origin → 图像/文本 profile baseUrl = https://sub2.example.com/v1（仅默认地址才替换）
                    │
                    └─ 启动检测到缺少 API Key → ApiKeyPromptModal
                       └─ sub2apiKeys.ts：GET {origin}/api/v1/keys?page=1&page_size=1000
                          （Authorization: Bearer {token}，404 时回退 /api/v1/api-keys）
                          → 过滤 status=active 且 group.platform=openai
                          → 下拉显示 名称（sk-xxxx•••xxxx），选中值即完整 Key
                          → 保存到 profile.apiKey → 后续请求走 {origin}/v1/images/generations 等
```

## 8. 常用 curl 示例

```bash
# 获取 Key 列表（本项目核心接口）
curl -H "Authorization: Bearer {JWT}" \
  "https://{host}/api/v1/keys?page=1&page_size=1000"

# 获取用户资料
curl -H "Authorization: Bearer {JWT}" \
  "https://{host}/api/v1/user/profile"

# 获取可用分组
curl -H "Authorization: Bearer {JWT}" \
  "https://{host}/api/v1/groups/available"

# 用 API Key 调用图像生成（网关）
curl -H "Authorization: Bearer sk-..." -H "Content-Type: application/json" \
  -d '{"model": "gpt-image-2", "prompt": "a cat", "n": 1}' \
  "https://{host}/v1/images/generations"
```

## 9. 注意事项

- 管理接口（`/api/v1/*`）一律用 **JWT**；网关接口（`/v1/*`）一律用 **API Key**，两者不要混淆。
- `page_size` 最大 1000，拉全量 Key 时传 `page_size=1000` 即可，一般无需翻页。
- Key 的可用范围由其绑定分组决定：即使 Key 状态为 `active`，分组平台不支持某端点时调用也会失败。
- 不同 fork 的路由可能不同（如 `/api/v1/keys` vs `/api/v1/api-keys`），建议对接时先用 `curl` 实测一次。
