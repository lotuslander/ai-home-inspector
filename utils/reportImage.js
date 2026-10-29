// utils/reportImage.js - 报告长图生成（两遍绘制：先量高，再渲染）
// 为什么需要它：原 exportImage 把画布高度按"问题数×固定值"估算、且只画前 12 条问题，
// 超过 12 条就直接写"详见完整报告"—— 但完整报告并不在图片里，等于交付残缺。
// 这里改为：第一遍用同一套绘制函数测量总高度，第二遍按真实高度完整渲染，不截断、不丢内容。

const T = require('./canvasText.js');

const W = 750;            // 逻辑宽度
const PAD = 40;           // 左右边距
const COL = W - PAD * 2;  // 内容宽度

// 统一的绘制器：layoutOnly=true 时只累加 y，不真正画（用于测高）
// offsetY：分页导出时把同一套布局整体上移，渲染到某一页的画布上
function createPainter(ctx, layoutOnly, offsetY) {
  const off = offsetY || 0;
  let y = 0;
  const p = {
    get y() { return y; },
    set y(v) { y = v; },
    space(h) { y += h; },
    rect(x, top, w, h, color, radius) {
      if (layoutOnly) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, top - off, w, h, radius || 0);
      else ctx.rect(x, top - off, w, h);
      ctx.fill();
    },
    text(str, x, top, size, color, weight, align) {
      if (layoutOnly) return;
      ctx.fillStyle = color || '#1C1C1E';
      ctx.font = (weight || '') + ' ' + size + 'px sans-serif';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(str == null ? '' : str), x, top - off);
    },
    // 自动换行段落，返回占用高度
    para(str, x, top, maxW, size, lh, color, weight) {
      if (layoutOnly) {
        ctx.font = (weight || '') + ' ' + size + 'px sans-serif';
        return T.measureWrapped(ctx, str, maxW, size, lh);
      }
      ctx.font = (weight || '') + ' ' + size + 'px sans-serif';
      T.drawWrapped(ctx, str, x, top - off, maxW, size, lh, color || '#1C1C1E');
      return T.measureWrapped(ctx, str, maxW, size, lh);
    },
    line(x1, top, x2, color) {
      if (layoutOnly) return;
      ctx.strokeStyle = color || '#E5E5EA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, top - off);
      ctx.lineTo(x2, top - off);
      ctx.stroke();
    }
  };
  return p;
}

