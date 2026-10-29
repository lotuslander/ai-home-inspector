// utils/canvasText.js - Canvas 文字排版工具（自动换行、截断、多行测量）
// 报告长图导出必须正确处理中文换行，否则长文本会溢出画布被裁掉。

// 估算字符宽度：中文/全角按 1 个 fontSize，英文数字按约 0.55
function charWidth(ch, fontSize) {
  const code = ch.charCodeAt(0);
  const isWide = code > 255 && !(code >= 0xff61 && code <= 0xff9f);
  return isWide ? fontSize : fontSize * 0.55;
}

// 把文本按最大宽度折成多行
// 中文逐字断行；英文按空格断词，单词过长也强制断开
function wrapText(ctx, text, maxWidth, fontSize) {
  const str = String(text == null ? '' : text).replace(/\r/g, '');
  if (!str) return [''];
  ctx.font = ctx.font || '';
  const out = [];
  // 已存在的换行优先
  str.split('\n').forEach((paragraph) => {
    if (!paragraph) { out.push(''); return; }
    let line = '';
    let lineW = 0;
    for (let i = 0; i < paragraph.length; i++) {
      const ch = paragraph[i];
      const w = charWidth(ch, fontSize);
      if (lineW + w > maxWidth && line) {
        out.push(line);
        line = ch;
        lineW = w;
      } else {
        line += ch;
        lineW += w;
      }
    }
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}

// 绘制多行文本，返回绘制后的 y 坐标（下一行起点）
function drawWrapped(ctx, text, x, y, maxWidth, fontSize, lineHeight, color) {
  const lines = wrapText(ctx, text, maxWidth, fontSize);
  if (color) ctx.fillStyle = color;
  ctx.textAlign = 'left';
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, y + i * lineHeight);
  });
  return y + lines.length * lineHeight;
}

// 仅测量折行后的总高度
function measureWrapped(ctx, text, maxWidth, fontSize, lineHeight) {
  return wrapText(ctx, text, maxWidth, fontSize).length * lineHeight;
}

// 截断到指定宽度，超出加省略号
function ellipsis(ctx, text, maxWidth, fontSize) {
  const str = String(text == null ? '' : text);
  if (!str) return '';
  let w = 0;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const cw = charWidth(str[i], fontSize);
    if (w + cw > maxWidth) return out + '…';
    out += str[i];
    w += cw;
  }
  return out;
}

module.exports = { wrapText, drawWrapped, measureWrapped, ellipsis, charWidth };
