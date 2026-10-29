// components/global-tabbar/global-tabbar.js 全局底部栏（非tabBar页使用），selected自动判断
const asr = require('../../utils/asrEngine.js');
const ICONS = {
  deskGray: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEU4RTkzIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTIiIHJ4PSIyIi8+PHBhdGggZD0iTTkgMTloNiIvPjxwYXRoIGQ9Ik0xMiAxNXY0Ii8+PHBhdGggZD0iTTIgMjFoMjAiLz48L3N2Zz4=",
  deskBlue: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA3QUZGIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTIiIHJ4PSIyIi8+PHBhdGggZD0iTTkgMTloNiIvPjxwYXRoIGQ9Ik0xMiAxNXY0Ii8+PHBhdGggZD0iTTIgMjFoMjAiLz48L3N2Zz4=",
  houseWhite: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTEyIDIuNUwyLjUgMTFINXYxMGg2di02aDJ2Nmg2VjExaDIuNUwxMiAyLjV6Ii8+PC9zdmc+",
  personGray: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEU4RTkzIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQiLz48cGF0aCBkPSJNNCAyMGMxLjUtMy41IDUtNSA4LTVzNi41IDEuNSA4IDUiLz48L3N2Zz4=",
  personBlue: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA3QUZGIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQiLz48cGF0aCBkPSJNNCAyMGMxLjUtMy41IDUtNSA4LTVzNi41IDEuNSA4IDUiLz48L3N2Zz4="
};
Component({
  data: { selected: -1, ICONS, showPanel: false, input: '', messages: [], voiceOn: false },
  lifetimes: {
    attached() {
      // 自动判断当前页面，高亮对应tab
      try {
        const pages = getCurrentPages();
        const cur = pages[pages.length - 1];
        const route = (cur && cur.route) || '';
        this.setData({ selected: route === 'pages/index/index' ? 0 : route === 'pages/mine/mine' ? 1 : -1 });
      } catch (e) { this.setData({ selected: -1 }); }
    }
  },
  methods: {
    switchTab(e) {
      const d = e.currentTarget.dataset;
      wx.switchTab({ url: d.path });
    },
    togglePanel() {
      this.setData({ showPanel: !this.data.showPanel });
    },
    onInput(e) { this.setData({ input: e.detail.value }); },
    quickAsk(e) {
      this.setData({ input: e.currentTarget.dataset.q });
      this.send();
    },
    // 直达条文库：带关键词自动检索
    openNorms(e) {
      const k = e.currentTarget.dataset.k || '';
      this.setData({ showPanel: false });
      wx.navigateTo({ url: '/pages/norms/norms?k=' + encodeURIComponent(k) });
    },
    // ===== 按住说话：语音直接问AI（含问规范）=====
    voiceStart() {
      if (!asr.getConfig()) {
        wx.showModal({ title: '语音引擎未配置', content: '需要先配置ASR接口才能口述转文字。', confirmText: '去配置', success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/asr-config/asr-config' }); } });
        return;
      }
      this.rec = asr.createRecorder();
      this.rec.start({
        maxMs: 20000,
        onSegment: (seg) => { this.handleVoice(seg); },
        onError: (e) => { this.setData({ voiceOn: false }); wx.showToast({ title: '录音失败：' + ((e && e.errMsg) || '请检查麦克风权限'), icon: 'none' }); }
      });
      this.setData({ voiceOn: true });
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    },
    voiceEnd() {
      if (this.rec && this.rec.isRunning()) this.rec.stop();
      this.setData({ voiceOn: false });
    },
    async handleVoice(seg) {
      wx.showLoading({ title: '识别中…' });
      try {
        const r = await asr.transcribe(seg.filePath);
        const text = (r.text || '').trim();
        if (!text) { wx.showToast({ title: '没听清，再说一次', icon: 'none' }); return; }
        this.setData({ input: text, showPanel: true });
        wx.hideLoading();
        this.send();
      } catch (e) {
        wx.hideLoading();
        if (e && e.msg === 'NO_CONFIG') {
          wx.showModal({ title: '语音引擎未配置', content: e.hint, confirmText: '去配置', success: (m) => { if (m.confirm) wx.navigateTo({ url: '/pages/asr-config/asr-config' }); } });
        } else {
          wx.showToast({ title: '转写失败：' + ((e && e.msg) || '网络'), icon: 'none' });
        }
      }
    },
    async send() {
      const q = this.data.input;
      if (!q) return;
      const msgs = this.data.messages.concat([{ role: 'user', text: q }]);
      this.setData({ messages: msgs, input: '' });
      // 优先本地RAG + 大模型重排，命中直接返回；没命中再走AI引擎
      const rag = require('../../utils/rag.js');
      try {
        const local = await rag.answerRanked(q);
        if (local.found) {
          this.setData({ messages: msgs.concat([{ role: 'ai', text: local.text, recs: local.recs || [], normKey: q }]) });
          return;
        }
      } catch (e) { /* 重排失败走普通路径 */ }
      const { askSmart } = require('../../utils/aiEngine.js');
      const r = await askSmart(q);
      this.setData({ messages: msgs.concat([{ role: 'ai', text: r.text, normKey: q }]) });
    },
    takePhoto() {
      const { askVision } = require('../../utils/aiEngine.js');
      wx.chooseMedia({
        count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
        success: (r) => {
          const photo = r.tempFiles[0].tempFilePath;
          wx.showLoading({ title: 'AI识别中…' });
          askVision(photo, '请识别这张照片中的房屋问题，说明问题名称、位置、判断依据和整改建议。').then(res => {
            wx.hideLoading();
            const msgs = this.data.messages.concat([
              { role: 'user', text: '📷 [现场照片] 请识别' },
              { role: 'ai', text: res.text }
            ]);
            this.setData({ messages: msgs });
          }).catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '未配置大模型', icon: 'none' });
          });
        }
      });
    }
  }
});
