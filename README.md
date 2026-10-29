# AI 验房师 · AI Home Inspector

> 独立验房师的 AI 大脑与现场工具：**纯端侧**运行、数据不出手机、大模型 BYOK 自配、本地 RAG 知识库、报告长图一键导出。

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-WeChat%20MiniProgram-07C160.svg)](#)
[![Cloud](https://img.shields.io/badge/cloud-none%20%C2%B7%20100%25%20on--device-brightgreen.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**纯端侧架构**：数据全部存用户手机本地，大模型由用户自申请 API Key 配置，不依赖任何云端服务。

## 导入方法
1. 打开微信开发者工具
2. 导入项目 → 选择本文件夹
3. AppID：填你自己的正式 AppID（当前 `project.config.json` 里是占位符 `wxYOUR_APPID_HERE`）
   - 用测试号也能编译预览，但**接口调用会失败**（域名未登记）
4. 编译运行

> 若未替换 AppID，小程序启动时会弹出「尚未配置正式 AppID」提示（仅开发版/体验版可见，不影响正式版用户）。

## 架构原则（纯端侧）
- **模型是大脑，小程序是骨架和记忆**：AI 负责对话推理，小程序固化流程、存储可信知识库、管理合规文件、记录用户档案
- **数据不出手机**：报告、客户档案、经验库、签名全部存本地 Storage
- **大模型自配置**：用户在「我的 → 大模型接口」填入自己申请的 API Key（通义千问/DeepSeek/智谱/豆包/文心），可测试连通
- **本地 RAG 优先**：内置 23 部国标规范、150 个案例、52 个术语、55 项检测方法；知识库命中的直接回答，未命中的才调用大模型
- **无云端依赖**：不初始化微信云开发，无云函数、无云数据库（项目内已无 `cloudfunctions` 目录）。将来如需数据收集再另行规划
- **本地文件持久化**：照片/签名/Logo 落库前用 `utils/fileStore.js` 保存，避免临时文件过期后报告变空白
- **未完成任务保护**：新建任务会先把当前任务暂存到「未完成任务」，冷启动也会自动恢复草稿

## 功能
- 现场检测：18 类别、多房间引导式流程、问题/关注标记、拍照留证、AI 识别问题
- 判断分级：问题风险分级（高风险/普通/关注）+ 多问题关联分析规则引擎
- 报告输出：完整报告文本、改造后的**报告长图导出**（全量问题+现场照片+双方签字+防伪页脚，自动分页）、整改通知单
- 合规风控：报告防伪码（业主可核验）、免责声明、验房师签名承诺、资质展示
- 业主交付（导出制）：无云端，报告以长图/文本发给业主；业主签字为**现场在验房师手机上手写**并写入报告
- 复检闭环：整改后复检跟踪、前后对比
- 经验案例：案例经验库（小区×问题自动积累）
- 客户经营：电子名片（canvas 生成可保存可分享）、客户档案 CRM（跟进状态/备注）
- 我的：个人资质配置、大模型接口配置（多模型预设+测试）、本地数据备份、使用反馈、API 申请指南

## 配置AI
我的 → 大模型接口 → 选择模型或手动填接口地址 + API Key → 测试 → 保存
- 通义千问：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions（qwen-plus / qwen-vl-plus）
- DeepSeek：https://api.deepseek.com/chat/completions
- 智谱GLM：https://open.bigmodel.cn/api/paas/v4/chat/completions
- 豆包：https://ark.cn-beijing.volces.com/api/v3/chat/completions
- 文心一言：https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions

API Key 申请入口见「我的 → API 申请指南」，每个模型都带直达申请页。

## 数据存储键（本地）
reports / clients / myCases / learnedNos / userInfo / signature / ownerSignature / llmConfig / currentTask / taskDraft / unfinishedTasks / asrConfig / region / fieldMode / checkMode / toolPacked / dataConsent / agreedPolicy / feedback

> 另有内部缓存键（可随时清空，不影响业务）：`ragCache_v3`（RAG 检索结果 24h 缓存，超 50 条自动淘汰）。

> 照片、签名、Logo 均通过 `utils/fileStore.js` 调用 `wx.saveFile` 持久化到本地用户目录。
> 微信的 `tempFilePath` 会被系统在数天内清理，**落库前必须持久化**，否则历史报告里的照片和签名会变成空白。
>
> 所有写存储应走 `app.safeSet()`：本机存储上限 10MB，超限时 `setStorageSync` 会抛异常，
> 未经保护会直接中断当前操作（表现为"点了没反应"）。

## 报告导出（核心交付链路）
```
pages/report/report.js  exportImage()
   ↓
utils/reportImage.js  render(ctx, { layoutOnly: true })              → 先量出真实总高度
   ↓
utils/reportImage.js  render(ctx, { layoutOnly: false, offsetY, ...}) → 再逐页渲染
   ↓
utils/canvasText.js   中文自动换行 / 截断
```
- **必须两遍绘制**：先量高再渲染，否则长文本会被画布裁掉。
- **必须分页**：单张 canvas 的设备像素高度不能超过约 8000（否则真机 OOM/报错），
  导出逻辑按 `8000 / dpr` 计算每页逻辑高度自动分页，每页脚注「第 N/M 页」。
- **照片必须画进去**：业主靠图佐证，漏画等于证据缺失。
- 新增任何报告字段时，记得同步 `utils/reportImage.js` 的绘制，否则该字段不会出现在长图里。

## 关键内部约定（改代码前必读）
- **检查项状态只有三种**：`'ok'`（合格）/ `'mid'`（关注）/ `'bad'`（问题）。
  AI 返回的风险等级是 `'high'|'mid'|'low'`，两者不能混用；换算见 `utils/voiceParser.js` 的 `RISK_TO_STATUS`。
- **照片统一存 `{url, shotAt}` 对象**，传给 `wx.previewImage` 前必须先取出 `url`。
- **大模型配置统一走 `utils/llmConfig.js`**，不要在页面里直接读写 storage，否则扁平结构/多模型结构会互相覆盖。
- **报告只通过 `app.pushReport()` 入库**，它内部已包含经验库沉淀，不要再单独调 `learnFromReport`。
- **新建任务前必须暂存旧任务**（`app.stashUnfinishedTask()`），当前任务只能有一份，静默覆盖 = 整单数据丢失。

## 上线前提醒
- [ ] **替换 AppID**：`project.config.json` 中的 `wxYOUR_APPID_HERE` → 正式 AppID
- [ ] **配置服务器域名**：详见 [服务器域名配置.md](服务器域名配置.md)（request 域名 + uploadFile 域名）
- [ ] **真机验证**：长图导出（多页）、照片加载、麦克风/相册权限、大模型与 ASR 连通
- [ ] 软著申请（纯软件，软著即可，无需专利）
- [ ] 品牌名与 Logo 商标注册

> 域名不登记 → 正式版所有 AI/语音功能报 `url not in domain list`。
> 本地调试可在开发者工具勾选「不校验合法域名」，但**该选项对正式版无效**。
---

## 项目结构

```
AI验房师/
├── app.js / app.json / app.wxss      小程序入口、路由、全局样式
├── project.config.json               开发者工具配置（AppID 为占位符）
├── pages/                            页面（检测流程、报告、客户、我的）
├── custom-tab-bar/                   自定义底部导航
├── components/                       可复用组件
├── assets/                           Logo 与字标
├── utils/
│   ├── inspectData.js                检测项与国标知识库（约 100 KB）
│   ├── rag.js                        本地 RAG 检索（命中优先，未命中才调模型）
│   ├── llmConfig.js                  大模型配置读写（唯一入口）
│   ├── aiEngine.js                   模型调用与提示词编排
│   ├── voiceParser.js                语音/文本 → 结构化检查项
│   ├── grade.js                      风险分级与关联分析规则引擎
│   ├── reportImage.js                长图渲染（两遍绘制 + 自动分页）
│   ├── canvasText.js                 中文换行与截断
│   ├── fileStore.js                  照片/签名持久化
│   ├── normMatch.js                  规范条文匹配
│   └── asrEngine.js                  语音识别接入
└── *.md                              说明文档（上线清单、域名配置、功能说明）
```

## 隐私说明（重要）

本项目从设计上就不收集任何用户数据：

- 无服务端、无云函数、无云数据库，**没有任何一处会把报告上传到服务器**
- 报告、客户档案、经验库、签名、现场照片全部写入小程序本地 Storage 与本地文件
- 唯一的外部请求是用户自己填写的第三方大模型接口（BYOK），Key 只存在本机
- 仓库中不含真实 AppID、不含任何 API Key、不含真实客户信息

> 数据备份由用户主动通过「我的 → 本地数据备份」导出，导出物只落在用户自己选择的位置。

## 许可证

本项目以 **GNU Affero General Public License v3.0（AGPL-3.0）** 发布，全文见 [LICENSE](LICENSE)。

这意味着：你可以自由使用、修改、分发本项目；但如果你把它改成在线服务提供给他人使用，**必须同样以 AGPL-3.0 公开你的修改**。如需闭源商用，请单独联系作者获取商业授权。

- 内置的国标条文、案例与术语库仅用于辅助判断，**不构成法定验收结论**
- 软著申请材料、签字件等个人材料不在本仓库中，也不会随开源分发

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全漏洞请走 [SECURITY.md](SECURITY.md) 的私密渠道。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

