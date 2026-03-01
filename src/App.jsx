import { useState, useEffect, useRef, useCallback } from "react";

// ─── Google OAuth Config ───────────────────────────────────────────────────────
// ⚠️ ここにあなたのクライアントIDを貼り付けてください
const GOOGLE_CLIENT_ID = "761507724767-f0rmd48c8k5js8bnv8ufb0hrmdkl4hna.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";

// ─── Constants & Helpers ──────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const daysSince = (d) => !d ? 999 : Math.floor((new Date(today) - new Date(d)) / 86400000);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
const uid = () => Date.now() + Math.random();
const CATEGORIES = ["すべて","トップ","ボトム","スタンド","ムーブメント"];

// スプレッドシートの列マッピング（0始まり）
// A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7...
// O=14, Q=16, R=17, S=18, W=22
const COL = {
  CATEGORY: 2,   // C列: Top/Bottom
  POSITION: 4,   // E列: ポジション
  ACTION:   5,   // F列: アクション
  TECHNIQUE:6,   // G列: テクニック名
  PRIORITY: 14,  // O列: 優先度（★）
  VIDEO1:   16,  // Q列: 動画リンク1
  VIDEO2:   17,  // R列: 動画リンク2
  VIDEO3:   18,  // S列: 動画リンク3
  DRILL:    22,  // W列: Drillチェック
};

// カテゴリー変換（英語→日本語）
const catMap = (v) => {
  if (!v) return "ボトム";
  const u = v.toLowerCase();
  if (u.includes("top") || u.includes("トップ")) return "トップ";
  if (u.includes("bottom") || u.includes("ボトム")) return "ボトム";
  if (u.includes("stand") || u.includes("スタンド")) return "スタンド";
  return v;
};

// 優先度★★★以上を固定に
const isFixed = (v) => v && (v.match(/★/g)||[]).length >= 3;

// スプレッドシートの行からドリルオブジェクトへ変換
const rowToDrill = (row, index) => {
  const get = (i) => (row[i] || "").toString().trim();
  const videos = [get(COL.VIDEO1), get(COL.VIDEO2), get(COL.VIDEO3)].filter(Boolean);
  const tags = [get(COL.POSITION), get(COL.ACTION)].filter(Boolean);
  return {
    id: `sheet_${index}`,
    name: get(COL.TECHNIQUE) || `テクニック${index}`,
    category: catMap(get(COL.CATEGORY)),
    tags,
    description: tags.join(" → "),
    youtubeUrl: videos[0] || "",
    youtubeUrl2: videos[1] || "",
    youtubeUrl3: videos[2] || "",
    thumbnailUrl: "",
    fixed: isFixed(get(COL.PRIORITY)),
    lastDone: null,
    targetSeconds: 60,
    fromSheet: true,
  };
};

// ─── Sample Drills（シート未連携時のサンプル）────────────────────────────────
const SAMPLE_DRILLS = [
  { id:1, name:"シュリンプ（エスケープ）", category:"ボトム", tags:["ガードリカバリー","ムーブメント"], description:"ヒップエスケープの基本動作。", youtubeUrl:"", thumbnailUrl:"https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400&h=240&fit=crop", fixed:true, lastDone:"2026-02-25", targetSeconds:60 },
  { id:2, name:"シット・アウト", category:"トップ", tags:["タートル攻略"], description:"タートルポジションから素早く立ち上がるドリル。", youtubeUrl:"", thumbnailUrl:"", fixed:false, lastDone:"2026-02-20", targetSeconds:90 },
  { id:3, name:"コラー＆スリーブ ガードリテンション", category:"ボトム", tags:["ガード","コラースリーブ"], description:"コラー&スリーブガードのリテンション練習。", youtubeUrl:"", thumbnailUrl:"", fixed:false, lastDone:"2026-02-27", targetSeconds:120 },
  { id:4, name:"ダブルレッグテイクダウン", category:"スタンド", tags:["テイクダウン","レスリング"], description:"両足タックルの基本。", youtubeUrl:"", thumbnailUrl:"", fixed:true, lastDone:"2026-02-26", targetSeconds:60 },
];

const SAMPLE_ROUTINES = [
  { id:1, name:"ボトム中心の日", description:"ガード維持とスイープを中心に。", thumbnailUrl:"", targetMinutes:30, drillIds:[1,3], tags:["ボトム"] },
  { id:2, name:"トップ中心の日", description:"パスガードとフィニッシュを中心に。", thumbnailUrl:"", targetMinutes:25, drillIds:[2,4], tags:["トップ"] },
];

