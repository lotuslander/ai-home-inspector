const app = getApp();
const fs = require('../../utils/fileStore.js');
Page({
  data: { user: {}, cardNo: '' },
  onShow() {
    this.setData({ user: app.globalData.userInfo, cardNo: app.genReportNo ? app.genReportNo().replace('YF-', 'MC-') : 'MC-' + Date.now() });
  },
  // 设备像素比：优先用新版 wx.getWindowInfo（getSystemInfoSync 已不推荐），并兜底默认值
  getDpr() {
    try {
      if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
      if (wx.getSystemInfoSync) return wx.getSystemInfoSync().pixelRatio || 2;
    } catch (e) {}
    return 2;
  },
  // 用 canvas 生成 logo 徽标（姓名首字 + 双圈），保存为图片
  genLogo() {
    const name = this.data.user.name || '验房';
    const char = name[0];
    wx.createSelectorQuery().select('#logoCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) { wx.showToast({ title: '生成失败', icon: 'none' }); return; }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = this.getDpr();
      const size = 200;
      canvas.width = size * dpr; canvas.height = size * dpr;
      ctx.scale(dpr, dpr);
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#007AFF'); g.addColorStop(1, '#5856D6');
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 28, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(char, size / 2, size / 2 + 6);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '22px sans-serif';
      ctx.fillText('AI 验房师', size / 2, size - 34);
      wx.canvasToTempFilePath({
        canvas, success: async (r) => {
          // Logo 会用于名片绘制与分享，必须持久化，否则临时文件过期后名片变空白
          const logoPath = await fs.persist(r.tempFilePath);
          const u = Object.assign({}, app.globalData.userInfo, { logoPath });
          app.saveUserInfo(u);
          this.setData({ user: u });
          wx.showToast({ title: 'logo 已生成', icon: 'success' });
        }, fail: () => wx.showToast({ title: '生成失败', icon: 'none' })
      });
    });
  },
  // ===== 绘制真实电子名片（canvas）=====
  drawCard(cb) {
    const that = this;
    const u = this.data.user || {};
    const W = 720, H = 1040;
    const nodeQuery = wx.createSelectorQuery();
    // 隐藏绘制用 canvas（复用 logoCanvas 尺寸不合适，单独取主 canvas）
    nodeQuery.select('#cardCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) { wx.showToast({ title: '绘制失败', icon: 'none' }); return; }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = this.getDpr();
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      // 背景
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#007AFF'); bg.addColorStop(0.55, '#3A6FE0'); bg.addColorStop(1, '#5856D6');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // 顶部装饰圆环
      ctx.beginPath(); ctx.arc(640, -60, 180, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.beginPath(); ctx.arc(-40, 900, 220, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();

      // Logo：优先用已生成logo，否则画首字圆
      const drawLogo = () => {
        if (u.logoPath) {
          const img = canvas.createImage();
          img.onload = () => {
            ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 190, 86, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, W / 2 - 86, 104, 172, 172);
            ctx.restore();
            ctx.beginPath(); ctx.arc(W / 2, 190, 88, 0, Math.PI * 2);
            ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
            drawBody();
          };
          img.src = u.logoPath;
        } else {
          const char = (u.name || '验')[0];
          ctx.beginPath(); ctx.arc(W / 2, 190, 86, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
          ctx.beginPath(); ctx.arc(W / 2, 190, 88, 0, Math.PI * 2);
          ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 88px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(char, W / 2, 194);
          drawBody();
        }
      };
      const drawBody = () => {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = 'bold 46px sans-serif'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(u.name || '验房师', W / 2, 340);
        ctx.font = '28px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(u.company || '独立验房师', W / 2, 392);
        if (u.certNo) {
          ctx.font = '24px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText('资质：' + (u.certOrg || '') + ' · ' + u.certNo, W / 2, 436);
        }
        // 分隔线
        ctx.beginPath(); ctx.moveTo(80, 500); ctx.lineTo(W - 80, 500);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
        // 联系信息
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif';
        ctx.fillText('📞 ' + (u.phone || '电话待填写'), 80, 560);
        ctx.fillText('🏠 服务：毛坯 / 精装 / 二手房 / 复检', 80, 612);
        ctx.fillText('🧰 专业验房 · AI辅助 · 报告可溯源', 80, 664);
        // 底部
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '22px sans-serif';
        ctx.fillText('名片编号 ' + that.data.cardNo, 80, 980);
        ctx.textAlign = 'right';
        ctx.fillText('AI 验房师', W - 80, 980);
        ctx.font = '20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText('扫码添加 · 验房更安心', W - 80, 1010);
        if (cb) cb(canvas);
      };
      drawLogo();
    });
  },
  // 保存名片到相册
  saveCard() {
    const that = this;
    if (!this.data.user.name) { wx.showToast({ title: '请先完善姓名', icon: 'none' }); return; }
    wx.showLoading({ title: '生成中...' });
    this.drawCard((canvas) => {
      wx.canvasToTempFilePath({
        canvas, fileType: 'png', quality: 1,
        success: (r) => {
          wx.hideLoading();
          wx.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => wx.showToast({ title: '名片已保存到相册', icon: 'success' }),
            fail: () => wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启保存到相册权限后重试。',
              confirmText: '去设置', success: (s) => { if (s.confirm) wx.openSetting(); }
            })
          });
        },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '生成失败', icon: 'none' }); }
      });
    });
  },
  // 转发名片给业主/朋友
  onShareAppMessage() {
    return {
      title: (this.data.user.name || '验房师') + ' · AI验房师电子名片',
      path: '/pages/card/card',
      imageUrl: this.data.user.logoPath || ''
    };
  }
});
