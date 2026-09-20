# OpenSShan 供应商目录

本目录可以整体复制为独立 Git 仓库，不依赖 OpenSShan 源码或 npm 安装。GitHub 维护源文件，Gitee 接收同一份已签名发布文件。已配置 GitHub 主仓库 `wdmywm3/opensshan-provider-catalog` 和 Gitee 镜像 `wdmywm/opensshan-provider-catalog`，应用发布地址与受信任公钥保存在 `distribution.json`。

## 文件与维护

| 文件 | 用途 |
| --- | --- |
| `providers.json` | 供应商预设、默认模型、接口地址和供应商标识映射 |
| `models.json` | 模型能力参数，包括上下文、输出限制、输入类型和思考档位 |
| `metadata.json` | 目录协议版本、递增发布版本和生成时间 |
| `distribution.json` | 应用使用的 GitHub／Gitee 发布地址和受信任公钥 |
| `contract.cjs` | 数据与签名校验，不允许目录定义新的执行协议 |
| `release.cjs` | 校验源文件并生成单个已签名发布文件 |
| `.github/workflows/publish.yml` | 校验、签名、发布至 GitHub，以及可选的 Gitee 镜像 |

新增供应商时填写应用已有协议类型。模型 ID、API 地址和能力参数应以官方文档为依据；可在供应商条目写入 `sources` 和 `verifiedAt`。新增模型不能仅凭名称猜测上下文或输出上限。每次修改数据都应提高 `metadata.json.version`，并更新 `generatedAt`。同版本不同内容会被应用和发布流程拒绝。

目录不会包含账号、密钥、登录代码或可执行插件。新的协议、鉴权流程或请求字段仍需应用提供支持。目录中收录某个模型不代表当前账号有调用权限；账号实际可用列表仍由供应商接口获取。

## 第一次发布

1. 将本目录的内容复制到新仓库根目录，默认分支设为 `main`。GitHub 与 Gitee 的仓库名可以不同；应用匿名下载目录，因此发布地址必须可公开读取。
2. 使用 Node.js 22 或更新版本运行 `node release.cjs --check`。
3. 在安全的本机目录运行 `node keygen.cjs`。把 `signing-private.pem` 内容保存到 GitHub Actions secret `CATALOG_SIGNING_KEY`；私钥不要提交到 Git。公钥可公开。
4. 如需 Gitee 镜像，设置 GitHub Actions variable `GITEE_REPOSITORY`，值为 `用户名/仓库名`；设置 secrets `GITEE_USERNAME` 和 `GITEE_TOKEN`。令牌需要该仓库的写入权限。
5. 推送 `main` 或手动运行发布工作流。发布分支是 `catalog`，文件是 `directory.json`。镜像步骤复制签名后的原文件，不重新签名；镜像失败会令工作流失败，可重跑。
6. 新部署时，在应用随包提供的 `distribution.json` 配置实际地址和公钥，再发布一次支持在线目录的应用版本。本仓库已经填写当前部署的地址和公钥。

```json
{
  "sources": [
    "https://raw.githubusercontent.com/OWNER/REPO/catalog/directory.json",
    "https://gitee.com/OWNER/REPO/raw/catalog/directory.json"
  ],
  "publicKeys": {
    "catalog-release": "-----BEGIN PUBLIC KEY-----\n公钥内容\n-----END PUBLIC KEY-----\n"
  }
}
```

以上是占位示例，不能直接作为生产配置。私钥和访问令牌不能写入 `distribution.json`。受信任地址和公钥随应用分发，不从未验证的在线目录接受新公钥。

完成首次接入后，日常新增模型、修改预设和能力参数只需发布目录，不需更新应用。更换签名信任根、目录协议或应用不支持的调用协议，仍需更新应用。发布工作流只同步 Gitee 的 `catalog` 分支；源文件以 GitHub 的 `main` 为准。

## 应用如何更新

应用在启动后以及每六小时通过现有网络与命令执行边界检查目录。设置中的“供应商目录”可手动更新、查看状态和回退上一版。

镜像并行下载，应用校验 Ed25519 签名、大小、结构和版本后选择最新有效版本；旧镜像不能降低已接受的最高版本。同一最新版本出现不同内容时拒绝更新。目录选择写入应用作用域账本，完整内容保存为不可变对象；重启后从账本恢复，不依赖第二份缓存状态文件。

更新不会改写已保存的 API 地址、密钥或模型选择。模型能力与自动限制重新解析；手动限制继续优先。供应商列表接口返回的上下文／输出参数会被保留，未返回的字段由目录补充。失败时继续使用当前目录，首次离线使用随包目录。

回退会暂停自动同步，避免下一次定时检查立即覆盖回退结果。再次手动更新会恢复同步；防降级记录仍然保留。

## 验证范围

已验证 GitHub Actions 签名发布、Gitee 自动推送，以及两端匿名下载、签名和文件哈希一致性。应用下载链路的联网检查也已通过；尚未验证各供应商账号调用或生成新版 Windows 安装包。
