// utils/grade.js - 综合评级 + 多问题关联分析（纯规则引擎，端侧可跑）
// 用于判断分级维度：把验房结果自动量化为房屋质量等级，并识别系统性风险

// 综合评级：根据问题数量/比例/高风险数自动给出 A/B/C/D 四级
// 返回 {grade:'A'|'B'|'C'|'D', label, color, desc, fix, reasons[]}
function judgeReport(stats){
  const bad = stats.badCount||0;
  const mid = stats.midCount||0;
  const high = stats.highCount||0;
  const done = stats.doneCount||1;
  const total = bad + mid;
  const rate = done>0 ? Math.round(total/done*100) : 0;
  const reasons = [];
  if(high>=1) reasons.push('发现高风险项 ' + high + ' 项（涉及结构/安全/渗漏等）');
  if(rate>=35) reasons.push('问题项占已检项 ' + rate + '%，比例偏高');
  if(bad>=10) reasons.push('问题项达 ' + bad + ' 项，数量较多');
  if(rate>=20 && rate<35 && bad<10 && high===0) reasons.push('问题项占已检项 ' + rate + '%，整体合格但需整改');
  if(bad>=6 && bad<10 && high===0 && rate<20) reasons.push('问题项 ' + bad + ' 项，略多于一般水平');
  // D：有高风险项 或 问题比例≥35% 或 问题数≥10
  if(high>=1 || rate>=35 || bad>=10){
    return { grade:'D', label:'不合格', color:'#FF3B30',
      desc:'存在高风险项或问题比例偏高，建议收房前要求全面整改，整改后复检确认。',
      fix:'优先处理高风险项（7天内），其余按整改通知单限期完成',
      reasons: reasons.length?reasons:['存在高风险项或问题比例≥35%'] };
  }
  // C：问题比例≥20% 或 问题数≥6
  if(rate>=20 || bad>=6){
    return { grade:'C', label:'合格（需整改）', color:'#FF9500',
      desc:'整体合格但问题较多，建议逐项整改后复检，重点关注渗漏、电路类隐患。',
      fix:'按整改通知单限期整改（15天内），整改后预约复检',
      reasons: reasons.length?reasons:['问题项占已检项 ' + rate + '%，或问题数达 ' + bad + ' 项'] };
  }
  // B：问题比例≥8% 或 问题数≥2
  if(rate>=8 || bad>=2){
    return { grade:'B', label:'基本合格', color:'#34C759',
      desc:'少量问题，不影响正常使用，建议装修前处理关注项。',
      fix:'关注项装修前处理即可，问题项建议整改',
      reasons: reasons.length?reasons:['问题项 ' + bad + ' 项，占已检项 ' + rate + '%'] };
  }
  return { grade:'A', label:'良好', color:'#007AFF',
    desc:'本次检查未发现明显问题，房屋质量良好。',
    fix:'无需整改，保留报告备查',
    reasons:['未发现问题项，全部检测项合格'] };
}

// 多问题关联分析：输入问题列表，返回系统性风险结论数组
// 覆盖更全面的组合场景，比单一问题判断更能体现老师傅经验
function correlate(problems){
  const ps = problems || [];
  const names = ps.map(p=>p.name||'').join(' ');
  const find = [];
  const result = [];

  // 通用取词：检查问题名或类别是否包含关键词
  const has = (kw) => names.indexOf(kw) >= 0;
  const count = (re) => ps.filter(p => re.test((p.name||'')+(p.category||''))).length;

  // 1. 墙面裂缝 + 渗水 = 结构风险
  if(has('裂缝') && /渗|漏/.test(names)){
    result.push('结构风险：墙面裂缝+渗水同时出现，可能涉及结构或防水失效，建议委托第三方结构检测');
  }
  // 2. 电气问题 ≥3 = 整体电气不合格
  const elecN = count(/插座|电箱|漏保|开关|配电|回路/);
  if(elecN >= 3) result.push('电气系统：电气问题'+elecN+'项，整体施工质量不合格，建议全面排查线路');
  // 3. 空鼓 ≥3 = 整体抹灰/贴砖差
  const kgN = count(/空鼓/);
  if(kgN >= 3) result.push('抹灰贴砖：空鼓'+kgN+'处，整体施工质量差，建议逐间排查');
  // 4. 防水 + 渗水 = 防水重做
  if(has('防水') && /渗|漏/.test(names)) result.push('防水系统：防水问题+渗水并见，建议卫生间/阳台整体重做防水');
  // 5. 门窗 ≥3 = 门窗整体不合格
  const dmN = count(/窗|门|密封|玻璃|五金/);
  if(dmN >= 3) result.push('门窗系统：门窗问题'+dmN+'项，建议整体检查安装质量');
  // 6. 地面裂缝/空鼓 + 渗水 = 楼板/防水问题
  if(/地面|地板|地砖/.test(names) && (/裂缝/.test(names)||/空鼓/.test(names)) && /渗|漏/.test(names)){
    result.push('楼地面渗漏：地面缺陷与渗水并见，可能有楼板裂缝或防水失效，建议闭水试验验证');
  }
  // 7. 管道 + 渗漏 = 给排水隐患
  if(/管道|水管|地漏|龙头/.test(names) && /渗|漏/.test(names)){
    result.push('给排水：管道类问题与渗漏并见，建议打压/通球测试后修复');
  }
  // 8. 排烟/排气 + 串味/返味 = 公共烟道问题
  if(/排烟|烟道|排气/.test(names) && /串味|返味|倒灌/.test(names)){
    result.push('排烟系统：排烟与串味并见，可能为公共烟道或止逆阀问题，建议物业协调检查');
  }
  // 9. 燃气 + 泄漏/报警 = 安全隐患
  if(/燃气|煤气/.test(names) && /泄漏|报警|软管/.test(names)){
    result.push('燃气安全：燃气类问题务必优先处理，建议燃气公司上门检测后再入住');
  }
  // 10. 阳台/护栏 + 松动/高度 = 高空坠落风险
  if(/阳台|护栏|栏杆/.test(names) && /松动|高度|间距/.test(names)){
    result.push('高空安全：阳台护栏问题涉及人身安全，建议优先加固处理');
  }
  // 11. 层高/面积 + 偏差 = 合同违约风险
  if(/层高|净高|面积/.test(names) && /偏差|不足|不符/.test(names)){
    result.push('合同风险：层高/面积偏差可能触发退房或赔偿条款，建议保留证据咨询律师');
  }
  // 12. 地面坡度/排水 + 积水 = 排水不畅
  if(/坡度|排水|地漏/.test(names) && /积水|返水|堵塞/.test(names)){
    result.push('排水系统：坡度或排水问题+积水，建议重做找坡或疏通管道');
  }

  // 输出：若没有任何系统风险，给出整体判断
  if(!result.length){
    return [{ level:'ok', text:'问题分散，未发现明显系统性风险，可按单项建议整改。' }];
  }
  return result.map(t => ({ level:'warn', text:t }));
}

module.exports = { judgeReport, correlate };
