const app = getApp();
Page({ data: { reports: [], shareNo: '' },
onShow(){ this.setData({reports: app.getReports()}); },
setShareNo(e){ this.setData({ shareNo: e.currentTarget.dataset.no }); },
// 纯端侧：业主无法在自己手机上打开这份报告，因此历史页也改为「复制文本」交付。
// （原 open-type="share" 会发出一张业主点开为空的小程序卡片。）
copyFullReport(e){
  const no = e.currentTarget.dataset.no;
  const r = this.data.reports.find(x => x.reportNo === no);
  if(!r){ wx.showToast({ title:'报告不存在', icon:'none' }); return; }
  let t = '【验房报告】' + r.reportNo + '\n' + (r.community||'') + ' ' + (r.room||'') + '\n日期：' + (r.date||'') + '\n';
  if (r.grade && r.grade.label) t += '综合评级：' + r.grade.label + '（' + r.grade.grade + '级）\n';
  t += '共检 ' + (r.doneCount||0) + ' 项：问题 ' + (r.badCount||0) + ' 项、关注 ' + (r.midCount||0) + ' 项、高风险 ' + (r.highCount||0) + ' 项\n\n';
  (r.problems||[]).forEach((p,i)=>{
    t += (i+1) + '. [' + (p.category||'') + '] ' + (p.name||'') + (p.location?'（'+p.location+'）':'') + (p.type==='mid'?'【关注】':'【问题】') + '\n';
    if(p.metricTip) t += '   实测：' + p.metricTip + '\n';
    if(p.note) t += '   备注：' + p.note + '\n';
    if(p.fix) t += '   整改：' + p.fix + '\n';
  });
  if (r.antiCode) t += '\n防伪码：' + r.antiCode + '（业主可凭此码向验房师核验）\n';
  wx.setClipboardData({ data: t, success: () => wx.showModal({ title:'报告文本已复制', content:'已复制完整报告文本，可直接粘贴发给业主。\n\n如需带照片的报告，请到报告页点「导出报告长图」。', showCancel:false }) });
},
viewReport(e){
  const r = this.data.reports[e.currentTarget.dataset.idx];
  if(!r)return;
  const mid = r.midCount||0;
  let detail = r.community+' '+r.room+'\n编号：'+r.reportNo+'\n日期：'+r.date+'\n问题：'+(r.badCount||0)+'项 关注：'+mid+'项 合格：'+(r.okCount||0)+'项\n\n';
  (r.problems||[]).forEach((p,i)=>{ detail += (i+1)+'. '+p.name+(p.location?'（'+p.location+'）':'')+(p.type==='mid'?'【关注】':'')+(p.metricTip?'【实测:'+p.metricTip+'】':'')+'\n'; });
  wx.showModal({
    title: '报告详情',
    content: detail,
    confirmText: '复制',
    cancelText: '关闭',
    success: (m) => { if (m.confirm) { wx.setClipboardData({ data: detail, success: () => wx.showToast({ title:'已复制', icon:'success' }) }); } }
  });
},
viewPhotos(e){
  const r = this.data.reports[e.currentTarget.dataset.idx];
  if(!r) return;
  // 照片存的是 {url, shotAt} 对象，wx.previewImage 只接受字符串数组，
  // 直接传对象会报 parameter error（此前这里会崩溃）。
  const urls = [];
  (r.problems||[]).forEach(p => (p.photos||[]).forEach(u => {
    const src = (u && typeof u === 'object') ? u.url : u;
    if (src) urls.push(src);
  }));
  if(!urls.length){ wx.showToast({title:'该报告无照片',icon:'none'}); return; }
  wx.previewImage({ urls });
}
});
