// utils/asrEngine.js - 语音引擎（纯端侧）
// 能力：滚动分段录音 → 调用户自配ASR转写 → 回调每段文本
// 配置存 storage 'asrConfig'：{apiUrl, apiKey, model, type}
//   type=dashscope  ：通义DashScope本地文件直传（octet-stream），如 paraformer-v2
//   type=openai     ：OpenAI兼容 /audio/transcriptions（multipart file+model）
//   type=custom     ：自定义端点（body=音频字节）
// 未配置/失败时返回错误信息，由调用方引导配置

function getConfig() {
  try {
    const c = wx.getStorageSync('asrConfig');
    return c && c.apiUrl && c.apiKey ? c : null;
  } catch (e) { return null; }
}

function saveConfig(c) {
  try { wx.setStorageSync('asrConfig', c); return true; } catch (e) { return false; }
}

function clearConfig() {
  try { wx.removeStorageSync('asrConfig'); } catch (e) {}
}

// 上传并转写一段音频（tempFilePath）
// 返回 Promise<{text}>，失败 reject({msg})
function transcribe(filePath) {
  const cfg = getConfig();
  if (!cfg) return Promise.reject({ msg: 'NO_CONFIG', hint: '请先到「我的-语音引擎」配置ASR接口' });
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (r) => {
        const buf = r.data; // ArrayBuffer
        const type = cfg.type || 'dashscope';
        const header = {
          'Authorization': 'Bearer ' + cfg.apiKey,
          'Content-Type': type === 'dashscope' ? 'application/octet-stream' : 'application/octet-stream'
        };
        if (type === 'openai') {
          // OpenAI兼容：multipart form（用uploadFile）
          wx.uploadFile({
            url: cfg.apiUrl,
            filePath,
            name: 'file',
            formData: { model: cfg.model || 'whisper-1' },
            header: { 'Authorization': 'Bearer ' + cfg.apiKey },
            success: (u) => {
              try {
                const j = JSON.parse(u.data);
                const text = (j && (j.text || j.output && j.output.text)) || '';
                resolve({ text });
              } catch (e) { reject({ msg: 'ASR响应解析失败', raw: u.data }); }
            },
            fail: (e) => reject({ msg: 'ASR请求失败', err: e.errMsg })
          });
        } else {
          // dashscope / custom：body直接传音频字节
          const url = cfg.apiUrl + (cfg.apiUrl.indexOf('?') >= 0 ? '&' : '?') + 'model=' + encodeURIComponent(cfg.model || 'paraformer-realtime-v2');
          wx.request({
            url,
            method: 'POST',
            data: buf,
            header,
            timeout: 30000,
            success: (s) => {
              if (s.statusCode >= 200 && s.statusCode < 300) {
                try {
                  const d = s.data;
                  const text = (d && (d.text || (d.output && d.output.text))) || '';
                  resolve({ text });
                } catch (e) { reject({ msg: 'ASR响应解析失败', raw: s.data }); }
              } else {
                reject({ msg: 'ASR返回' + s.statusCode, raw: s.data });
              }
            },
            fail: (e) => reject({ msg: 'ASR请求失败', err: e.errMsg })
          });
        }
      },
      fail: (e) => reject({ msg: '读取录音失败', err: e.errMsg })
    });
  });
}

// ===== 滚动分段录音器（单例）=====
// start({onSegment(seg), onEnd(total), onError(err), maxMs}) 
//   每 maxMs（默认60秒）自动切段，段文件交给 onSegment 转写；stop() 收尾
// 注意：wx.getRecorderManager()是全局单例，onStop/onError必须只注册一次，
//       否则重复createRecorder会导致回调累积、段号错乱。
let _recorder = null;

function createRecorder() {
  if (_recorder) return _recorder;
  const rm = wx.getRecorderManager();
  let running = false, segNo = 0, maxMs = 60000;

  // 每段录音控制（start一次录一段，到maxMs自动stop并续录）
  let onSegment = null, onEnd = null, onError = null;

  function startSegment() {
    if (!running) return;
    rm.start({
      duration: maxMs,
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 32000
    });
  }

  rm.onStop((res) => {
    const wasRunning = running;
    if (!wasRunning && segNo === 0) return; // 从未启动过的多余stop
    segNo++;
    const file = res.tempFilePath;
    if (onSegment) onSegment({ segNo, filePath: file, duration: (res.duration || 0) });
    if (wasRunning) {
      // 正常滚动续录：延迟300ms无缝录下一段（避免紧接start偶发失败）
      setTimeout(() => { if (running) startSegment(); }, 300);
    } else if (onEnd) {
      // 手动停止：最后一段已交给onSegment转写，收尾
      onEnd({ segCount: segNo });
    }
  });

  rm.onError((e) => {
    if (onError) onError(e);
    running = false;
  });

  _recorder = {
    isRunning: () => running,
    // 开始滚动录音
    start(opts) {
      onSegment = opts.onSegment; onEnd = opts.onEnd; onError = opts.onError;
      maxMs = opts.maxMs || 60000;
      running = true; segNo = 0;
      // 先请求授权
      wx.authorize({
        scope: 'scope.record',
        success: () => { startSegment(); },
        fail: () => {
          running = false;
          if (onError) onError({ errMsg: '未授权麦克风' });
        }
      });
    },
    // 停止并收尾（最后一段仍会回调onSegment转写；silent=true时不再调onEnd，用于页面隐藏静默收尾）
    stop(silent) {
      if (!running) return;
      running = false;
      rm.stop();
      if (silent) onEnd = null; // 静默：onStop里的onEnd不再触发
    }
  };
  return _recorder;
}

module.exports = { getConfig, saveConfig, clearConfig, transcribe, createRecorder };
