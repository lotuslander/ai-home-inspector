// pages/clients/clients.js - 业主档案（自动从报告归档 + 手动添加 + 跟进状态）
const app = getApp();
Page({
  data: { list: [], detail: null, timeline: [], showDetail: false, commList: [], commCount: 0, biz: null, refRank: [], followUpCount: 0 },
  onShow() {
    const reports = app.getReports();
    const manual = wx.getStorageSync('clients') || [];
    const map = {};
    reports.forEach(r => {
      const key = r.clientName || (r.community + ' ' + r.room);
      if (!map[key]) map[key] = { name: r.clientName || '业主', community: r.community, room: r.room, phone: r.clientPhone || '', reports: 0, pending: 0, lastDate: '', reportList: [], follow: 'todo', note: '', referrer: '', badTotal: 0 };
      const c = map[key];
      c.reports++;
      c.reportList.push({ no: r.reportNo, date: r.date, bad: r.badCount });
      c.badTotal += (r.badCount || 0);
      if (r.date > c.lastDate) c.lastDate = r.date;
      (r.problems || []).forEach(p => { if (p.recheck !== 'fixed') c.pending++; });
    });
    manual.forEach(m => {
      const key = m.name;
      if (map[key]) {
        if (m.phone && !map[key].phone) map[key].phone = m.phone;
        if (m.community && !map[key].community) map[key].community = m.community;
        if (m.room && !map[key].room) map[key].room = m.room;
        if (m.follow) map[key].follow = m.follow;
        if (m.note) map[key].note = m.note;
        if (m.referrer) map[key].referrer = m.referrer;
      } else {
        map[key] = { name: m.name, community: m.community || '', room: m.room || '', phone: m.phone || '', reports: 0, pending: 0, lastDate: '', reportList: [], follow: m.follow || 'todo', note: m.note || '', referrer: m.referrer || '', badTotal: 0 };
      }
    });
    // 小区聚合统计（团单机会：同一小区多个业主）
    const commMap = {};
    Object.keys(map).forEach(k => {
      const c = map[k];
      if (!c.community) return;
      if (!commMap[c.community]) commMap[c.community] = { community: c.community, clients: 0, reports: 0, pending: 0, grades: [], badTotal: 0 };
      commMap[c.community].clients++;
      commMap[c.community].reports += c.reports;
      commMap[c.community].pending += c.pending;
    });
    // 小区质量画像：多户报告评级聚合 → 该盘整体质量（谈单利器）
    reports.forEach(r => {
      if (!r.community || !r.grade) return;
      if (commMap[r.community]) {
        commMap[r.community].grades.push(r.grade.grade || '');
        commMap[r.community].badTotal += (r.badCount || 0);
      }
    });
    Object.keys(commMap).forEach(k => {
      const c = commMap[k];
      if (!c.grades.length) { c.quality = null; return; }
      const gradeMap = { A: 1, B: 2, C: 3, D: 4 };
      const score = c.grades.reduce((s, g) => s + (gradeMap[g] || 0), 0) / c.grades.length;
      c.quality = score <= 1.4 ? { label: '整体优', color: '#34C759', desc: '该盘多户验房评级高，可放心推荐' } :
                   score <= 2.2 ? { label: '整体良', color: '#007AFF', desc: '偶有问题，开发商配合度好' } :
                   score <= 3.0 ? { label: '整体一般', color: '#FF9500', desc: '问题偏多，建议逐户仔细查验' } :
                                  { label: '整体偏差', color: '#FF3B30', desc: '该盘质量风险高，谈单时明确风险提示' };
    });
    const commList = Object.keys(commMap).map(k => commMap[k]).sort((a, b) => b.clients - a.clients);
    const list = Object.keys(map).map(k => map[k]);
    list.sort((a, b) => (b.pending - a.pending) || (b.lastDate < a.lastDate ? -1 : 1));
    // 经营分析：月度/季度单量、转介绍数、团单机会
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const q = Math.floor((m - 1) / 3) + 1;
    const monthReports = reports.filter(r => r.date && r.date.slice(0, 7) === y + '-' + (m < 10 ? '0' + m : m)).length;
    const quarterReports = reports.filter(r => {
      if (!r.date || r.date.slice(0, 4) !== String(y)) return false;
      const rm = parseInt(r.date.slice(5, 7), 10);
      return Math.floor((rm - 1) / 3) + 1 === q;
    }).length;
    const refCount = list.filter(c => c.referrer).length;
    const teamCount = commList.filter(c => c.clients >= 3).length;
    const biz = { monthReports, quarterReports, refCount, teamCount, totalClients: list.length, totalReports: reports.length };
    // 回访计划：闭环客户自动生成回访节点（收房3个月=装修复检商机、1年=渗漏回访）
    // 转介绍排行：统计"谁给我带来最多客户"
    const refMap = {};
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    let followUpCount = 0;
    list.forEach(c => {
      // 价值分层：多报告=复购VIP；有转介绍来源=推荐VIP
      c.isVip = (c.reports > 1) || !!c.referrer;
      c.refBy = c.referrer || '';
      if (c.refBy) refMap[c.refBy] = (refMap[c.refBy] || 0) + 1;
      // 回访节点：以最后一份报告日期推算
      if (c.lastDate && c.follow === 'closed') {
        const d = new Date(c.lastDate.replace(/-/g, '/'));
        const m3 = new Date(d.getTime() + 90 * 86400000).toISOString().slice(0, 10);
        const y1 = new Date(d.getTime() + 365 * 86400000).toISOString().slice(0, 10);
        c.followUp = [ { at: m3, type: '装修复检回访' }, { at: y1, type: '入住渗漏回访' } ]
          .filter(f => f.at >= monthAgo)
          .sort((a, b) => a.at < b.at ? -1 : 1);
        if (c.followUp.length) followUpCount++;
      } else {
        c.followUp = [];
      }
    });
    const refRank = Object.keys(refMap).map(k => ({ name: k, count: refMap[k] })).sort((a, b) => b.count - a.count).slice(0, 5);
    this.setData({ list, commList, commCount: commList.length, biz, refRank, followUpCount });
  },
  // 生成经营简报：按月/季总结自己的生意，可复制存档或复盘
  genBizReport() {
    const b = this.data.biz;
    if (!b || !b.totalReports) { wx.showToast({ title: '暂无经营数据', icon: 'none' }); return; }
    const now = new Date();
    let t = '【验房经营简报】\n';
    t += '统计时间：' + now.getFullYear() + '年' + (now.getMonth() + 1) + '月\n';
    t += '累计验房：' + b.totalReports + ' 单（客户 ' + b.totalClients + ' 户）\n';
    t += '本月：' + b.monthReports + ' 单\n';
    t += '本季度：' + b.quarterReports + ' 单\n';
    t += '转介绍客户：' + b.refCount + ' 户' + (b.refCount ? '（老客户带新客，请多维护）' : '（暂无，可主动邀评）') + '\n';
    t += '团单小区：' + b.teamCount + ' 个' + (b.teamCount ? '（≥3户，可做小区团验）' : '（暂无，积累同小区业主）') + '\n';
    t += '待复检：' + this.data.commList.reduce((s, c) => s + c.pending, 0) + ' 项（=潜在复检收入）\n';
    wx.setClipboardData({
      data: t,
      success: () => wx.showModal({ title: '经营简报已复制', content: '可粘贴到备忘录/发给自己做月度复盘。', showCancel: false })
    });
  },
  // 构建客户服务时间线：报告→整改→复检→闭环 全流程事件
  buildTimeline(c) {
    const events = [];
    if (!c) return events;
    (c.reportList || []).forEach(r => {
      events.push({ date: r.date, type: 'report', text: '出具验房报告（' + r.no + '）' + (r.bad ? ' · 问题' + r.bad + '项' : '') });
    });
    const reports = app.getReports();
    reports.forEach(r => {
      if (r.community !== c.community || (c.name !== '业主' && r.clientName !== c.name)) return;
      (r.problems || []).forEach(p => {
        if (p.recheck === 'fixed' && p.recheckDate) {
          events.push({ date: p.recheckDate, type: 'recheck', text: '复检闭环：' + p.name });
        } else if (p.recheck && p.recheckDate) {
          events.push({ date: p.recheckDate, type: 'recheck', text: '复检' + (p.recheck === 'partial' ? '部分整改' : '未整改') + '：' + p.name });
        }
      });
    });
    events.sort((a, b) => b.date < a.date ? -1 : 1);
    return events;
  },
  viewClient(e) {
    const c = this.data.list[e.currentTarget.dataset.idx];
    if (!c) return;
    this.setData({ detail: c, timeline: this.buildTimeline(c), showDetail: true });
  },
  closeDetail() { this.setData({ showDetail: false }); },
  noop() {},
  // 切换跟进状态：待跟进→已联系→已闭环
  cycleFollow() {
    const d = this.data.detail;
    if (!d) return;
    const order = { todo: 'done', done: 'closed', closed: 'todo' };
    const next = order[d.follow] || 'todo';
    d.follow = next;
    this.persistManual(d);
    this.setData({ detail: d });
    this.onShow();
    const name = { todo: '待跟进', done: '已联系', closed: '已闭环' }[next];
    wx.showToast({ title: '状态：' + name, icon: 'none' });
  },
  // 添加备注
  addNote() {
    const d = this.data.detail;
    if (!d) return;
    wx.showModal({
      title: '备注（回访/喜好/转介绍线索）', editable: true, placeholderText: d.note || '如：业主考虑推荐朋友验房', content: d.note,
      success: (r) => {
        if (!r.confirm) return;
        d.note = r.content || '';
        this.persistManual(d);
        this.setData({ detail: d });
        this.onShow();
        wx.showToast({ title: '已保存备注', icon: 'success' });
      }
    });
  },
  persistManual(c) {
    const l = wx.getStorageSync('clients') || [];
    const i = l.findIndex(m => m.name === c.name);
    const obj = { name: c.name, phone: c.phone, community: c.community, room: c.room, follow: c.follow, note: c.note, referrer: c.referrer };
    if (i >= 0) l[i] = obj; else l.unshift(obj);
    if (!app.safeSet('clients', l)) wx.showToast({ title: '保存失败：存储空间不足', icon: 'none' });
  },
  // 记录转介绍线索（谁推荐了这位业主）
  addReferrer() {
    const d = this.data.detail;
    if (!d) return;
    wx.showModal({
      title: '转介绍来源', editable: true, placeholderText: '如：张先生推荐 / 小区团单 / 网上看到', content: d.referrer,
      success: (r) => {
        if (!r.confirm) return;
        d.referrer = r.content || '';
        this.persistManual(d);
        this.setData({ detail: d });
        this.onShow();
        wx.showToast({ title: '已记录来源', icon: 'success' });
      }
    });
  },
  call(e) {
    const p = e.currentTarget.dataset.phone;
    if (!p) { wx.showToast({ title: '无电话', icon: 'none' }); return; }
    wx.makePhoneCall({ phoneNumber: p });
  },
  add() {
    let name = '', phone = '', community = '', room = '';
    const step1 = () => wx.showModal({ title: '业主姓名', editable: true, success: (r) => {
      if (!r.confirm || !r.content) return;
      name = r.content;
      step2();
    }});
    const step2 = () => wx.showModal({ title: '电话（可跳过）', editable: true, success: (r) => {
      if (!r.confirm) return;
      phone = r.content || '';
      step3();
    }});
    const step3 = () => wx.showModal({ title: '小区名（可跳过）', editable: true, success: (r) => {
      if (!r.confirm) return;
      community = r.content || '';
      step4();
    }});
    const step4 = () => wx.showModal({ title: '房号（可跳过）', editable: true, success: (r) => {
      if (!r.confirm) return;
      room = r.content || '';
      const l = wx.getStorageSync('clients') || [];
      l.unshift({ name, phone, community, room, follow: 'todo', note: '' });
      if (!app.safeSet('clients', l)) { wx.showToast({ title: '保存失败：存储空间不足', icon: 'none' }); return; }
      this.onShow();
      wx.showToast({ title: '已添加', icon: 'success' });
    }});
    step1();
  }
});