// ─── CSV Helpers ──────────────────────────────────────────────────────────────
const DRILL_HEADERS = ["id","name","category","tags","description","youtubeUrl","thumbnailUrl","targetSeconds","fixed","lastDone"];
const ROUTINE_HEADERS = ["id","name","description","thumbnailUrl","targetMinutes","drillIds","tags"];
const toCsvRow = (vals) => vals.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(",");
const parseCsvRows = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,""));
  return lines.slice(1).filter(l=>l.trim()).map(line => {
    const vals=[]; let cur="", inQ=false;
    for(let ch of line){ if(ch==='"') inQ=!inQ; else if(ch===','&&!inQ){vals.push(cur);cur="";}else cur+=ch; }
    vals.push(cur);
    const obj={};
    headers.forEach((h,i)=>{ obj[h]=(vals[i]||"").trim().replace(/^"|"$/g,""); });
    return obj;
  });
};
const drillsToCsv = (drills) => {
  const rows = drills.map(d => toCsvRow([d.id,d.name,d.category,(d.tags||[]).join("|"),d.description||"",d.youtubeUrl||"",d.thumbnailUrl||"",d.targetSeconds||60,d.fixed?1:0,d.lastDone||""]));
  return [DRILL_HEADERS.join(","),...rows].join("\n");
};
const routinesToCsv = (routines) => {
  const rows = routines.map(r => toCsvRow([r.id,r.name,r.description||"",r.thumbnailUrl||"",r.targetMinutes||30,(r.drillIds||[]).join("|"),(r.tags||[]).join("|")]));
  return [ROUTINE_HEADERS.join(","),...rows].join("\n");
};
const parseDrills = (text) => parseCsvRows(text).map(o=>({
  id:uid(), name:o.name||"無題", category:o.category||"ボトム",
  tags:(o.tags||"").split("|").filter(Boolean),
  description:o.description||"", youtubeUrl:o.youtubeUrl||"", thumbnailUrl:o.thumbnailUrl||"",
  targetSeconds:parseInt(o.targetSeconds)||60, fixed:o.fixed==="1", lastDone:o.lastDone||null,
}));
const parseRoutines = (text) => parseCsvRows(text).map(o=>({
  id:uid(), name:o.name||"無題", description:o.description||"",
  thumbnailUrl:o.thumbnailUrl||"", targetMinutes:parseInt(o.targetMinutes)||30,
  drillIds:(o.drillIds||"").split("|").filter(Boolean).map(Number),
  tags:(o.tags||"").split("|").filter(Boolean),
}));
const downloadCsv = (content, filename) => {
  const blob = new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8;"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&family=DM+Mono:wght@400;500&family=Noto+Sans+JP:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f9f8f6;--surface:#fff;--border:#e8e4de;--border-s:#c8c2b8;
  --text:#1a1814;--muted:#8a8278;
  --accent:#2b4c3f;--accent-l:#e8f0ec;--accent-m:#4a7c68;
  --danger:#8b3535;--tag:#f0ede8;--fix-bg:#f0f4f1;--fix-bd:#b8d4c4;
  --gold:#9a6b1a;--gold-l:#fef3e2;--blue:#3949ab;--blue-l:#e8eaf6;
  --r:8px;--sh:0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.05);
}
body{background:var(--bg);font-family:'Noto Sans JP',sans-serif;color:var(--text);-webkit-font-smoothing:antialiased;}
.app{max-width:720px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;}
.hd{padding:18px 20px 14px;border-bottom:1px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:30;}
.hd-in{display:flex;align-items:center;justify-content:space-between;}
.logo{font-family:'Shippori Mincho',serif;font-size:19px;font-weight:600;color:var(--accent);}
.logo-s{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-top:1px;}
.nav{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 20px;overflow-x:auto;scrollbar-width:none;}
.nav::-webkit-scrollbar{display:none;}
.nt{padding:11px 14px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;}
.nt:hover{color:var(--text);}
.nt.on{color:var(--accent);border-bottom-color:var(--accent);}
.content{flex:1;padding:20px;}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.st{font-family:'Shippori Mincho',serif;font-size:16px;font-weight:600;}
.ss{font-size:12px;color:var(--muted);margin-top:2px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:8px;overflow:hidden;transition:border-color .15s,box-shadow .15s;}
.card:hover{border-color:var(--accent-m);box-shadow:var(--sh);}
.card.sel{border-color:var(--accent);background:var(--accent-l);}
.card.fix{border-color:var(--fix-bd);background:var(--fix-bg);}
.card.done{opacity:.55;}
.cb{padding:14px 16px;}
.ct{display:flex;align-items:flex-start;gap:10px;}
.ck{width:22px;height:22px;border:1.5px solid var(--border-s);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;cursor:pointer;transition:all .15s;}
.ck.on{background:var(--accent);border-color:var(--accent);}
.ci{flex:1;min-width:0;}
.cn{font-size:14px;font-weight:500;margin-bottom:4px;}
.cm{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.tg{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--tag);color:var(--muted);}
.tg.cat{background:var(--accent-l);color:var(--accent);font-weight:500;}
.tg.rec{background:var(--gold-l);color:var(--gold);}
.tg.rtn{background:var(--blue-l);color:var(--blue);}
.tg.sheet{background:#e3f2fd;color:#1565c0;}
.ld{font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;margin-top:3px;}
.cdesc{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.65;}
.cact{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);}
.thumb{width:100%;height:110px;object-fit:cover;border-bottom:1px solid var(--border);display:block;}

