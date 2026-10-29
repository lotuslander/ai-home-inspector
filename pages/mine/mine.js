const app = getApp();
const llm = require('../../utils/llmConfig.js');
Page({
  data: {
    user: {}, reportCount: 0, monthCount: 0, monthRecheck: 0, llmOn: false,
    dataConsent: false, darkMode: false, defaultInitial: '验', topCats: [],
    llmUrl: '', llmKey: '', asrReady: false,
    communityCount: 0, myTop: []
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 1 });
    const h = app.getReports();
    let llm = false; let llmUrl = ''; let llmKey = '';
    try {
      const c = llm.getActive() || {};
      llm = !!(c.apiUrl && c.apiKey);
      llmUrl = c.apiUrl || ''; llmKey = c.apiKey || '';
    } catch (e) {}
    const now = new Date(); const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let mc = 0, mr = 0;
    const catCount = {};
    h.forEach(r => {
      if ((r.date || '').startsWith(ym)) mc++;
      (r.problems || []).forEach(p => {
        if (p.recheck !== 'fixed') mr++;
        const k = p.category || '其他';
        catCount[k] = (catCount[k] || 0) + 1;
      });
    });
    const totalCat = Object.values(catCount).reduce((a, b) => a + b, 0) || 1;
    const topCats = Object.keys(catCount).map(k => ({ name: k, count: catCount[k] }))
      .sort((a, b) => b.count - a.count).slice(0, 5)
      .map(c => ({ ...c, pct: Math.round(c.count / totalCat * 100) }));
    // 个人经验沉淀
    let communityCount = 0, myTop = [];
    try {
      const my = wx.getStorageSync('myCases') || {};
      communityCount = Object.keys(my).length;
      const agg = {};
      Object.values(my).forEach(c => Object.entries(c.problems || {}).forEach(([k, v]) => agg[k] = (agg[k] || 0) + v));
      myTop = Object.keys(agg).map(k => ({ name: k, count: agg[k] })).sort((a, b) => b.count - a.count).slice(0, 5);
    } catch (e) {}
    const u = app.globalData.userInfo;
    this.setData({
      user: u, reportCount: h.length, llmOn: llm, monthCount: mc, monthRecheck: mr,
      defaultInitial: (u.name || '验').slice(0, 1) || '验',
      dataConsent: wx.getStorageSync('dataConsent') === true,
      darkMode: wx.getStorageSync('fieldMode') === true,
      topCats, communityCount, myTop,
      region: wx.getStorageSync('region') || '',
      llmUrl, llmKey,
      asrReady: !!(wx.getStorageSync('asrConfig') || {}).apiUrl
    });
  },
  // 获取位置自动匹配地方标准
  detectRegion(){
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        let region = '全国通用';
        if(res.latitude > 40) region = '北方地区（北京/东北）';
        else if(res.latitude > 35) region = '华北地区';
        else if(res.longitude > 118 && res.latitude < 32) region = '华东地区（上海/江浙）';
        else if(res.longitude > 110 && res.latitude < 28) region = '华南地区（广东/深圳）';
        else if(res.latitude < 30) region = '南方地区';
        if (app.safeSet) app.safeSet('region', region); else wx.setStorageSync('region', region);
        this.setData({region});
        wx.showModal({title:'地区标准已匹配', content:'当前地区：'+region+'\n已自动加载对应地方标准规范。', showCancel:false});
      },
      fail: () => {
        wx.showModal({title:'无法获取位置', content:'请手动选择所在地区', editable:true, placeholderText:'如：北京/上海/广东', success:(r)=>{
          if(r.confirm && r.content){
            if (app.safeSet) app.safeSet('region', r.content); else wx.setStorageSync('region', r.content);
            this.setData({region:r.content});
          }
        }});
      }
    });
  },
  configLLM() {
    wx.navigateTo({ url: '/pages/llm-config/llm-config' });
  },
  goAsrConfig() {
    wx.navigateTo({ url: '/pages/asr-config/asr-config' });
  },
  goPolicies() {
    wx.navigateTo({ url: '/pages/policies/policies' });
  },
  onLlmUrl(e) { this.setData({ llmUrl: e.detail.value }); },
  onLlmKey(e) { this.setData({ llmKey: e.detail.value }); },
  async testLlm() {
    if (!this.data.llmUrl || !this.data.llmKey) { wx.showToast({ title: '请先填地址和Key', icon: 'none' }); return; }
    wx.showLoading({ title: '测试中...' });
    try {
      const res = await wx.request({
        url: this.data.llmUrl,
        method: 'POST',
        header: { 'Authorization': 'Bearer ' + this.data.llmKey, 'Content-Type': 'application/json' },
        data: { model: (llm.getActive() || {}).model || 'qwen-plus', messages: [{ role: 'user', content: '你好' }], max_tokens: 10 }
      });
      wx.hideLoading();
      if (res.statusCode === 200 || res.statusCode === 201) {
        wx.showToast({ title: '连接成功', icon: 'success' });
      } else {
        wx.showModal({ title: '连接失败', content: '错误码：' + res.statusCode + '\n请检查地址和Key', showCancel: false });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '连接失败', content: e.errMsg || '网络错误', showCancel: false });
    }
  },
  saveLlm() {
    if (!this.data.llmUrl || !this.data.llmKey) { wx.showToast({ title: '请填完整', icon: 'none' }); return; }
    llm.saveFlat({ apiUrl: this.data.llmUrl, apiKey: this.data.llmKey });
    this.setData({ llmOn: true });
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  clearLlmKey() {
    wx.showModal({
      title: '清除API Key',
      content: '将删除本机保存的大模型API Key，AI问答将仅使用本地知识库。确定清除吗？',
      confirmText: '清除', confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return;
        llm.clearAll();
        this.setData({ llmUrl: '', llmKey: '', llmOn: false });
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    });
  },
  exportData() {
    // 端侧备份：导出为可读文本（报告+客户+经验库），可粘贴到文档/云盘保存
    const reports = app.getReports();
    const clients = wx.getStorageSync('clients') || [];
    const myCases = wx.getStorageSync('myCases') || {};
    let t = '【AI验房师 本地数据备份】\n导出时间：' + new Date().toLocaleString() + '\n\n';
    t += '===== 验房报告（' + reports.length + '份）=====\n';
    reports.forEach(r => {
      t += '\n◆ ' + r.reportNo + '　' + (r.date||'') + '\n';
      t += '  项目：' + (r.community||'') + ' ' + (r.room||'') + '　业主：' + (r.clientName||'—') + '\n';
      t += '  统计：问题' + (r.badCount||0) + ' 关注' + (r.midCount||0) + ' 高风险' + (r.highCount||0) + ' 防伪码：' + (r.antiCode||'—') + '\n';
      (r.problems||[]).forEach(p => {
        t += '  - [' + (p.category||'') + '] ' + (p.name||'') + (p.location?'（'+p.location+'）':'') + '：' + (p.fix||'') + '\n';
      });
    });
    t += '\n===== 客户档案（' + clients.length + '位）=====\n';
    clients.forEach(c => {
      t += '◆ ' + (c.name||'') + '　' + (c.phone||'') + '　' + (c.community||'') + ' ' + (c.room||'') + '　状态：' + ({todo:'待跟进',done:'已联系',closed:'已闭环'}[c.follow]||'') + (c.note?'　备注：'+c.note:'') + '\n';
    });
    t += '\n===== 个人经验库（' + Object.keys(myCases).length + '个小区）=====\n';
    Object.keys(myCases).forEach(k => {
      const c = myCases[k];
      const top = Object.keys(c.problems||{}).map(pn => pn+'×'+c.problems[pn]).join('、');
      t += '◆ ' + k + '（' + (c.count||0) + '次验房）　高频问题：' + (top||'—') + '\n';
    });
    t += '\n本备份为纯文本格式，可粘贴到Word/备忘录/云盘保存。数据仅存于你手机本地。';
    wx.setClipboardData({
      data: t,
      success: () => wx.showModal({
        title: '备份已复制',
        content: '已将报告、客户档案、经验库整理为可读文本复制到剪贴板，粘贴到Word/备忘录/云盘即可保存。',
        showCancel: false
      })
    });
  },
  toggleDark(e) {
    if (app.safeSet) app.safeSet('fieldMode', e.detail.value); else wx.setStorageSync('fieldMode', e.detail.value);
    this.setData({ darkMode: e.detail.value });
    wx.showToast({ title: e.detail.value ? '现场模式已开启' : '现场模式已关闭', icon: 'none' });
  },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  goCard() { wx.navigateTo({ url: '/pages/card/card' }); },
  goClients() { wx.navigateTo({ url: '/pages/clients/clients' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goRecheck() { wx.navigateTo({ url: '/pages/recheck/recheck' }); },
  goNorms() { wx.navigateTo({ url: '/pages/norms/norms' }); },
  toggleConsent(e) { if (app.safeSet) app.safeSet('dataConsent', e.detail.value); else wx.setStorageSync('dataConsent', e.detail.value); this.setData({ dataConsent: e.detail.value }); },
  editCert() {
    wx.showModal({ title: '证书编号', editable: true, placeholderText: '如 YS2024001', success: (r) => {
      if (!r.confirm || !r.content) { wx.showToast({ title: '请输入编号', icon: 'none' }); return; }
      wx.showModal({ title: '发证机构', editable: true, placeholderText: '如 中国验房协会', success: (r2) => {
        if (!r2.confirm) return;
        const u = Object.assign(this.data.user, { certNo: r.content, certOrg: r2.content });
        app.saveUserInfo(u); this.setData({ user: u });
      }});
    }});
  },
  feedback() {
    wx.showModal({ title: '使用反馈', editable: true, placeholderText: '说说遇到什么问题或建议...', success: (r) => {
      if (!r.confirm || !r.content) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }
      const fbs = wx.getStorageSync('feedback') || [];
      fbs.push({ text: r.content, time: new Date().toISOString() });
      if (!app.safeSet('feedback', fbs)) return;
      wx.showToast({ title: '已提交', icon: 'success' });
    }});
  },
  clearTask() {
    wx.removeStorageSync('currentTask');
    app.globalData.currentTask = null;
    wx.showToast({ title: '已清空当前任务' });
  },
  // 恢复出厂设置（清所有本地数据）
  resetAll() {
    wx.showModal({
      title: '恢复出厂设置',
      content: '将清空所有报告、客户、经验库、配置，不可恢复。确定？',
      confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return;
        wx.clearStorageSync();
        app.globalData.userInfo = {};
        app.globalData.currentTask = null;
        wx.showModal({ title: '已清空', content: '所有数据已清除，重新开始吧。', showCancel: false, success: () => wx.reLaunch({ url: '/pages/index/index' }) });
      }
    });
  }
});
