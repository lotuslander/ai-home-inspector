// pages/sign/sign.js - 手写签名板（验房师签名 / 业主确认签名）
const app = getApp();
const fs = require('../../utils/fileStore.js');
Page({
  data: { hasInk: false, mode: 'inspector' },
  onLoad(o) {
    this.mode = o.mode || 'inspector';
    if (this.mode === 'owner') wx.setNavigationBarTitle({ title: '业主确认签名' });
  },
  onReady() {
    this.ctx = wx.createCanvasContext('signCanvas', this);
    this.drawing = false;
    this.last = null;
  },
  touchStart(e) {
    const t = e.touches[0];
    const p = this.toPoint(t);
    this.drawing = true;
    this.last = p;
    this.ctx.setLineWidth(4);
    this.ctx.setLineCap('round');
    this.ctx.setLineJoin('round');
    this.ctx.setStrokeStyle('#1C1C1E');
  },
  touchMove(e) {
    if (!this.drawing) return;
    const t = e.touches[0];
    const p = this.toPoint(t);
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.ctx.draw(true);
    this.last = p;
    this.setData({ hasInk: true });
  },
  touchEnd() { this.drawing = false; },
  toPoint(t) {
    // 转换 touch 坐标为 canvas 内坐标
    const q = wx.createSelectorQuery().in(this);
    return { x: t.x, y: t.y };
  },
  clear() {
    this.ctx.clearRect(0, 0, 600, 300);
    this.ctx.draw();
    this.setData({ hasInk: false });
  },
  confirm() {
    if (!this.data.hasInk) { wx.showToast({ title:'请先签名', icon:'none' }); return; }
    wx.canvasToTempFilePath({
      canvasId: 'signCanvas',
      success: async (r) => {
        // 签名也要持久化，否则临时文件过期后报告上的签名会消失
        const saved = await fs.persist(r.tempFilePath);
        if (this.mode === 'owner') {
          app.safeSet('ownerSignature', saved);
          wx.showToast({ title:'确认签名已保存', icon:'success' });
        } else {
          app.safeSet('signature', saved);
          wx.showToast({ title:'签名已保存', icon:'success' });
        }
        setTimeout(() => wx.navigateBack(), 500);
      },
      fail: () => wx.showToast({ title:'保存失败', icon:'none' })
    }, this);
  }
});
