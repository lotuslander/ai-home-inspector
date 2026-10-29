# 安全策略

## 报告漏洞

请**不要**公开提 Issue。发送邮件至 `lotuslander@users.noreply.github.com`，或使用 GitHub 的 [Private vulnerability reporting](https://docs.github.com/zh/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)。

48 小时内确认，7 天内给出修复计划或说明。

## 本项目的威胁模型

这是一款**纯端侧**小程序，没有服务端，因此：

- 不存在「服务端被拖库」风险；用户报告、客户档案、签名、照片全部存在**用户自己的手机**本地存储
- 唯一的外部请求是用户自己配置的大模型接口（BYOK）
- 因此最需要防守的是**本地数据被误导出/误上传**，以及**密钥被写进代码**

## 密钥与隐私红线

仓库中**永远不应出现**：

- 真实 AppID（用 `wxYOUR_APPID_HERE` 占位）
- 任何 `sk-` / `AIza` / `Bearer` 形式的真实 API Key
- 真实客户姓名、手机号、身份证号、门牌地址、现场照片
- `.env`、`project.private.config.json`、软著申请表等含个人信息的文件

若发现历史提交里混入了上述内容，请按以下顺序处理：**先吊销凭据 → 再清理历史（`git filter-repo`）→ 最后强制推送**，不要只删文件了事。

## 支持范围

只维护 `main` 分支的最新版本。历史版本不单独出补丁。
