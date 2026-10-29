// pages/voice/voice.js - 现场记录（连续口述自动归档）
// 核心：师傅连续口述 → 滚动分段录音（60s/段无缝续录）→ 每段并行转写
//       → AI结构化+匹配检查项 → 匹配成功自动写入清单records（可撤销）
//       → 未匹配的进草稿，验完集中矫正。全程不弹窗不打断。
const app = getApp();
const asr = require('../../utils/asrEngine.js');
const { buildDraft, mergeDraft, unmergeDraft } = require('../../utils/voiceParser.js');

Page({
  data: { task: null, cfgReady: false, recording: false, elapsed: 0,
    transStatus: '', merged: [], pending: [], riskText: { high: '严重', mid: '一般', low: '轻微' } },
  recorder: null, timer: null,

  onShow() {
    const task = app.globalData.currentTask;
    this.setData({ task, cfgReady: !!asr.getConfig() });
    this.reloadLists();
    wx.setKeepScreenOn({ keepScreenOn: true });
  },
  onHide() { this.stopRecSilent(); wx.setKeepScreenOn({ keepScreenOn: false }); },
  onUnload() { this.stopRecSilent(); wx.setKeepScreenOn({ keepScreenOn: false }); },

  // 从task读取：merged=已自动并入清单的，pending=待归类草稿
  reloadLists() {
    const task = app.globalData.currentTask;
    const drafts = (task && task.voiceDrafts) || [];
    this.setData({
      merged: drafts.filter(d => d.confirmed && d.itemId),
      pending: drafts.filter(d => !d.confirmed || !d.itemId)
    });
  },

  goAsrConfig() { wx.navigateTo({ url: '/pages/asr-config/asr-config' }); },
  goReview() { wx.navigateTo({ url: '/pages/review/review' }); },

  // 开始滚动分段录音（全程连续，段间无缝）
  startRec() {
    if (!this.data.task) { wx.showToast({ title: '请先在工作台新建任务', icon: 'none' }); return; }
    this.recorder = asr.createRecorder();
    let sec = 0;
    this.timer = setInterval(() => { sec++; this.setData({ elapsed: sec }); }, 1000);
    this.recorder.start({
      maxMs: 60000,
      onSegment: (seg) => { this.handleSegment(seg); },
      onEnd: () => { this.finish(); },
      onError: (e) => {
        this.clearTimer();
        this.setData({ recording: false, elapsed: 0 });
        wx.showModal({ title: '录音失败', content: (e && e.errMsg) || '请检查麦克风权限', showCancel: false });
      }
    });
    this.setData({ recording: true, transStatus: '' });
  },

  // 每段转写（与下一段录音并行，不打断）→ 自动归档
  // 清理计时器（点结束/出错时都要停，否则秒数继续跳）
  clearTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  async handleSegment(seg) {
    this.setData({ transStatus: '🎙️ 识别第' + seg.segNo + '段…' });
    try {
      const r = await asr.transcribe(seg.filePath);
      const text = (r.text || '').trim();
      if (!text) { this.setData({ transStatus: '第' + seg.segNo + '段未识别到内容（继续说即可）' }); return; }
      const draft = await buildDraft(text, this.data.task.room);
      if (draft) this.autoMerge(draft);
      else this.setData({ transStatus: '第' + seg.segNo + '段解析失败（已跳过）' });
    } catch (e) {
      if (e && e.msg === 'NO_CONFIG') {
        this.stopRec();
        wx.showModal({ title: '语音引擎未配置', content: e.hint, confirmText: '去配置', success: (m) => { if (m.confirm) this.goAsrConfig(); } });
      } else {
        this.setData({ transStatus: '第' + seg.segNo + '段转写失败：' + ((e && e.msg) || '网络') });
      }
    }
  },

  // 自动归档：匹配到检查项→直接写入records；未匹配→留草稿（防覆盖合并逻辑在voiceParser.mergeDraft）
  autoMerge(draft) {
    const task = app.globalData.currentTask;
    if (!task) return;
    const r = mergeDraft(task, draft);
    if (r.ok) {
      this.setData({ transStatus: '✅ 已并入「' + draft.itemName + '」' + (r.count > 1 ? '（第' + r.count + '处）' : '') + '：' + (draft.location || draft.problem) });
    } else {
      this.setData({ transStatus: '⚠️ 未匹配到检查项，已留草稿（验完可归类）' });
    }
    app.saveTask(task);
    this.reloadLists();
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  // 撤销自动并入（从records移除本条描述，草稿保留待重新归类）
  undoMerge(e) {
    const id = e.currentTarget.dataset.id;
    const task = app.globalData.currentTask;
    if (!task) return;
    const d = (task.voiceDrafts || []).find(x => x.id === id);
    if (!d) return;
    unmergeDraft(task, d);
    app.saveTask(task);
    this.reloadLists();
    wx.showToast({ title: '已撤销，可在矫正页重新归类', icon: 'none' });
  },

  // 注意：本方法同时被 bindtap 调用（会传入事件对象）和页面隐藏时调用。
  // 原写法 stopRec(silent) 把事件对象当 truthy 传给 recorder.stop，导致录音被"静默"收尾，
  // finish() 永远不执行——用户点"结束记录"后看不到任何汇总/提示，像按钮失灵。
  stopRec() {
    if (this.recorder && this.recorder.isRunning()) this.recorder.stop(false);
  },
  stopRecSilent() {
    if (this.recorder && this.recorder.isRunning()) this.recorder.stop(true);
  },

  finish() {
    this.clearTimer();
    this.setData({ recording: false, elapsed: 0, transStatus: '' });
    const { merged, pending } = this.data;
    if (merged.length || pending.length) {
      wx.showModal({
        title: '记录完成',
        content: '自动并入清单 ' + merged.length + ' 条' + (pending.length ? '，另有 ' + pending.length + ' 条待归类' : '') + '。要检查一下待归类的吗？',
        confirmText: pending.length ? '去归类' : '回清单',
        cancelText: '继续记录',
        success: (m) => { if (m.confirm) { if (pending.length) this.goReview(); else wx.navigateTo({ url: '/pages/checklist/checklist' }); } }
      });
    } else {
      wx.showToast({ title: '本轮未识别到内容', icon: 'none' });
    }
  }
});