// 计算并绘制整份报告
// opts: { layoutOnly, report, images: { [url]: Image } }
function render(ctx, opts) {
  const layoutOnly = !!opts.layoutOnly;
  const offsetY = opts.offsetY || 0;
  const d = opts.report || {};
  const imgs = opts.images || {};
  const p = createPainter(ctx, layoutOnly, offsetY);
  const cur = d.current || {};
  const ins = d.inspector || {};
  const problems = d.problems || [];
  const grade = d.grade;

  // ===== 顶部色块 =====
  const HEAD = 190;
  p.rect(0, 0, W, HEAD, '#007AFF');
  p.text('验 房 报 告', W / 2, 78, 42, '#FFFFFF', 'bold', 'center');
  p.text(cur.date || '', W / 2, 122, 24, 'rgba(255,255,255,0.9)', '', 'center');
  p.text((cur.community || '') + ' ' + (cur.room || ''), W / 2, 168, 30, '#FFFFFF', 'bold', 'center');
  p.y = HEAD + 30;

  // ===== 报告信息卡 =====
  p.rect(PAD, p.y, COL, 108, '#FFFFFF', 12);
  p.text('报告编号：' + (d.reportNo || ''), PAD + 24, p.y + 38, 24, '#3C3C43');
  p.text('防伪码：' + (d.antiCode || ''), PAD + 24, p.y + 74, 24, '#007AFF');
  p.text('验房师：' + (ins.name || '—'), PAD + COL - 24, p.y + 38, 24, '#3C3C43', '', 'right');
  p.text(ins.company || '独立验房师', PAD + COL - 24, p.y + 74, 22, '#8E8E93', '', 'right');
  p.y += 108 + 24;

  // ===== 统计 =====
  const stats = [
    ['已检', d.doneCount || 0, '#007AFF'],
    ['问题', d.badCount || 0, '#FF3B30'],
    ['关注', d.midCount || 0, '#FF9500'],
    ['高风险', d.highCount || 0, '#FF3B30'],
    ['合格', Math.max(0, (d.doneCount || 0) - (d.badCount || 0) - (d.midCount || 0)), '#34C759']
  ];
  const cellW = COL / stats.length;
  p.rect(PAD, p.y, COL, 96, '#FFFFFF', 12);
  stats.forEach((s, i) => {
    const cx = PAD + cellW * i + cellW / 2;
    p.text(String(s[1]), cx, p.y + 46, 34, s[2], 'bold', 'center');
    p.text(s[0], cx, p.y + 76, 21, '#8E8E93', '', 'center');
  });
  p.y += 96 + 24;

  // ===== 综合评级 =====
  if (grade) {
    const reasons = (grade.reasons || []).slice(0, 4);
    const bodyH = p.para(grade.desc || '', PAD + 24, p.y + 96, COL - 48, 22, 32);
    const fixH = p.para(grade.fix || '', PAD + 24, p.y + 96 + bodyH + 8, COL - 48, 22, 32);
    let reasonH = 0;
    reasons.forEach((r, i) => { reasonH += p.para('· ' + r, PAD + 24, p.y + 96 + bodyH + fixH + 16 + i * 30, COL - 48, 21, 30); });
    const cardH = 96 + bodyH + fixH + reasonH + 24;
    p.rect(PAD, p.y, COL, cardH, (grade.color || '#007AFF') + '14', 12);
    p.rect(PAD, p.y, 8, cardH, grade.color || '#007AFF', 4);
    p.text('综合评级：' + (grade.label || '') + '（' + (grade.grade || '') + '级）', PAD + 24, p.y + 46, 28, grade.color || '#007AFF', 'bold');
    p.para(grade.desc || '', PAD + 24, p.y + 96, COL - 48, 22, 32, '#3C3C43');
    p.para(grade.fix || '', PAD + 24, p.y + 96 + bodyH + 8, COL - 48, 22, 32, '#1C1C1E', 'bold');
    reasons.forEach((r, i) => { p.para('· ' + r, PAD + 24, p.y + 96 + bodyH + fixH + 16 + i * 30, COL - 48, 21, 30, '#8E8E93'); });
    p.y += cardH + 24;
  }

  // ===== AI 结论 =====
  if (d.aiText) {
    const h = p.para(d.aiText, PAD + 24, p.y + 84, COL - 48, 23, 34);
    const cardH = 84 + h + 12;
    p.rect(PAD, p.y, COL, cardH, '#FFFFFF', 12);
    p.text('AI 验房结论', PAD + 24, p.y + 44, 26, '#1C1C1E', 'bold');
    p.para(d.aiText, PAD + 24, p.y + 84, COL - 48, 23, 34, '#3C3C43');
    p.y += cardH + 24;
  }

  // ===== 问题清单（全量，不截断）=====
  p.text('问题与关注清单（共 ' + problems.length + ' 项）', PAD, p.y + 30, 30, '#1C1C1E', 'bold');
  p.y += 46;
  p.line(PAD, p.y, W - PAD, '#D1D1D6');
  p.y += 20;

  if (!problems.length) {
    p.rect(PAD, p.y, COL, 88, '#E8F5EC', 12);
    p.text('本次检查未发现问题', PAD + 24, p.y + 52, 26, '#34C759', 'bold');
    p.y += 88 + 20;
  }

  problems.forEach((pr, i) => {
    const isBad = pr.type === 'bad';
    const color = isBad ? '#FF3B30' : '#FF9500';
    const photos = (pr.photos || []).map(x => (x && typeof x === 'object') ? x.url : x).filter(Boolean);

    // 先算高度
    const startY = p.y;
    const titleY = startY + 44;
    let cy = startY + 74;
    const titleH = p.para((i + 1) + '. ' + (pr.name || ''), PAD + 24, titleY, COL - 130, 26, 34, '#1C1C1E', 'bold');
    if (titleH > 34) cy = titleY + titleH + 6;

    if (pr.location) { p.para('📍 ' + pr.location, PAD + 24, cy, COL - 48, 22, 32, '#8E8E93'); cy += T.measureWrapped(ctx, '📍 ' + pr.location, COL - 48, 22, 32); }
    if (pr.metricTip) { p.para('📏 实测：' + pr.metricTip, PAD + 24, cy, COL - 48, 22, 32, '#3C3C43'); cy += T.measureWrapped(ctx, '📏 实测：' + pr.metricTip, COL - 48, 22, 32); }
    if (pr.note) { p.para('📝 ' + pr.note, PAD + 24, cy, COL - 48, 22, 32, '#3C3C43'); cy += T.measureWrapped(ctx, '📝 ' + pr.note, COL - 48, 22, 32); }
    if (pr.fix) { p.para('🔧 整改：' + pr.fix, PAD + 24, cy, COL - 48, 22, 32, '#007AFF'); cy += T.measureWrapped(ctx, '🔧 整改：' + pr.fix, COL - 48, 22, 32); }
    cy += 10;

    // 照片：每行 3 张
    const phW = (COL - 48 - 16) / 3;
    const phH = phW * 0.75;
    const rows = Math.ceil(photos.length / 3);
    const photosTop = cy;
    if (photos.length) cy += rows * (phH + 10);

    const cardH = cy - startY + 8;
    p.rect(PAD, startY, COL, cardH, '#FFFFFF', 12);
    p.rect(PAD, startY, 8, cardH, color, 4);
    // 类型标签
    p.rect(W - PAD - 118, startY + 20, 94, 38, color + '22', 8);
    p.text(isBad ? '问题' : '关注', W - PAD - 71, startY + 46, 22, color, 'bold', 'center');
    // 标题
    p.para((i + 1) + '. ' + (pr.name || ''), PAD + 24, titleY, COL - 130, 26, 34, '#1C1C1E', 'bold');

    let ty = titleY + (titleH > 34 ? titleH + 6 : 30);
    if (pr.location) { p.para('📍 ' + pr.location, PAD + 24, ty, COL - 48, 22, 32, '#8E8E93'); ty += T.measureWrapped(ctx, '📍 ' + pr.location, COL - 48, 22, 32); }
    if (pr.metricTip) { p.para('📏 实测：' + pr.metricTip, PAD + 24, ty, COL - 48, 22, 32, '#3C3C43'); ty += T.measureWrapped(ctx, '📏 实测：' + pr.metricTip, COL - 48, 22, 32); }
    if (pr.note) { p.para('📝 ' + pr.note, PAD + 24, ty, COL - 48, 22, 32, '#3C3C43'); ty += T.measureWrapped(ctx, '📝 ' + pr.note, COL - 48, 22, 32); }
    if (pr.fix) { p.para('🔧 整改：' + pr.fix, PAD + 24, ty, COL - 48, 22, 32, '#007AFF'); ty += T.measureWrapped(ctx, '🔧 整改：' + pr.fix, COL - 48, 22, 32); }

    // 绘制照片
    if (photos.length && !layoutOnly) {
      photos.slice(0, 9).forEach((url, k) => {
        const px = PAD + 24 + (k % 3) * (phW + 8);
        const py = photosTop + Math.floor(k / 3) * (phH + 10);
        const img = imgs[url];
        if (img && img.width) {
          ctx.drawImage(img, px, py - offsetY, phW, phH);
        } else {
          ctx.fillStyle = '#F2F2F7';
          ctx.fillRect(px, py, phW, phH);
          ctx.fillStyle = '#C7C7CC';
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('照片', px + phW / 2, py + phH / 2);
        }
      });
    }
    p.y = startY + cardH + 16;
  });

  // ===== 未检查项 =====
  const unchecked = d.unchecked || [];
  if (unchecked.length || d.uncheckedNote) {
    p.y += 8;
    const txt = unchecked.join('、') + (d.uncheckedNote ? (unchecked.length ? '；' : '') + d.uncheckedNote : '');
    const full = '本次未检查项：' + txt + '（因现场条件限制未能检查，特此说明）';
    const h = p.para(full, PAD + 24, p.y + 32, COL - 48, 22, 32, '#8E8E93');
    p.rect(PAD, p.y, COL, h + 52, '#FFF8E6', 12);
    p.para(full, PAD + 24, p.y + 32, COL - 48, 22, 32, '#8E6E2E');
    p.y += h + 52 + 16;
  }

  // ===== 签名区 =====
  p.y += 16;
  p.text('验房师签名', PAD + 20, p.y + 24, 24, '#8E8E93');
  p.text('业主确认', W / 2 + 20, p.y + 24, 24, '#8E8E93');
  if (!layoutOnly) {
    const sig = d.signature;
    const ownerSig = d.ownerSignature;
    if (sig && imgs[sig]) {
      const sh = 90, sw = sh * (imgs[sig].width / imgs[sig].height || 1);
      ctx.drawImage(imgs[sig], PAD + 20, p.y + 40 - offsetY, Math.min(sw, 200), sh);
    } else {
      p.text(ins.name || '验房师', PAD + 20, p.y + 90, 26, '#3C3C43', 'bold');
    }
    if (ownerSig && imgs[ownerSig]) {
      const sh = 90, sw = sh * (imgs[ownerSig].width / imgs[ownerSig].height || 1);
      ctx.drawImage(imgs[ownerSig], W / 2 + 20, p.y + 40 - offsetY, Math.min(sw, 200), sh);
    } else {
      p.text('（业主未签字）', W / 2 + 20, p.y + 90, 22, '#C7C7CC');
    }
  }
  p.y += 150;

  // ===== 页脚 =====
  p.line(PAD, p.y, W - PAD, '#D1D1D6');
  p.y += 34;
  p.y += p.para('免责声明：本报告仅针对交付时可检项目，不构成对隐蔽工程、结构安全的鉴定结论；涉及结构安全、渗漏等重大问题的，建议委托有资质的专业机构进一步检测。', PAD, p.y, COL, 20, 30, '#8E8E93');
  p.y += 8;
  p.y += p.para('验房师承诺：本人已按规范完成现场查验，报告内容真实、客观。', PAD, p.y, COL, 20, 30, '#8E8E93');
  p.y += 16;
  p.text('报告编号 ' + (d.reportNo || '') + ' · 防伪码 ' + (d.antiCode || ''), PAD, p.y, 20, '#C7C7CC');
  const pageTag = (opts.pageNo && opts.pageTotal && opts.pageTotal > 1)
    ? 'AI 验房师 生成 · 第 ' + opts.pageNo + '/' + opts.pageTotal + ' 页'
    : 'AI 验房师 生成';
  p.text(pageTag, W - PAD, p.y, 20, '#C7C7CC', '', 'right');
  p.y += 40;   // 底部留白

  return p.y;
}

module.exports = { render, W, PAD, COL };
