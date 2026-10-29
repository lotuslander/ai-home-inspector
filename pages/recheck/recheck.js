// pages/recheck/recheck.js - 整改跟踪与二次复检
const app = getApp();
const { askVision } = require('../../utils/aiEngine.js');
const fs = require('../../utils/fileStore.js');
Page({
  data: { list: [], done: [], empty: false, groups: [], activeGroup: '' },
  onShow() { this.load(); },
  load() {
    const list = app.getRechecks();
    const today = new Date().toISOString().slice(0, 10);
    list.forEach(p => {
      const days = Math.round((new Date(today) - new Date(p.date)) / 86400000);
      p.daysLeft = 15 - days;
      p.overdue = days > 15;
      // 整改状态三态
      if (p.recheck === 'fixed') p.status = 'fixed';
      else if (p.recheckPhotos && p.recheckPhotos.length) p.status = 'partial';
      else p.status = 'pending';
    });
    // 超期提醒
    const overdueList = list.filter(p => p.overdue && p.status !== 'fixed');
    if (overdueList.length > 0) {
      wx.showModal({
        title: '⚠️ 复检超期提醒',
        content: '有 '+overdueList.length+' 个整改项已超过15天未复检，请尽快联系业主上门确认。',
        showCancel: false
      });
    }
    const done = [];
    app.getReports().forEach(r => {
      (r.problems || []).forEach(p => {
        if (p.recheck === 'fixed') done.push({ reportNo: r.reportNo, community: r.community, room: r.room, ...p });
      });
    });
    // 整改率统计
    const total = list.length + done.length;
    const rate = total ? Math.round(done.length / total * 100) : 0;
    const overdueCount = list.filter(p=>p.overdue).length;
    // 按报告分组：一次上门一个客户，生成"复检上门任务单"
    const gmap = {};
    list.forEach(p => {
      const key = p.reportNo + '|' + p.community + '|' + p.room;
      if (!gmap[key]) gmap[key] = { reportNo: p.reportNo, community: p.community, room: p.room, date: p.date, items: [], clientName: p.clientName || '', overdue: 0 };
      gmap[key].items.push(p);
      if (p.overdue && p.status !== 'fixed') gmap[key].overdue++;
    });
    const groups = Object.keys(gmap).map(k => gmap[k]).sort((a, b) => b.overdue - a.overdue);
    this.setData({ list, done, empty: !list.length, rate, overdueCount, total, groups });
  },
  // 切换分组查看该客户待复检明细
  pickGroup(e) {
    const key = e.currentTarget.dataset.key;
    const g = this.data.groups.find(x => x.reportNo + '|' + x.community + '|' + x.room === key);
    if (!g) return;
    const arr = g.items.map(p => '· ' + p.name + (p.location ? '（' + p.location + '）' : '') + (p.overdue && p.status !== 'fixed' ? ' ⚠️超期' : ''));
    wx.showModal({
      title: g.community + ' ' + g.room + ' 待复检',
      content: '报告：' + g.reportNo + '\n' + arr.join('\n'),
      showCancel: false
    });
  },
  // 复制"复检上门任务单"：上门前发给自己/同事，一目了然
  genVisitSheet() {
    const groups = this.data.groups;
    if (!groups.length) { wx.showToast({ title: '暂无待复检任务', icon: 'none' }); return; }
    let t = '【复检上门任务单】\n';
    t += '日期：' + new Date().toISOString().slice(0, 10) + '\n';
    t += '待复检客户：' + groups.length + ' 户\n\n';
    groups.forEach((g, gi) => {
      t += (gi + 1) + '️⃣ ' + g.community + ' ' + g.room + (g.clientName ? '（' + g.clientName + '）' : '') + '\n';
      t += '  报告：' + g.reportNo + ' · ' + g.date + (g.overdue ? ' · ⚠️' + g.overdue + '项超期' : '') + '\n';
      g.items.forEach((p, i) => {
        t += '  ' + (i + 1) + '. ' + p.name + (p.location ? '（' + p.location + '）' : '') + '\n';
      });
    });
    t += '\n上门后逐项复检拍照，确认后标记闭环。';
    wx.setClipboardData({
      data: t,
      success: () => wx.showModal({ title: '任务单已复制', content: '已复制复检上门任务单，可发给自己/同事或存档。', showCancel: false })
    });
  },
  // 生成整改闭环确认单（可复制发业主/开发商，标准化闭环产物）
  genSummary() {
    const { list, done, rate, total, overdueCount } = this.data;
    const wait = list.filter(p => p.status !== 'fixed');
    let t = '【验房整改闭环确认单】\n';
    t += '统计时间：' + new Date().toISOString().slice(0, 10) + '\n';
    t += '整改事项：' + total + ' 项\n';
    t += '已整改闭环：' + done.length + ' 项\n';
    t += '整改完成率：' + rate + '%\n';
    t += '超期未复检：' + overdueCount + ' 项\n';
    if (rate === 100) {
      t += '\n✅ 全部整改事项已闭环确认，业主可放心收房/入住。\n';
    } else {
      t += '\n待整改事项：\n';
      wait.forEach((p, i) => {
        t += (i + 1) + '. ' + p.name + '（' + p.community + ' ' + p.room + (p.overdue ? ' · 已超期' : '') + '）\n';
      });
      t += '\n请尽快联系业主二次上门复检。\n';
    }
    t += '\n—— 由「AI验房师」生成，含现场复检照片记录';
    wx.setClipboardData({
      data: t,
      success: () => wx.showModal({ title: '闭环确认单已复制', content: '已复制整改闭环汇总，可粘贴发送给业主或存档。', showCancel: false })
    });
  },
  // AI对比前后照片
  aiCompare(e){
    const idx = e.currentTarget.dataset.idx;
    const p = this.data.list[idx];
    if (!p) return;
    if(!p.photos || !p.photos.length || !p.recheckPhotos || !p.recheckPhotos.length){
      wx.showToast({title:'需要前后两张照片', icon:'none'});
      return;
    }
    wx.showLoading({title:'AI对比中…'});
    const afterUrl = p.recheckPhotos[0].url || p.recheckPhotos[0];
    askVision(afterUrl, '这是整改后的照片，问题是：'+p.name+'。请判断问题是否已整改解决？').then(r=>{
      wx.hideLoading();
      wx.showModal({title:'AI对比结果', content:r.text, showCancel:false});
    }).catch(()=>{
      wx.hideLoading();
      wx.showToast({title:'未配置大模型', icon:'none'});
    });
  },
  // 查看整改前照片（放大预览）
  viewBefore(e) {
    const p = this.data.list[e.currentTarget.dataset.idx];
    if (!p) return;
    if (!p.photos || !p.photos.length) { wx.showToast({ title: '该问题未拍照', icon: 'none' }); return; }
    wx.previewImage({ urls: p.photos.map(x => x.url || x) });
  },
  // 查看复检后照片（放大预览）
  viewAfter(e) {
    const p = this.data.list[e.currentTarget.dataset.idx];
    if (!p) return;
    if (!p.recheckPhotos || !p.recheckPhotos.length) { wx.showToast({ title: '暂未复检', icon: 'none' }); return; }
    wx.previewImage({ urls: p.recheckPhotos.map(x => x.url || x) });
  },
  // 查看原报告问题详情（含照片）
  viewOriginal(e) {
    const idx = e.currentTarget.dataset.idx;
    const p = this.data.list[idx];
    if (!p) return;
    wx.showModal({
      title: p.name,
      content: '报告：' + p.reportNo + '\n' + p.community + ' ' + p.room + '\n位置：' + (p.location || '未记录') + '\n整改建议：' + (p.fix || '—'),
      showCancel: false
    });
  },
  // 二次上门复检拍照 + 标记
  recheck(e) {
    const idx = e.currentTarget.dataset.idx;
    const p = this.data.list[idx];
    wx.showActionSheet({
      itemList: ['已整改完成', '部分整改（继续跟进）', '未整改（超期）'],
      success: (res) => {
        const statuses = ['fixed', 'partial', 'pending'];
        const status = statuses[res.tapIndex];
        wx.chooseMedia({
          count: 3, mediaType: ['image'], sourceType: ['camera', 'album'],
          success: async (r) => {
            const shotAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            // 持久化复检照片，否则过期后前后对比图会失效
            const paths = await Promise.all(r.tempFiles.map(f => fs.persist(f.tempFilePath)));
            const photos = paths.map(url => ({ url, shotAt }));
            const report = app.getReports().find(x => x.reportNo === p.reportNo);
            if (!report || !report.problems || report.problems[p.pi] === undefined) { wx.showToast({ title: '报告已变更，请刷新', icon: 'none' }); this.load(); return; }
            const today = new Date().toISOString().slice(0, 10);
            // 复检历史记录
            const history = (report.problems[p.pi].recheckHistory || []).concat([{ date: today, status: status, photos: photos }]);
            const patch = {
              problems: report.problems.map((pp, i) => i === p.pi ? Object.assign({}, pp, { recheck: status, recheckDate: today, recheckPhotos: photos, recheckHistory: history }) : pp)
            };
            app.updateReport(p.reportNo, patch);
            this.load();
            wx.showToast({ title: '复检记录已保存', icon: 'success' });
      }
        });
      }
    });
  }
});
