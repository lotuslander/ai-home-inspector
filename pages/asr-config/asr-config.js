// pages/asr-config/asr-config.js - 语音引擎配置
const asr = require('../../utils/asrEngine.js');

const URL_PH = {
  dashscope: 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/recognition',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  custom: 'https://你的接口地址'
};
const MODEL_PH = {
  dashscope: 'paraformer-realtime-v2',
  openai: 'whisper-1',
  custom: '模型名'
};

Page({
  data: { form: { type: 'dashscope', apiUrl: '', apiKey: '', model: '' }, urlPh: URL_PH.dashscope, modelPh: MODEL_PH.dashscope, showGuide: false },

  toggleGuide() { this.setData({ showGuide: !this.data.showGuide }); },

  onShow() {
    const c = asr.getConfig();
    if (c) {
      this.setData({ form: { type: c.type || 'dashscope', apiUrl: c.apiUrl || '', apiKey: c.apiKey || '', model: c.model || '' }, urlPh: URL_PH[c.type] || URL_PH.custom, modelPh: MODEL_PH[c.type] || MODEL_PH.custom });
    }
  },

  setType(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ 'form.type': t, urlPh: URL_PH[t] || URL_PH.custom, modelPh: MODEL_PH[t] || MODEL_PH.custom });
  },
  onUrl(e) { this.setData({ 'form.apiUrl': e.detail.value }); },
  onKey(e) { this.setData({ 'form.apiKey': e.detail.value }); },
  onModel(e) { this.setData({ 'form.model': e.detail.value }); },

  save() {
    const f = this.data.form;
    if (!f.apiUrl || !f.apiKey) { wx.showToast({ title: '请填写接口地址和Key', icon: 'none' }); return; }
    asr.saveConfig({ type: f.type, apiUrl: f.apiUrl.trim(), apiKey: f.apiKey.trim(), model: (f.model || '').trim() });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  // 测试接口：录3秒音频转写验证
  testAsr() {
    const f = this.data.form;
    if (!f.apiUrl || !f.apiKey) { wx.showToast({ title: '请先填配置再测试', icon: 'none' }); return; }
    asr.saveConfig({ type: f.type, apiUrl: f.apiUrl.trim(), apiKey: f.apiKey.trim(), model: (f.model || '').trim() });
    wx.showModal({ title: '测试方式', content: '点击确定后请说一句话（如"客厅墙面空鼓"），3秒后自动转写验证。', success: (m) => {
      if (!m.confirm) return;
      const rm = wx.getRecorderManager();
      wx.authorize({
        scope: 'scope.record',
        success: () => {
          wx.showLoading({ title: '请说话…' });
          rm.start({ duration: 3000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 32000 });
          rm.onStop((res) => {
            asr.transcribe(res.tempFilePath).then(r => {
              wx.hideLoading();
              wx.showModal({ title: '测试成功', content: '识别结果：' + (r.text || '（空）'), showCancel: false });
            }).catch(e => {
              wx.hideLoading();
              wx.showModal({ title: '测试失败', content: (e && e.msg) || '接口错误', showCancel: false });
            });
          });
        },
        fail: () => { wx.showToast({ title: '未授权麦克风', icon: 'none' }); }
      });
    }});
  },

  clearCfg() {
    const self = this;
    wx.showModal({ title: '清除配置？', content: '语音引擎Key将清除，可重新配置。', confirmColor: '#FF3B30', success: (m) => {
      if (m.confirm) { asr.clearConfig(); self.setData({ form: { type: 'dashscope', apiUrl: '', apiKey: '', model: '' }, urlPh: URL_PH.dashscope, modelPh: MODEL_PH.dashscope }); wx.showToast({ title: '已清除', icon: 'none' }); }
    }});
  }
});
