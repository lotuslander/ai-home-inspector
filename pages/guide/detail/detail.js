// 每个大模型的详细申请页
Page({
  data: {
    model: {}
  },
  onLoad(e) {
    const models = {
      qwen: {
        name: '阿里通义千问',
        url: 'https://dashscope.aliyun.com',
        steps: [
          '1. 电脑或手机浏览器打开 dashscope.aliyun.com',
          '2. 用支付宝/淘宝账号登录（不用下载App）',
          '3. 左侧菜单点「API-KEY」→「创建API-KEY」',
          '4. 复制那串 sk- 开头的 Key',
          '5. 回到小程序 → 我的 → 大模型接口 → 粘贴 Key'
        ],
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        model: 'qwen-vl-plus（看图）/ qwen-plus（纯文字）',
        free: '新用户赠送100万token，够验房用半年',
        tips: '推荐第一个申请这个，带看图能力，AI识别缺陷全靠它'
      },
      doubao: {
        name: '字节豆包',
        url: 'https://console.volcengine.com',
        steps: [
          '1. 打开 console.volcengine.com 注册',
          '2. 搜「豆包大模型」→ 开通服务',
          '3. 创建「推理接入点」→ 得到接入点ID',
          '4. 创建 API Key',
          '5. 回到小程序粘贴 Key 和接入点ID'
        ],
        endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        model: '你的接入点ID（ep-开头）',
        free: '新用户有赠送token',
        tips: '语音效果不错，纯文字问答也可以'
      },
      deepseek: {
        name: 'DeepSeek',
        url: 'https://platform.deepseek.com',
        steps: [
          '1. 打开 platform.deepseek.com 手机号注册',
          '2. 左侧「API Keys」→ 创建 → 复制',
          '3. 回到小程序粘贴 Key'
        ],
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat',
        free: '注册送5元额度，很便宜',
        tips: '注意：不能看图，AI识别缺陷请用通义千问'
      },
      glm: {
        name: '智谱GLM',
        url: 'https://open.bigmodel.cn',
        steps: [
          '1. 打开 open.bigmodel.cn 手机号注册',
          '2. 左侧「API密钥」→ 新建 → 复制',
          '3. 回到小程序粘贴 Key'
        ],
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4-flash（免费）/ glm-4v-flash（看图免费）',
        free: 'glm-4-flash 完全免费',
        tips: '免费额度最多，适合刚开始试'
      },
      baidu: {
        name: '百度文心一言',
        url: 'https://qianfan.cloud.baidu.com',
        steps: [
          '1. 打开 qianfan.cloud.baidu.com 百度账号登录',
          '2. 开通「文心一言大模型」',
          '3. 创建 API Key + Secret Key',
          '4. 回到小程序配置'
        ],
        endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions',
        model: 'ernie-4.0 / ernie-3.5',
        free: '新用户有免费额度',
        tips: '国内大厂，稳定可靠'
      }
    };
    const m = models[e.model] || models.qwen;
    this.setData({ model: m });
    wx.setNavigationBarTitle({ title: m.name + ' 申请教程' });
  },
  copyUrl() {
    wx.setClipboardData({
      data: this.data.model.url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },
  copyEndpoint() {
    wx.setClipboardData({
      data: this.data.model.endpoint,
      success: () => wx.showToast({ title: '地址已复制', icon: 'success' })
    });
  }
});