/* Routine card */
.rtn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
@media(min-width:500px){.rtn-grid{grid-template-columns:1fr 1fr 1fr;}}
.rtn-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;transition:all .15s;cursor:pointer;}
.rtn-card:hover{border-color:var(--accent-m);box-shadow:var(--sh);transform:translateY(-1px);}
.rtn-ph{width:100%;height:60px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:30px;background:linear-gradient(135deg,var(--accent-l),#f0f4f1);}
.rtn-body{padding:14px 16px;}
.rtn-name{font-family:'Shippori Mincho',serif;font-size:15px;font-weight:600;margin-bottom:5px;}
.rtn-desc{font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6;}
.rtn-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.rtn-count{font-size:12px;color:var(--muted);}
.rtn-time{font-family:'DM Mono',monospace;font-size:12px;color:var(--accent-m);}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r);font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:all .15s;font-family:'Noto Sans JP',sans-serif;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn-p{background:var(--accent);color:white;border-color:var(--accent);}
.btn-p:hover:not(:disabled){background:#1e3a2f;}
.btn-o{background:white;border-color:var(--border-s);color:var(--text);}
.btn-o:hover{border-color:var(--accent);color:var(--accent);}
.btn-g{background:transparent;color:var(--muted);}
.btn-g:hover{color:var(--text);background:var(--tag);}
.btn-blue{background:var(--blue-l);border-color:#9fa8da;color:var(--blue);}
.btn-blue:hover{background:#c5cae9;}
.btn-sm{padding:5px 12px;font-size:12px;}
.btn-xs{padding:3px 9px;font-size:11px;}
.bti{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer;border:none;background:transparent;color:var(--muted);transition:all .12s;}
.bti:hover{background:var(--tag);color:var(--text);}
.bti.d:hover{background:#fdeaea;color:var(--danger);}

/* Filter */
.fb{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}
.fc{padding:4px 12px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:white;color:var(--muted);transition:all .12s;}
.fc:hover{border-color:var(--accent-m);color:var(--text);}
.fc.on{background:var(--accent);border-color:var(--accent);color:white;}

/* Summary */
.sum{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:18px;}
.sum-date{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);margin-bottom:6px;}
.sum-row{display:flex;gap:28px;align-items:baseline;flex-wrap:wrap;}
.sum-big{font-family:'Shippori Mincho',serif;font-size:32px;font-weight:600;color:var(--accent);line-height:1;}
.sum-label{font-size:12px;color:var(--muted);margin-top:2px;}
.sum-time{font-family:'DM Mono',monospace;font-size:22px;font-weight:500;color:var(--accent-m);}
.rtn-badge{display:inline-flex;align-items:center;gap:5px;background:var(--blue-l);color:var(--blue);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:500;margin-top:8px;}

/* Google Sheets panel */
.sheets-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:16px;}
.sheets-title{font-family:'Shippori Mincho',serif;font-size:15px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
.sheets-status{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;border-radius:6px;font-size:13px;}
.sheets-status.connected{background:#e8f5e9;color:#2e7d32;}
.sheets-status.disconnected{background:var(--tag);color:var(--muted);}
.sheets-status.loading{background:var(--accent-l);color:var(--accent-m);}
.sheets-status.error{background:#fdeaea;color:var(--danger);}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.dot.green{background:#4caf50;}
.dot.gray{background:#bbb;}
.dot.blue{background:var(--accent-m);}
.dot.red{background:var(--danger);}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.dot.blue{animation:pulse 1.2s ease infinite;}

/* Timer modal */
.ov{position:fixed;inset:0;background:rgba(20,18,14,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:var(--surface);border-radius:14px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;}
.mh{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
.mt{font-family:'Shippori Mincho',serif;font-size:16px;font-weight:600;}
.mb{padding:24px 20px 20px;}
.mf{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;}
.tmtabs{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:20px;}
.tmtab{flex:1;padding:7px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:var(--muted);background:white;border:none;transition:all .15s;}
.tmtab.on{background:var(--accent);color:white;}
.tmbig{text-align:center;margin-bottom:20px;}
.tmd{font-family:'DM Mono',monospace;font-size:58px;font-weight:500;color:var(--accent);line-height:1;}
.tml{font-size:12px;color:var(--muted);margin-top:6px;}
.tmt{font-size:11px;color:var(--muted);margin-top:3px;font-family:'DM Mono',monospace;}
.prog{height:5px;background:var(--border);border-radius:3px;margin-bottom:20px;overflow:hidden;}
.prog-b{height:100%;background:var(--accent-m);transition:width .5s linear;border-radius:3px;}
.prog-b.ov2{background:var(--danger);}
.tmctl{display:flex;gap:8px;justify-content:center;}

/* Memo */
.memo{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-top:18px;}
.memo-l{font-size:13px;font-weight:500;margin-bottom:10px;}
textarea.mi{width:100%;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.7;font-family:'Noto Sans JP',sans-serif;resize:vertical;min-height:80px;color:var(--text);background:var(--bg);outline:none;transition:border .15s;}
textarea.mi:focus{border-color:var(--accent);}

/* Form */
.fg{margin-bottom:16px;}
.fl{font-size:11px;font-weight:500;color:var(--muted);margin-bottom:6px;display:block;letter-spacing:.05em;text-transform:uppercase;}
.fi{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:'Noto Sans JP',sans-serif;color:var(--text);background:white;outline:none;transition:border .15s;}
.fi:focus{border-color:var(--accent);}
.fs{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8278' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}
.fp{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:14px;}
.tog{width:40px;height:22px;border-radius:11px;background:var(--border-s);cursor:pointer;position:relative;border:none;transition:background .2s;flex-shrink:0;}
.tog.on{background:var(--accent);}
.tog::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
.tog.on::after{transform:translateX(18px);}
.tr{display:flex;align-items:center;justify-content:space-between;}
.tp{width:100%;height:90px;object-fit:cover;border-radius:6px;margin-top:8px;border:1px solid var(--border);}

/* CSV drop */
.cdrop{border:2px dashed var(--border);border-radius:var(--r);padding:22px;text-align:center;cursor:pointer;transition:all .15s;}
.cdrop:hover,.cdrop.drag{border-color:var(--accent-m);background:var(--accent-l);}
.cdrop-i{font-size:26px;margin-bottom:6px;}
.cdrop-t{font-size:13px;color:var(--muted);}

/* Drill picker */
.dpick{border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-top:8px;}
.dpick-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;}
.dpick-item:last-child{border-bottom:none;}
.dpick-item:hover{background:var(--tag);}
.dpick-item.picked{background:var(--accent-l);}

/* Misc */
.dv{border:none;border-top:1px solid var(--border);margin:18px 0;}
.empty{text-align:center;padding:36px 20px;color:var(--muted);font-size:14px;}
.empty-i{font-size:32px;margin-bottom:10px;}
.ab{position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;z-index:10;}
.sc{font-size:13px;color:var(--muted);}
.sc span{font-weight:600;color:var(--accent);}
@keyframes fi{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
.fa{animation:fi .22s ease;}
.hint{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.6;}
.info-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:14px;}
.info-title{font-size:13px;font-weight:500;margin-bottom:8px;}
ol.steps{font-size:12px;color:var(--muted);line-height:2.1;padding-left:18px;}
code{font-family:'DM Mono',monospace;font-size:11px;background:var(--tag);padding:1px 5px;border-radius:3px;}
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  plus:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  pin:<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
  edit:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  link:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  star:<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  back:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  timer:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  play:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  reset:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.6"/></svg>,
  dl:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  close:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  rtn:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  sheets:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  sync:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
};

// ─── Timer Modal ──────────────────────────────────────────────────────────────
function TimerModal({ drill, onClose, onComplete }) {
  const [mode, setMode] = useState("timer");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const iRef = useRef(null);
  const target = drill.targetSeconds || 60;

  useEffect(() => {
    if (running) iRef.current = setInterval(() => setElapsed(e => e+1), 1000);
    else clearInterval(iRef.current);
    return () => clearInterval(iRef.current);
  }, [running]);

  const reset = () => { setRunning(false); setElapsed(0); };
  const display = mode==="timer" ? Math.max(0, target-elapsed) : elapsed;
  const pct = Math.min(elapsed/target,1);
  const over = mode==="timer" && elapsed>=target;
  const videos = [drill.youtubeUrl, drill.youtubeUrl2, drill.youtubeUrl3].filter(Boolean);

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="mh">
          <div className="mt">{drill.name}</div>
          <button className="btn btn-g btn-sm" style={{padding:"4px"}} onClick={onClose}>{Ic.close}</button>
        </div>
        <div className="mb">
          <div className="tmtabs">
            {[["timer","タイマー"],["sw","ストップウォッチ"]].map(([k,l])=>(
              <button key={k} className={`tmtab ${mode===k?"on":""}`} onClick={()=>{setMode(k);reset();}}>{l}</button>
            ))}
          </div>
          <div className="tmbig">
            <div className="tmd" style={over?{color:"var(--danger)"}:{}}>{fmtTime(display)}</div>
            <div className="tml">{mode==="timer"?(over?"⏰ 完了！":"残り時間"):"経過時間"}</div>
            <div className="tmt">目標: {fmtTime(target)}</div>
          </div>
          <div className="prog"><div className={`prog-b ${over?"ov2":""}`} style={{width:`${pct*100}%`}}/></div>
          <div className="tmctl">
            <button className="btn btn-o btn-sm" onClick={reset}>{Ic.reset} リセット</button>
            <button className="btn btn-p btn-sm" onClick={()=>setRunning(r=>!r)}>
              {running?<>{Ic.pause} 一時停止</>:<>{Ic.play} {elapsed===0?"スタート":"再開"}</>}
            </button>
          </div>
          {videos.length>0&&(
            <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>動画リンク</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {videos.map((url,i)=>(
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    style={{display:"inline-flex",alignItems:"center",gap:6,color:"var(--accent)",fontSize:12,textDecoration:"none",padding:"5px 10px",background:"var(--accent-l)",borderRadius:6}}>
                    {Ic.link} 動画{i+1}を開く
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn btn-o btn-sm" onClick={onClose}>キャンセル</button>
          <button className="btn btn-p btn-sm" onClick={()=>{onComplete(elapsed);onClose();}}>
            {Ic.check} やった！ ({fmtTime(elapsed)})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Google Sheets Panel ──────────────────────────────────────────────────────
function SheetsPanel({ onImport }) {
  const [token, setToken] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("柔術基本技");
  const [status, setStatus] = useState("disconnected");
  const [msg, setMsg] = useState("");
  const [count, setCount] = useState(0);

  // スプレッドシートIDをURLから抽出
  const extractId = (url) => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  };

  // Google OAuth ログイン
  const login = () => {
    if (!window.google) {
      setMsg("Google APIが読み込まれていません。ページをリロードしてください。");
      setStatus("error");
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          setStatus("error");
          setMsg("ログインに失敗しました: " + resp.error);
          return;
        }
        setToken(resp.access_token);
        setStatus("connected");
        setMsg("✅ Googleアカウントに接続しました");
      },
    });
    client.requestAccessToken();
  };

  const logout = () => {
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token);
    }
    setToken(null);
    setStatus("disconnected");
    setMsg("");
  };

  // スプレッドシートからデータを取得
  const fetchSheet = async () => {
    const id = extractId(sheetUrl);
    if (!id) { setMsg("URLが正しくありません。スプレッドシートのURLを貼り付けてください。"); setStatus("error"); return; }
    if (!token) { setMsg("先にGoogleアカウントでログインしてください。"); return; }

    setStatus("loading");
    setMsg("読み込み中...");

    try {
      const range = encodeURIComponent(`${sheetName}!A:Z`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "取得に失敗しました");
      }

      const data = await res.json();
      const rows = (data.values || []).slice(1); // 1行目はヘッダー

      // W列(index 22)にチェックがある行のみ
      const drillRows = rows.filter(row => {
        const val = (row[COL.DRILL] || "").toString().trim();
        return val === "TRUE" || val === "1" || val === "✓" || val === "☑" || val === "true";
      });

      if (drillRows.length === 0) {
        setStatus("error");
        setMsg(`「Drill」列(W列)にチェックがある行が見つかりませんでした。\nシート名「${sheetName}」のW列を確認してください。`);
        return;
      }

      const drills = drillRows.map((row, i) => rowToDrill(row, i));
      onImport(drills);
      setCount(drills.length);
      setStatus("connected");
      setMsg(`✅ ${drills.length}件のドリルを取り込みました（Drill列チェックあり）`);
    } catch (e) {
      setStatus("error");
      setMsg("エラー: " + e.message);
    }
  };

  const statusClass = { connected:"connected", disconnected:"disconnected", loading:"loading", error:"error" }[status];
  const dotClass = { connected:"green", disconnected:"gray", loading:"blue", error:"red" }[status];

  return (
    <div>
      <div className="sheets-panel">
        <div className="sheets-title">{Ic.sheets} Google スプレッドシート連携</div>

        <div className={`sheets-status ${statusClass}`}>
          <div className={`dot ${dotClass}`}/>
          <span>
            {status==="connected" && token && "接続済み"}
            {status==="connected" && !token && "未接続"}
            {status==="disconnected" && "未接続"}
            {status==="loading" && "読み込み中..."}
            {status==="error" && "エラー"}
          </span>
        </div>

        {!token ? (
          <button className="btn btn-blue" onClick={login}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Googleでログイン
          </button>
        ) : (
          <button className="btn btn-o btn-sm" onClick={logout}>ログアウト</button>
        )}

        {token && (
          <div style={{marginTop:16}}>
            <div className="fg">
              <label className="fl">スプレッドシートURL</label>
              <input className="fi" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."/>
              <div className="hint">GoogleスプレッドシートのURLをそのまま貼り付けてください</div>
            </div>
            <div className="fg">
              <label className="fl">シート名</label>
              <input className="fi" value={sheetName} onChange={e=>setSheetName(e.target.value)}
                placeholder="柔術基本技"/>
              <div className="hint">下部タブのシート名を入力（例：柔術基本技）</div>
            </div>
            <button className="btn btn-p" onClick={fetchSheet} disabled={!sheetUrl}>
              {Ic.sync} ドリルを取り込む
            </button>
          </div>
        )}

        {msg && (
          <div style={{marginTop:12,fontSize:12,padding:"10px 12px",borderRadius:6,
            background:status==="error"?"#fdeaea":status==="connected"?"#e8f5e9":"var(--accent-l)",
            color:status==="error"?"var(--danger)":status==="connected"?"#2e7d32":"var(--accent-m)",
            whiteSpace:"pre-wrap",lineHeight:1.7}}>
            {msg}
          </div>
        )}
      </div>

      <div className="info-box">
        <div className="info-title">📋 取り込みの仕組み</div>
        <div style={{fontSize:12,color:"var(--muted)",lineHeight:2}}>
          スプレッドシートの<strong>W列「Drill」にチェック（TRUE）</strong>がある行のみ取り込まれます。<br/>
          C列=カテゴリー、E列=ポジション（タグ）、F列=アクション（タグ）、G列=テクニック名、
          O列=優先度（★★★以上→固定メニュー）、Q・R・S列=動画リンク
        </div>
      </div>

      <div className="info-box">
        <div className="info-title">⚠️ スプレッドシートの共有設定</div>
        <ol className="steps">
          <li>スプレッドシートを開く</li>
          <li>右上「共有」→「リンクを知っている全員」に変更 <strong>または</strong> 自分のGmailアドレスに権限付与</li>
          <li>ログインに使ったGoogleアカウントと同じアカウントで閲覧できることを確認</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ drill, done, elapsed, onTimer, onToggle }) {
  return (
    <div className={`card ${drill.fixed?"fix":""} ${done?"done":""}`}>
      {drill.thumbnailUrl && <img className="thumb" src={drill.thumbnailUrl} alt="" style={{height:80}} onError={e=>e.target.style.display='none'}/>}
      <div className="cb">
        <div className="ct">
          <div className={`ck ${done?"on":""}`} onClick={onToggle}>{done&&<span style={{color:"white"}}>{Ic.check}</span>}</div>
          <div className="ci">
            <div className="cn" style={done?{textDecoration:"line-through"}:{}}>{drill.name}</div>
            <div className="cm">
              <span className="tg cat">{drill.category}</span>
              {drill.fixed&&<span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,color:"var(--accent-m)"}}>{Ic.pin} 固定</span>}
              {drill.fromSheet&&<span className="tg sheet">📊 シート</span>}
              {elapsed!=null&&elapsed>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--accent-m)"}}>✓ {fmtTime(elapsed)}</span>}
            </div>
          </div>
          <button className="btn btn-o btn-sm" onClick={onTimer} style={{flexShrink:0}}>{Ic.timer} タイマー</button>
        </div>
      </div>
    </div>
  );
}

// ─── Select Card ──────────────────────────────────────────────────────────────
function SelectCard({ drill, selected, onToggle, isRec, expanded, onExpand }) {
  return (
    <div className={`card ${selected?"sel":""}`}>
      <div className="cb">
        <div className="ct" onClick={onToggle} style={{cursor:"pointer"}}>
          <div className={`ck ${selected?"on":""}`}>{selected&&<span style={{color:"white"}}>{Ic.check}</span>}</div>
          <div className="ci">
            <div className="cn">{drill.name}</div>
            <div className="cm">
              <span className="tg cat">{drill.category}</span>
              {drill.tags.slice(0,2).map(t=><span key={t} className="tg">{t}</span>)}
              {isRec&&<span className="tg rec">{Ic.star} おすすめ</span>}
              {drill.fromSheet&&<span className="tg sheet">📊</span>}
            </div>
            <div className="ld">{drill.lastDone?`${daysSince(drill.lastDone)}日前`:"未実施"} · 目標 {fmtTime(drill.targetSeconds||60)}</div>
          </div>
          <span onClick={e=>{e.stopPropagation();onExpand();}} style={{color:"var(--muted)",fontSize:10,padding:"4px",cursor:"pointer",flexShrink:0}}>{expanded?"▲":"▼"}</span>
        </div>
        {expanded&&(
          <div className="cdesc">
            {drill.description}
            {[drill.youtubeUrl,drill.youtubeUrl2,drill.youtubeUrl3].filter(Boolean).map((url,i)=>(
              <div key={i} style={{marginTop:5}}>
                <a href={url} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:4,color:"var(--accent)",fontSize:12,textDecoration:"none"}}>
                  {Ic.link} 動画{i+1}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Manage Card ──────────────────────────────────────────────────────────────
function ManageCard({ drill, onEdit, onDelete, onToggleFixed }) {
  const [ex, setEx] = useState(false);
  return (
    <div className={`card ${drill.fixed?"fix":""}`}>
      <div className="cb">
        <div className="ct">
          <div className="ci">
            <div className="cn">{drill.name}</div>
            <div className="cm">
              <span className="tg cat">{drill.category}</span>
              {drill.tags.slice(0,3).map(t=><span key={t} className="tg">{t}</span>)}
              {drill.fixed&&<span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,color:"var(--accent-m)"}}>{Ic.pin} 固定</span>}
              {drill.fromSheet&&<span className="tg sheet">📊 シート</span>}
            </div>
          </div>
          <span onClick={()=>setEx(e=>!e)} style={{color:"var(--muted)",fontSize:10,padding:"4px",cursor:"pointer",flexShrink:0}}>{ex?"▲":"▼"}</span>
        </div>
        {ex&&<div className="cdesc">{drill.description}</div>}
        <div className="cact">
          <button className="bti" onClick={onToggleFixed}>{Ic.pin} {drill.fixed?"固定解除":"固定"}</button>
          {!drill.fromSheet&&<button className="bti" onClick={onEdit}>{Ic.edit} 編集</button>}
          <button className="bti d" onClick={()=>{if(window.confirm("削除しますか？"))onDelete();}}>{Ic.trash} 削除</button>
        </div>
      </div>
    </div>
  );
}

// ─── Routine Card ─────────────────────────────────────────────────────────────
function RoutineCard({ routine, drills, onLoad, onEdit, onDelete }) {
  const rDrills = (routine.drillIds||[]).map(id=>drills.find(d=>d.id===id||d.id===Number(id))).filter(Boolean);
  const totalSec = rDrills.reduce((a,d)=>a+(d.targetSeconds||60),0);
  return (
    <div className="rtn-card">
      <div className="rtn-ph">{Ic.rtn}</div>
      <div className="rtn-body">
        <div className="rtn-name">{routine.name}</div>
        {routine.description&&<div className="rtn-desc">{routine.description}</div>}
        <div className="rtn-meta">
          <span className="rtn-count">🥋 {rDrills.length} ドリル</span>
          <span className="rtn-time">⏱ {fmtTime(totalSec)}</span>
          {(routine.tags||[]).map(t=><span key={t} className="tg rtn" style={{fontSize:10}}>{t}</span>)}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-p btn-sm" onClick={onLoad}>{Ic.rtn} 練習開始</button>
          <button className="bti" onClick={onEdit}>{Ic.edit}</button>
          <button className="bti d" onClick={()=>{if(window.confirm("削除しますか？"))onDelete();}}>{Ic.trash}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Drill Form ───────────────────────────────────────────────────────────────
function DrillForm({ drill, onSave, onCancel }) {
  const [f, setF] = useState(drill||{name:"",category:"ボトム",tags:[],description:"",youtubeUrl:"",thumbnailUrl:"",fixed:false,targetSeconds:60});
  const [ti, setTi] = useState("");
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const TARGETS = [[30,"30秒"],[60,"1分"],[90,"1分30秒"],[120,"2分"],[180,"3分"],[300,"5分"]];
  return (
    <div className="app">
      <div className="hd"><div className="hd-in">
        <button className="btn btn-g" onClick={onCancel} style={{marginLeft:-8}}>{Ic.back} 戻る</button>
        <div className="logo" style={{fontSize:16}}>{drill?"ドリルを編集":"新規ドリル"}</div>
        <button className="btn btn-p btn-sm" onClick={()=>{if(!f.name.trim())return alert("ドリル名を入力してください");onSave(f);}}>保存</button>
      </div></div>
      <div className="content">
        <div className="fp fa">
          <div className="fg"><label className="fl">ドリル名 *</label><input className="fi" value={f.name} onChange={e=>set("name",e.target.value)} placeholder="例：シュリンプムーブ"/></div>
          <div className="fg"><label className="fl">カテゴリー</label>
            <select className="fi fs" value={f.category} onChange={e=>set("category",e.target.value)}>
              {["トップ","ボトム","スタンド","ムーブメント"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">目標時間</label>
            <select className="fi fs" value={f.targetSeconds} onChange={e=>set("targetSeconds",parseInt(e.target.value))}>
              {TARGETS.map(([s,l])=><option key={s} value={s}>{l}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">説明</label>
            <textarea className="fi mi" style={{minHeight:70}} value={f.description} onChange={e=>set("description",e.target.value)}/>
          </div>
          <div className="fg"><label className="fl">YouTube URL</label><input className="fi" value={f.youtubeUrl} onChange={e=>set("youtubeUrl",e.target.value)} placeholder="https://www.youtube.com/watch?v=..."/></div>
          <div className="fg"><label className="fl">タグ</label>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <input className="fi" style={{flex:1}} value={ti} onChange={e=>setTi(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}} placeholder="Enterで追加"/>
              <button className="btn btn-o btn-sm" onClick={()=>{if(ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}}>追加</button>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{f.tags.map(t=><span key={t} className="tg" style={{cursor:"pointer"}} onClick={()=>set("tags",f.tags.filter(x=>x!==t))}>{t} ✕</span>)}</div>
          </div>
          <div className="fg"><div className="tr">
            <div><div style={{fontSize:13,fontWeight:500}}>固定メニューにする</div></div>
            <button className={`tog ${f.fixed?"on":""}`} onClick={()=>set("fixed",!f.fixed)}/>
          </div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Routine Form ─────────────────────────────────────────────────────────────
function RoutineForm({ routine, drills, onSave, onCancel }) {
  const [f, setF] = useState(routine||{name:"",description:"",thumbnailUrl:"",targetMinutes:30,drillIds:[],tags:[]});
  const [ti, setTi] = useState("");
  const [filter, setFilter] = useState("すべて");
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const toggleDrill = (id) => {
    const ids = f.drillIds.map(Number);
    set("drillIds", ids.includes(Number(id)) ? ids.filter(x=>x!==Number(id)) : [...ids, Number(id)]);
  };
  const filteredDrills = drills.filter(d=>filter==="すべて"||d.category===filter);
  return (
    <div className="app">
      <div className="hd"><div className="hd-in">
        <button className="btn btn-g" onClick={onCancel} style={{marginLeft:-8}}>{Ic.back} 戻る</button>
        <div className="logo" style={{fontSize:16}}>{routine?"ルーティンを編集":"新規ルーティン"}</div>
        <button className="btn btn-p btn-sm" onClick={()=>{if(!f.name.trim())return alert("名前を入力してください");onSave({...f,drillIds:f.drillIds.map(d=>typeof d==="object"?d:d)});}}>保存</button>
      </div></div>
      <div className="content">
        <div className="fp fa">
          <div className="fg"><label className="fl">ルーティン名 *</label><input className="fi" value={f.name} onChange={e=>set("name",e.target.value)}/></div>
          <div className="fg"><label className="fl">メモ</label>
            <textarea className="fi mi" style={{minHeight:60}} value={f.description} onChange={e=>set("description",e.target.value)}/>
          </div>
          <div className="fg"><label className="fl">タグ</label>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <input className="fi" style={{flex:1}} value={ti} onChange={e=>setTi(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}} placeholder="Enterで追加"/>
              <button className="btn btn-o btn-sm" onClick={()=>{if(ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}}>追加</button>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{f.tags.map(t=><span key={t} className="tg" style={{cursor:"pointer"}} onClick={()=>set("tags",f.tags.filter(x=>x!==t))}>{t} ✕</span>)}</div>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div className="st" style={{marginBottom:10}}>ドリルを選択 <span style={{fontSize:13,fontWeight:400,color:"var(--muted)"}}>({f.drillIds.length}件)</span></div>
          <div className="fb">{CATEGORIES.map(c=><div key={c} className={`fc ${filter===c?"on":""}`} onClick={()=>setFilter(c)}>{c}</div>)}</div>
          <div className="dpick">
            {filteredDrills.map(d=>{
              const picked = f.drillIds.map(x=>String(x)).includes(String(d.id));
              return (
                <div key={d.id} className={`dpick-item ${picked?"picked":""}`} onClick={()=>toggleDrill(d.id)}>
                  <div className={`ck ${picked?"on":""}`} style={{width:18,height:18,margin:0}}>{picked&&<span style={{color:"white",fontSize:10}}>{Ic.check}</span>}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{d.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{d.category} · {fmtTime(d.targetSeconds||60)}{d.fromSheet&&" · 📊"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Panel ────────────────────────────────────────────────────────────────
function CsvPanel({ drills, routines, onImportDrills, onImportRoutines }) {
  const [msg, setMsg] = useState(null);
  const [drag, setDrag] = useState(null);
  const drillRef = useRef(); const rtnRef = useRef();
  const handleFile = (file, type) => {
    if (!file||!file.name.endsWith(".csv")) { setMsg({t:"error",m:"CSVファイルを選択してください"}); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        if (type==="drill") { const p=parseDrills(e.target.result); onImportDrills(p); setMsg({t:"ok",m:`✅ ドリル ${p.length} 件をインポートしました`}); }
        else { const p=parseRoutines(e.target.result); onImportRoutines(p); setMsg({t:"ok",m:`✅ ルーティン ${p.length} 件をインポートしました`}); }
      } catch(err){ setMsg({t:"error",m:"読み込みに失敗しました"}); }
    };
    reader.readAsText(file,"UTF-8");
  };
  const DropZone = ({type, label, ref2}) => (
    <div className={`cdrop ${drag===type?"drag":""}`} onClick={()=>ref2.current.click()}
      onDragOver={e=>{e.preventDefault();setDrag(type);}} onDragLeave={()=>setDrag(null)}
      onDrop={e=>{e.preventDefault();setDrag(null);handleFile(e.dataTransfer.files[0],type);}}>
      <div className="cdrop-i">📂</div><div className="cdrop-t">{label}</div>
      <input ref={ref2} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0],type)}/>
    </div>
  );
  return (
    <div>
      <div className="info-box" style={{marginBottom:14}}>
        <div className="info-title">🥋 ドリル CSV</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button className="btn btn-o btn-sm" onClick={()=>downloadCsv(drillsToCsv(drills),`drills_${today}.csv`)}>{Ic.dl} エクスポート（{drills.length}件）</button>
        </div>
        <DropZone type="drill" label="ドリルCSVをドロップ、またはクリックして選択" ref2={drillRef}/>
      </div>
      <div className="info-box" style={{marginBottom:14}}>
        <div className="info-title">{Ic.rtn} ルーティン CSV</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button className="btn btn-o btn-sm" onClick={()=>downloadCsv(routinesToCsv(routines),`routines_${today}.csv`)}>{Ic.dl} エクスポート（{routines.length}件）</button>
        </div>
        <DropZone type="routine" label="ルーティンCSVをドロップ" ref2={rtnRef}/>
      </div>
      {msg&&<div style={{fontSize:13,color:msg.t==="ok"?"var(--accent-m)":"var(--danger)",marginBottom:14}}>{msg.m}</div>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");
  const [drills, setDrills] = useState(SAMPLE_DRILLS);
  const [routines, setRoutines] = useState(SAMPLE_ROUTINES);
  const [selectedIds, setSelectedIds] = useState([]);
  const [doneIds, setDoneIds] = useState([]);
  const [elapsed, setElapsed] = useState({});
  const [filterCat, setFilterCat] = useState("すべて");
  const [memo, setMemo] = useState("");
  const [editDrill, setEditDrill] = useState(null);
  const [editRoutine, setEditRoutine] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [timerDrill, setTimerDrill] = useState(null);
  const [activeRoutine, setActiveRoutine] = useState(null);

  // Google API スクリプト読み込み
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const recommended = [...drills].sort((a,b)=>daysSince(b.lastDone)-daysSince(a.lastDone)).slice(0,3);
  const fixedDrills = drills.filter(d=>d.fixed);
  const todayExtra = drills.filter(d=>selectedIds.includes(d.id)&&!d.fixed);
  const allToday = [...fixedDrills, ...todayExtra];
  const totalElapsed = Object.values(elapsed).reduce((a,b)=>a+b,0);
  const filteredDrills = drills.filter(d=>filterCat==="すべて"||d.category===filterCat);

  const toggleSelect = id => setSelectedIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const markDone = id => {
    setDoneIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
    setDrills(p=>p.map(d=>d.id===id?{...d,lastDone:today}:d));
  };
  const handleTimerComplete = (id, sec) => {
    setElapsed(p=>({...p,[id]:(p[id]||0)+sec}));
    markDone(id);
  };
  const loadRoutine = (routine) => {
    const ids = (routine.drillIds||[]).map(id=>String(id));
    const nonFixed = drills.filter(d=>ids.includes(String(d.id))&&!d.fixed).map(d=>d.id);
    setSelectedIds(nonFixed);
    setActiveRoutine(routine);
    setTab("today");
  };
  const saveDrill = d => {
    if(d.id) setDrills(p=>p.map(x=>x.id===d.id?d:x));
    else setDrills(p=>[...p,{...d,id:Date.now(),lastDone:null}]);
    setEditDrill(null);
  };
  const saveRoutine = r => {
    if(r.id) setRoutines(p=>p.map(x=>x.id===r.id?r:x));
    else setRoutines(p=>[...p,{...r,id:Date.now()}]);
    setEditRoutine(null);
  };
  const importSheetDrills = (newDrills) => {
    // シートから取り込んだドリルは既存のシートドリルを置き換え
    setDrills(p=>[...p.filter(d=>!d.fromSheet), ...newDrills]);
  };

  if (editDrill !== null) return <><style>{CSS}</style><DrillForm drill={editDrill==="new"?null:editDrill} onSave={saveDrill} onCancel={()=>setEditDrill(null)}/></>;
  if (editRoutine !== null) return <><style>{CSS}</style><RoutineForm routine={editRoutine==="new"?null:editRoutine} drills={drills} onSave={saveRoutine} onCancel={()=>setEditRoutine(null)}/></>;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {timerDrill&&<TimerModal drill={timerDrill} onClose={()=>setTimerDrill(null)} onComplete={sec=>handleTimerComplete(timerDrill.id,sec)}/>}

        <div className="hd">
          <div className="hd-in">
            <div><div className="logo">柔術ドリル</div><div className="logo-s">BJJ Solo Drill Tracker</div></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {drills.some(d=>d.fromSheet)&&<span className="tg sheet" style={{fontSize:11}}>📊 {drills.filter(d=>d.fromSheet).length}件同期済み</span>}
            </div>
          </div>
        </div>

        <div className="nav">
          {[["today","今日の練習"],["routines","ルーティン"],["select","ドリル選択"],["manage","ドリル管理"],["sheets","シート連携"],["csv","CSV"]].map(([k,l])=>(
            <div key={k} className={`nt ${tab===k?"on":""}`} onClick={()=>setTab(k)}>{l}</div>
          ))}
        </div>

        {/* ── TODAY ── */}
        {tab==="today"&&(
          <div className="content fa">
            <div className="sum">
              <div className="sum-date">{today}</div>
              <div className="sum-row">
                <div><div className="sum-big">{doneIds.length}</div><div className="sum-label">/ {allToday.length} ドリル完了</div></div>
                {totalElapsed>0&&<div><div className="sum-time">⏱ {fmtTime(totalElapsed)}</div><div className="sum-label">合計練習時間</div></div>}
              </div>
              {activeRoutine&&<div className="rtn-badge">{Ic.rtn} {activeRoutine.name}</div>}
            </div>

            {fixedDrills.length>0&&(
              <>
                <div className="sh"><div><div className="st">📌 固定メニュー</div></div></div>
                {fixedDrills.map(d=><SessionCard key={d.id} drill={d} done={doneIds.includes(d.id)} elapsed={elapsed[d.id]} onTimer={()=>setTimerDrill(d)} onToggle={()=>markDone(d.id)}/>)}
                <hr className="dv"/>
              </>
            )}

            <div className="sh">
              <div><div className="st">今日のメニュー</div><div className="ss">{todayExtra.length===0?"ルーティンか個別選択で追加":`${todayExtra.length}件`}</div></div>
              <div style={{display:"flex",gap:6}}>
                <button className="btn btn-o btn-sm" onClick={()=>setTab("routines")}>{Ic.rtn} ルーティン</button>
                <button className="btn btn-o btn-sm" onClick={()=>setTab("select")}>{Ic.plus} 個別選択</button>
              </div>
            </div>

            {todayExtra.length===0
              ? <div className="empty"><div className="empty-i">🥋</div>ルーティンを選ぶか、ドリルを個別選択してください</div>
              : todayExtra.map(d=><SessionCard key={d.id} drill={d} done={doneIds.includes(d.id)} elapsed={elapsed[d.id]} onTimer={()=>setTimerDrill(d)} onToggle={()=>markDone(d.id)}/>)
            }

            <div className="memo">
              <div className="memo-l">📝 今日の感想・メモ</div>
              <textarea className="mi" placeholder="今日の練習の気づき..." value={memo} onChange={e=>setMemo(e.target.value)}/>
            </div>
          </div>
        )}

        {/* ── ROUTINES ── */}
        {tab==="routines"&&(
          <div className="content fa">
            <div className="sh">
              <div><div className="st">ルーティン</div></div>
              <button className="btn btn-p btn-sm" onClick={()=>setEditRoutine("new")}>{Ic.plus} 新規作成</button>
            </div>
            {routines.length===0
              ? <div className="empty"><div className="empty-i">📋</div>ルーティンがまだありません</div>
              : <div className="rtn-grid">
                  {routines.map(r=>(
                    <RoutineCard key={r.id} routine={r} drills={drills}
                      onLoad={()=>loadRoutine(r)}
                      onEdit={()=>setEditRoutine(r)}
                      onDelete={()=>setRoutines(p=>p.filter(x=>x.id!==r.id))}/>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── SELECT ── */}
        {tab==="select"&&(
          <>
            <div className="content fa">
              {recommended.length>0&&(
                <>
                  <div className="sh"><div><div className="st">⭐ おすすめ</div><div className="ss">最近やっていないドリル</div></div></div>
                  {recommended.map(d=><SelectCard key={d.id} drill={d} selected={selectedIds.includes(d.id)} onToggle={()=>toggleSelect(d.id)} isRec expanded={expandedId===d.id} onExpand={()=>setExpandedId(expandedId===d.id?null:d.id)}/>)}
                  <hr className="dv"/>
                </>
              )}
              <div className="sh"><div className="st">すべてのドリル</div></div>
              <div className="fb">{CATEGORIES.map(c=><div key={c} className={`fc ${filterCat===c?"on":""}`} onClick={()=>setFilterCat(c)}>{c}</div>)}</div>
              {filteredDrills.map(d=><SelectCard key={d.id} drill={d} selected={selectedIds.includes(d.id)} onToggle={()=>toggleSelect(d.id)} expanded={expandedId===d.id} onExpand={()=>setExpandedId(expandedId===d.id?null:d.id)}/>)}
            </div>
            <div className="ab">
              <div className="sc"><span>{selectedIds.length}</span> 件を選択中</div>
              <button className="btn btn-p" onClick={()=>setTab("today")} disabled={selectedIds.length===0}>今日のメニューに追加 →</button>
            </div>
          </>
        )}

        {/* ── MANAGE ── */}
        {tab==="manage"&&(
          <div className="content fa">
            <div className="sh">
              <div className="st">ドリル管理</div>
              <button className="btn btn-p btn-sm" onClick={()=>setEditDrill("new")}>{Ic.plus} 新規追加</button>
            </div>
            <div className="fb">{CATEGORIES.map(c=><div key={c} className={`fc ${filterCat===c?"on":""}`} onClick={()=>setFilterCat(c)}>{c}</div>)}</div>
            {filteredDrills.map(d=>(
              <ManageCard key={d.id} drill={d}
                onEdit={()=>setEditDrill(d)}
                onDelete={()=>setDrills(p=>p.filter(x=>x.id!==d.id))}
                onToggleFixed={()=>setDrills(p=>p.map(x=>x.id===d.id?{...x,fixed:!x.fixed}:x))}/>
            ))}
          </div>
        )}

        {/* ── SHEETS ── */}
        {tab==="sheets"&&(
          <div className="content fa">
            <div className="sh"><div><div className="st">シート連携</div><div className="ss">スプレッドシートからドリルを取り込む</div></div></div>
            <SheetsPanel onImport={importSheetDrills}/>
          </div>
        )}

        {/* ── CSV ── */}
        {tab==="csv"&&(
          <div className="content fa">
            <div className="sh"><div><div className="st">CSV管理</div></div></div>
            <CsvPanel drills={drills} routines={routines}
              onImportDrills={parsed=>setDrills(p=>[...p,...parsed])}
              onImportRoutines={parsed=>setRoutines(p=>[...p,...parsed])}/>
          </div>
        )}
      </div>
    </>
  );
}
