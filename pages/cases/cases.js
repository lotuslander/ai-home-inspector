// pages/cases/cases.js - 实战案例库（150个，按住宅系统/风险双维度筛选）
const { CASES, RISK_TEXT } = require('../../utils/inspectData.js');

// 案例自动归类到住宅系统（依据标题+场景关键词）
const SYSTEM_RULES = [
  { sys: '墙面顶棚', kw: ['墙', '顶', '抹灰', '乳胶漆', '白灰', '掉粉', '腻子', '反碱', '泛碱', '墙纸', '墙布'] },
  { sys: '地面', kw: ['地板', '地砖', '地面', '咯吱', '起拱', '踢脚线', '地暖'] },
  { sys: '防水渗漏', kw: ['渗', '漏', '水印', '潮', '霉', '黑毛', '闭水', '水珠', '返潮'] },
  { sys: '门窗', kw: ['窗', '门', '玻璃', '3C', '胶条', '密封', '五金', '猫眼', '锁'] },
  { sys: '电气', kw: ['插座', '开关', '电', '灯', '配电', '强电', '弱电', '等电位', '跳闸', '回路'] },
  { sys: '给排水', kw: ['水', '地漏', '马桶', '龙头', '下水', '返味', '返臭', '排水', '冲水'] },
  { sys: '安全', kw: ['护栏', '栏杆', '燃气', '防火', '消防', '坠落'] },
  { sys: '通风采暖', kw: ['烟', '风', '暖气', '采暖', '空调', '排烟', '串味', '新风'] }
];
function classify(c) {
  const text = (c.title || '') + ' ' + (c.scene || '') + ' ' + (c.judge || '');
  for (const r of SYSTEM_RULES) {
    if (r.kw.some(k => text.indexOf(k) >= 0)) return r.sys;
  }
  return '其他';
}
Page({
  data: { cases: [], all: [], filter: 'all', systems: [], sys: 'all', keyword: '', myCount: 0, myTop: [] },
  onLoad() {
    const all = CASES.map(c => ({ ...c, riskText: RISK_TEXT[c.risk] || '', sys: classify(c) }));
    const systems = ['墙面顶棚', '地面', '防水渗漏', '门窗', '电气', '给排水', '安全', '通风采暖', '其他'];
    this.setData({ all, cases: all, systems });
  },
  onShow() {
    // 个人经验库：结构为 { 小区名: { count, lastDate, problems: { 问题名: 次数 } } }
    // 原来把整个对象当数字排序/展示，排序无效且弹窗显示 [object Object]。
    const my = wx.getStorageSync('myCases') || {};
    const keys = Object.keys(my);
    const arr = keys.map(k => {
      const c = my[k] || {};
      const problems = c.problems || {};
      const top = Object.keys(problems)
        .map(name => ({ name, n: problems[name] }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 3);
      return { name: k, count: c.count || 0, lastDate: c.lastDate || '', top, problemCount: Object.keys(problems).length };
    }).sort((a, b) => b.count - a.count);
    this.setData({ myCount: keys.length, myTop: arr.slice(0, 5) });
  },
  // 查看我的个人经验库明细
  viewMyCase(e) {
    const name = e.currentTarget.dataset.name;
    this.showMyCommunity(name);
  },
  showMyCommunity(name) {
    const my = wx.getStorageSync('myCases') || {};
    const c = my[name];
    if (!c) { wx.showToast({ title: '暂无记录', icon: 'none' }); return; }
    const problems = c.problems || {};
    const lines = Object.keys(problems)
      .map(k => ({ name: k, n: problems[k] }))
      .sort((a, b) => b.n - a.n)
      .map((x, i) => (i + 1) + '. ' + x.name + ' ×' + x.n)
      .slice(0, 8);
    wx.showModal({
      title: '我的经验：' + name,
      content: '你在该小区验过 ' + (c.count || 0) + ' 次' + (c.lastDate ? '（最近 ' + c.lastDate + '）' : '') + '\n\n高频问题：\n' + (lines.join('\n') || '—') + '\n\n这是你的实战数据，复检时可对照验证整改效果。',
      showCancel: false
    });
  },
  setFilter(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ filter: f, sys: 'all', keyword: '' });
    this.apply(f, 'all', '');
  },
  setSys(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ sys: s, filter: 'all' });
    this.apply('all', s, this.data.keyword);
  },
  onSearch(e) {
    const kw = e.detail.value.trim();
    this.setData({ keyword: kw });
    this.apply(this.data.filter, this.data.sys, kw);
  },
  apply(f, s, kw) {
    let list = this.data.all;
    if (f !== 'all') list = list.filter(c => c.risk === f);
    if (s !== 'all') list = list.filter(c => c.sys === s);
    if (kw) list = list.filter(c => (c.title + c.scene + c.judge + c.norm).indexOf(kw) >= 0);
    this.setData({ cases: list });
  },
  viewCase(e) {
    const c = this.data.cases[e.currentTarget.dataset.idx];
    if (!c) return;
    wx.showModal({
      title: c.title,
      content: '现场：' + c.scene + '\n判断：' + c.judge + '\n规范依据：' + c.norm + '\n对业主说：' + c.say + '\n报告写法：' + c.text + (c.riskText ? '\n风险等级：' + c.riskText : ''),
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
