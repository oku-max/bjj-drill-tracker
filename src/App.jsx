import { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

// ─── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAV3Ua9G_zukeNN2M_Hnh00LfVDdoGvaCw",
  authDomain: "bjj-drill-tracker-9238c.firebaseapp.com",
  projectId: "bjj-drill-tracker-9238c",
  storageBucket: "bjj-drill-tracker-9238c.firebasestorage.app",
  messagingSenderId: "912789534137",
  appId: "1:912789534137:web:dfc89f4351e4ac67cef268"
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const USER_ID = "hiroki"; // 固定ユーザーID（個人利用のため）
const dbRef = () => doc(db, "users", USER_ID);

// ─── Google OAuth Config ───────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = "761507724767-f0rmd48c8k5js8bnv8ufb0hrmdkl4hna.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ─── Constants ────────────────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const daysSince = (d) => !d ? 999 : Math.floor((new Date(today) - new Date(d)) / 86400000);
const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const CATEGORIES = ["すべて","トップ","ボトム","スタンディング","ハーフ","バック","ドリル"];
const PROFICIENCY_LEVELS = [
  "0.知らない・忘れた",
  "1.やり方はわかるけどうまく使えない",
  "2.スパーで再現できる・挑戦中",
  "3.得意技",
];
const WEEK_DAYS = ["日","月","火","水","木","金","土"];

const ACTIONS = ["すべて","エスケープ・ディフェンス","パスガード","アタック","スイープ","リテンション","コントロール","テイクダウン","崩し"];
const POSITIONS = ["すべて","01.サイド","02.マウント","03.クローズド","03.ニーオン","04.ハーフガード","04.ニーシールド","05.スパイダー・ラッソー","06.バック","07.スタンディング","08.オープンガード","09.バタフライ・シッティング","10.デラヒーバ","11.タートル","12.ノースサウス","13.ヘッドロック","14.Xガード","15.シングルレッグガード","16.ヘッドクオーター","17.コンバットベース","18.片襟片袖"];

// Google Drive URLを直接表示可能なURLに変換
const toDriveImg = (url) => {
  if (!url) return "";
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
};

// (動画変換はVideoPlayerコンポーネント内で処理)

// ─── Column Mapping ───────────────────────────────────────────────────────────
const COL = {
  ID:       0,   // A列: 固有ID
  SERIES:   1,   // B列: シリーズ
  CATEGORY: 2,   // C列: Top/Bottom
  LESSON:   3,   // D列: レッスン
  POSITION: 4,   // E列: ポジション
  ACTION:   5,   // F列: アクション
  TECHNIQUE:6,   // G列: テクニック名
  FAVORITE: 13,  // N列: お気に入り（チェックボックス）
  PRIORITY: 14,  // O列: 習熟度
  VIDEO1:   16,  // Q列: 動画1
  VIDEO2:   17,  // R列: 動画2
  VIDEO3:   18,  // S列: 動画3
  DRILL:    22,  // W列: Drillチェック
  MEMO:     23,  // X列: ドリル用メモ
  REF_URL:  24,  // Y列: Reference URL (OneNote/Notion)
  LAST_DONE:25,  // Z列: 最終実施日（アプリから書き戻し）
  DONE_CNT: 26,  // AA列: 実施回数（アプリから書き戻し）
  IMAGE:    33,  // AH列: 画像URL
};

const catMap = (v) => {
  if (!v) return "ボトム";
  const u = v.toLowerCase();
  if (u.includes("1") || u.includes("top") || u.includes("トップ")) return "トップ";
  if (u.includes("2") || u.includes("bottom") || u.includes("ボトム")) return "ボトム";
  if (u.includes("3") || u.includes("stand") || u.includes("スタンド")) return "スタンディング";
  if (u.includes("4") || u.includes("half") || u.includes("ハーフ")) return "ハーフ";
  if (u.includes("5") || u.includes("back") || u.includes("バック")) return "バック";
  if (u.includes("0") || u.includes("drill") || u.includes("ドリル")) return "ドリル";
  return v;
};
const starCount = (v) => v ? (v.match(/★/g)||[]).length : 0;
const isFixed = (v) => starCount(v) >= 3;

const rowToDrill = (row) => {
  const get = (i) => (row[i]||"").toString().trim();
  const sheetId = get(COL.ID);
  const videos = [get(COL.VIDEO1), get(COL.VIDEO2), get(COL.VIDEO3)].filter(Boolean);
  const tags = [get(COL.POSITION), get(COL.ACTION)].filter(Boolean);
  return {
    sheetId,
    name: get(COL.TECHNIQUE) || "（名前なし）",
    series: get(COL.SERIES),
    category: catMap(get(COL.CATEGORY)),
    position: get(COL.POSITION),
    action: get(COL.ACTION),
    tags,
    lesson: get(COL.LESSON),
    favorite: ["TRUE","1","✓","☑"].includes(get(COL.FAVORITE).toUpperCase()),
    proficiency: get(COL.PRIORITY),  // O列: 習熟度テキスト
    sheetMemo: get(COL.MEMO),
    youtubeUrl: videos[0]||"",
    youtubeUrl2: videos[1]||"",
    youtubeUrl3: videos[2]||"",
    imageUrl: "",  // 画像は使用しない
    refUrl: get(COL.REF_URL),
    fromSheet: true,
    drillActive: true,
  };
};

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):def; } catch{return def;} },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch{} },
};

// ─── Sample Data ──────────────────────────────────────────────────────────────
const SAMPLE_DRILLS = [
  { id:"s1", sheetId:"1", name:"シュリンプ（エスケープ）", series:"Basic", category:"ボトム", tags:["ガード","ムーブメント"], sheetMemo:"ヒップエスケープの基本動作。腰を使って相手から離れる。", youtubeUrl:"", imageUrl:"", fixed:true, lastDone:"2026-02-25", targetSeconds:60, history:[], fromSheet:false },
  { id:"s2", sheetId:"2", name:"ダブルレッグテイクダウン", series:"Basic", category:"スタンド", tags:["テイクダウン"], sheetMemo:"両足タックルの基本。", youtubeUrl:"", imageUrl:"", fixed:true, lastDone:"2026-02-26", targetSeconds:60, history:[], fromSheet:false },
  { id:"s3", sheetId:"3", name:"コラー＆スリーブ ガードリテンション", series:"Basic", category:"ボトム", tags:["ガード"], sheetMemo:"コラー&スリーブガードのリテンション練習。", youtubeUrl:"", imageUrl:"", fixed:false, lastDone:"2026-01-15", targetSeconds:120, history:[], fromSheet:false },
];
const SAMPLE_ROUTINES = [
  { id:"r1", name:"ボトム中心の日", description:"ガード維持とスイープ中心", targetMinutes:30, drillIds:["s1","s3"], tags:["ボトム"] },
  { id:"r2", name:"スタンド強化", description:"テイクダウン中心", targetMinutes:20, drillIds:["s2"], tags:["スタンド"] },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&family=DM+Mono:wght@400;500&family=Noto+Sans+JP:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f9f8f6;--surface:#fff;--border:#e8e4de;--border-s:#c8c2b8;
  --text:#1a1814;--muted:#8a8278;
  --accent:#2b4c3f;--accent-l:#e8f0ec;--accent-m:#4a7c68;
  --danger:#8b3535;--tag:#f0ede8;--fix-bg:#f0f4f1;--fix-bd:#b8d4c4;
  --gold:#9a6b1a;--gold-l:#fef3e2;--blue:#3949ab;--blue-l:#e8eaf6;
  --purple:#6a1b9a;--purple-l:#f3e5f5;
  --r:8px;--sh:0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.05);
}
body{background:var(--bg);font-family:'Noto Sans JP',sans-serif;color:var(--text);-webkit-font-smoothing:antialiased;}
.app{max-width:720px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;}
.hd{padding:14px 20px 12px;border-bottom:1px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:30;}
.hd-in{display:flex;align-items:center;justify-content:space-between;}
.logo{font-family:'Shippori Mincho',serif;font-size:18px;font-weight:600;color:var(--accent);}
.logo-s{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;}
.nav{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 16px;flex-wrap:wrap;position:sticky;top:57px;z-index:29;}
.nt{padding:10px 12px;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;}
.nt:hover{color:var(--text);}
.nt.on{color:var(--accent);border-bottom-color:var(--accent);}
.content{flex:1;padding:16px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:8px;overflow:hidden;transition:border-color .15s;}
.card:hover{border-color:var(--accent-m);}
.card.fix{border-color:var(--fix-bd);background:var(--fix-bg);}
.card.done{opacity:.6;}
.card.sel{border-color:var(--accent);background:var(--accent-l);}
.cb{padding:12px 14px;}
.ct{display:flex;align-items:flex-start;gap:10px;}
.ck{width:22px;height:22px;border:1.5px solid var(--border-s);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;cursor:pointer;transition:all .15s;}
.ck.on{background:var(--accent);border-color:var(--accent);}
.ci{flex:1;min-width:0;}
.cn{font-size:14px;font-weight:500;margin-bottom:3px;line-height:1.4;}
.cm{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:3px;}
.tg{font-size:11px;padding:2px 7px;border-radius:20px;background:var(--tag);color:var(--muted);}
.tg.cat{background:var(--accent-l);color:var(--accent);font-weight:500;}
.tg.sheet{background:#e3f2fd;color:#1565c0;}
.tg.fix-badge{background:var(--fix-bg);color:var(--accent-m);border:1px solid var(--fix-bd);}
.tg.gold{background:var(--gold-l);color:var(--gold);}
.tg.purple{background:var(--purple-l);color:var(--purple);}
.ld{font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;}
.detail{padding:10px 14px 12px;border-top:1px solid var(--border);background:var(--bg);}
.detail-img{width:100%;max-height:180px;object-fit:cover;border-radius:6px;margin-bottom:10px;border:1px solid var(--border);}
.detail-memo{font-size:12px;line-height:1.75;color:var(--text);white-space:pre-wrap;}
.card-memo{font-size:12px;line-height:1.6;color:var(--muted);margin-top:5px;padding-top:5px;border-top:1px solid var(--border);white-space:pre-wrap;}
.detail-series{font-size:11px;color:var(--muted);margin-bottom:6px;font-family:'DM Mono',monospace;}
.detail-vids{display:flex;flex-direction:column;gap:5px;margin-top:8px;}
.vid-link{display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:12px;text-decoration:none;padding:5px 10px;background:var(--accent-l);border-radius:6px;}
.detail-hist{margin-top:10px;}
.hist-title{font-size:11px;color:var(--muted);margin-bottom:5px;font-weight:500;}
.hist-chips{display:flex;flex-wrap:wrap;gap:4px;}
.hist-chip{font-size:10px;font-family:'DM Mono',monospace;padding:2px 8px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted);}
.detail-acts{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;}

.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:var(--r);font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:all .15s;font-family:'Noto Sans JP',sans-serif;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn-p{background:var(--accent);color:white;border-color:var(--accent);}
.btn-p:hover:not(:disabled){background:#1e3a2f;}
.btn-o{background:white;border-color:var(--border-s);color:var(--text);}
.btn-o:hover{border-color:var(--accent);color:var(--accent);}
.btn-g{background:transparent;color:var(--muted);}
.btn-g:hover{color:var(--text);background:var(--tag);}
.btn-blue{background:var(--blue-l);border-color:#9fa8da;color:var(--blue);}
.btn-sm{padding:5px 11px;font-size:12px;}
.btn-xs{padding:3px 8px;font-size:11px;}
.bti{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:4px 9px;border-radius:4px;cursor:pointer;border:none;background:transparent;color:var(--muted);transition:all .12s;}
.bti:hover{background:var(--tag);color:var(--text);}
.bti.d:hover{background:#fdeaea;color:var(--danger);}
.bti.unfix{color:var(--accent-m);}
.bti.unfix:hover{background:var(--accent-l);}

.fb{display:flex;gap:5px;margin-bottom:12px;flex-wrap:wrap;}
.fc{padding:4px 11px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:white;color:var(--muted);transition:all .12s;}
.fc:hover{border-color:var(--accent-m);color:var(--text);}
.fc.on{background:var(--accent);border-color:var(--accent);color:white;}

.sum{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:14px;}
.sum-date{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);margin-bottom:5px;}
.sum-row{display:flex;gap:24px;align-items:baseline;flex-wrap:wrap;}
.sum-big{font-family:'Shippori Mincho',serif;font-size:30px;font-weight:600;color:var(--accent);line-height:1;}
.sum-label{font-size:11px;color:var(--muted);margin-top:2px;}
.sum-time{font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:var(--accent-m);}
.rtn-badge{display:inline-flex;align-items:center;gap:5px;background:var(--blue-l);color:var(--blue);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:500;margin-top:6px;}

.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.st{font-family:'Shippori Mincho',serif;font-size:15px;font-weight:600;}
.ss{font-size:12px;color:var(--muted);margin-top:1px;}

.search-box{display:flex;gap:8px;margin-bottom:12px;}
.search-in{flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:var(--r);font-size:13px;font-family:'Noto Sans JP',sans-serif;outline:none;transition:border .15s;}
.search-in:focus{border-color:var(--accent);}
.search-count{font-size:12px;color:var(--muted);padding:9px 0;}

.rtn-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}
@media(min-width:500px){.rtn-grid{grid-template-columns:1fr 1fr 1fr;}}
.rtn-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;transition:all .15s;cursor:pointer;}
.rtn-card:hover{border-color:var(--accent-m);box-shadow:var(--sh);}
.rtn-ph{width:100%;height:52px;display:flex;align-items:center;justify-content:center;font-size:24px;background:linear-gradient(135deg,var(--accent-l),#f0f4f1);}
.rtn-body{padding:12px;}
.rtn-name{font-family:'Shippori Mincho',serif;font-size:14px;font-weight:600;margin-bottom:4px;}
.rtn-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;}

/* Progress */
.prog-tabs{display:flex;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:14px;}
.prog-tab{flex:1;padding:8px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:var(--muted);background:white;border:none;transition:all .15s;}
.prog-tab.on{background:var(--accent);color:white;}
.prog-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;}
.prog-title{font-size:13px;font-weight:500;margin-bottom:10px;color:var(--text);}
.day-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);}
.day-row:last-child{border-bottom:none;}
.day-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);width:80px;flex-shrink:0;}
.day-drills{flex:1;display:flex;flex-wrap:wrap;gap:4px;}
.day-chip{font-size:11px;padding:2px 8px;background:var(--accent-l);color:var(--accent);border-radius:20px;}
.day-time{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);flex-shrink:0;}
.week-bar-wrap{margin-bottom:8px;}
.week-bar-label{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px;}
.week-bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden;}
.week-bar-fill{height:100%;background:var(--accent-m);border-radius:4px;transition:width .5s;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;}
.stat-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;text-align:center;}
.stat-n{font-family:'Shippori Mincho',serif;font-size:24px;font-weight:600;color:var(--accent);}
.stat-l{font-size:11px;color:var(--muted);margin-top:2px;}

/* Suggest */
.suggest-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;}
.suggest-icon{font-size:20px;flex-shrink:0;}
.suggest-body{flex:1;min-width:0;}
.suggest-name{font-size:13px;font-weight:500;margin-bottom:3px;}
.suggest-reason{font-size:11px;color:var(--muted);}

/* Sheets panel */
.sheets-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px;}
.sheets-title{font-size:14px;font-weight:600;margin-bottom:10px;}
.sheets-status{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:9px 12px;border-radius:6px;font-size:13px;}
.sheets-status.connected{background:#e8f5e9;color:#2e7d32;}
.sheets-status.disconnected{background:var(--tag);color:var(--muted);}
.sheets-status.loading{background:var(--accent-l);color:var(--accent-m);}
.sheets-status.error{background:#fdeaea;color:var(--danger);}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.dot.green{background:#4caf50;}
.dot.gray{background:#bbb;}
.dot.blue{background:var(--accent-m);animation:pulse 1.2s ease infinite;}
.dot.red{background:var(--danger);}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}

/* Timer */
.ov{position:fixed;inset:0;background:rgba(20,18,14,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:var(--surface);border-radius:14px;width:100%;max-width:360px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;}
.mh{padding:16px 18px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
.mt{font-family:'Shippori Mincho',serif;font-size:15px;font-weight:600;}
.mb{padding:20px 18px 16px;}
.mf{padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;}
.tmtabs{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:16px;}
.tmtab{flex:1;padding:7px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:var(--muted);background:white;border:none;transition:all .15s;}
.tmtab.on{background:var(--accent);color:white;}
.tmbig{text-align:center;margin-bottom:16px;}
.tmd{font-family:'DM Mono',monospace;font-size:52px;font-weight:500;color:var(--accent);line-height:1;}
.tml{font-size:12px;color:var(--muted);margin-top:4px;}
.prog-bar{height:5px;background:var(--border);border-radius:3px;margin-bottom:16px;overflow:hidden;}
.prog-fill{height:100%;background:var(--accent-m);transition:width .5s linear;border-radius:3px;}
.prog-fill.over{background:var(--danger);}
.tmctl{display:flex;gap:8px;justify-content:center;}

.memo-area{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-top:14px;}
.memo-l{font-size:13px;font-weight:500;margin-bottom:8px;}
textarea.mi{width:100%;border:1px solid var(--border);border-radius:6px;padding:9px 11px;font-size:13px;line-height:1.7;font-family:'Noto Sans JP',sans-serif;resize:vertical;min-height:70px;color:var(--text);background:var(--bg);outline:none;transition:border .15s;}
textarea.mi:focus{border-color:var(--accent);}

.fg{margin-bottom:14px;}
.fl{font-size:11px;font-weight:500;color:var(--muted);margin-bottom:5px;display:block;letter-spacing:.05em;text-transform:uppercase;}
.fi{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:'Noto Sans JP',sans-serif;color:var(--text);background:white;outline:none;transition:border .15s;}
.fi:focus{border-color:var(--accent);}
.fs{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8278' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}
.fp{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px;}
.tog{width:40px;height:22px;border-radius:11px;background:var(--border-s);cursor:pointer;position:relative;border:none;transition:background .2s;flex-shrink:0;}
.tog.on{background:var(--accent);}
.tog::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
.tog.on::after{transform:translateX(18px);}
.tr{display:flex;align-items:center;justify-content:space-between;}

.info-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;}
.hint{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.6;}
code{font-family:'DM Mono',monospace;font-size:11px;background:var(--tag);padding:1px 5px;border-radius:3px;}
ol.steps{font-size:12px;color:var(--muted);line-height:2.2;padding-left:16px;}

.dpick{border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-top:8px;max-height:300px;overflow-y:auto;}
.dpick-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;}
.dpick-item:last-child{border-bottom:none;}
.dpick-item:hover{background:var(--tag);}
.dpick-item.picked{background:var(--accent-l);}

.dv{border:none;border-top:1px solid var(--border);margin:14px 0;}
.empty{text-align:center;padding:32px 20px;color:var(--muted);font-size:13px;}
.empty-i{font-size:28px;margin-bottom:8px;}
.ab{position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--border);padding:11px 16px;display:flex;align-items:center;justify-content:space-between;z-index:10;}
.sc{font-size:13px;color:var(--muted);}
.sc span{font-weight:600;color:var(--accent);}
@keyframes fi{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.fa{animation:fi .2s ease;}
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  plus:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  pin:<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
  edit:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  link:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  star:<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  back:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  timer:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  play:<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause:<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  reset:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.6"/></svg>,
  close:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  rtn:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  sheets:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  sync:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  chart:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  unpin:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>,
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
  const pct = Math.min(elapsed/target, 1);
  const over = mode==="timer" && elapsed >= target;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="mh">
          <div className="mt" style={{fontSize:13}}>{drill.name}</div>
          <button className="btn btn-g btn-sm" style={{padding:"3px"}} onClick={onClose}>{Ic.close}</button>
        </div>
        <div className="mb">
          <div className="tmtabs">
            {[["timer","タイマー"],["sw","ストップウォッチ"]].map(([k,l])=>(
              <button key={k} className={`tmtab ${mode===k?"on":""}`} onClick={()=>{setMode(k);reset();}}>{l}</button>
            ))}
          </div>
          <div className="tmbig">
            <div className="tmd" style={over?{color:"var(--danger)"}:{}}>{fmtTime(display)}</div>
            <div className="tml">{mode==="timer"?(over?"⏰ 完了！":"残り時間"):"経過時間"} · 目標: {fmtTime(target)}</div>
          </div>
          <div className="prog-bar"><div className={`prog-fill ${over?"over":""}`} style={{width:`${pct*100}%`}}/></div>
          <div className="tmctl">
            <button className="btn btn-o btn-sm" onClick={reset}>{Ic.reset} リセット</button>
            <button className="btn btn-p btn-sm" onClick={()=>setRunning(r=>!r)}>
              {running?<>{Ic.pause} 停止</>:<>{Ic.play} {elapsed===0?"スタート":"再開"}</>}
            </button>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-o btn-sm" onClick={onClose}>キャンセル</button>
          <button className="btn btn-p btn-sm" onClick={()=>{onComplete(elapsed);onClose();}}>
            {Ic.check} 完了 ({fmtTime(elapsed)})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Video Player Component ───────────────────────────────────────────────────
function VideoPlayer({ videos }) {
  const [openIdx, setOpenIdx] = useState(null);

  const toEmbedUrl = (url) => {
    if (!url) return "";
    // Google Drive
    const drive = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
    // YouTube (通常URL・短縮URL・shorts)
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    // Vimeo
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return url;
  };

  const toggle = (i) => setOpenIdx(prev => prev === i ? null : i);

  return (
    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
      {videos.map((url, i) => (
        <div key={i}>
          <button
            onClick={()=>toggle(i)}
            style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",
              background:openIdx===i?"var(--accent)":"var(--accent-l)",
              color:openIdx===i?"white":"var(--accent)",
              border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:500,textAlign:"left",transition:"all .15s"}}>
            <span>{openIdx===i?"▼":"▶"}</span>
            <span>動画{i+1}</span>
            {openIdx===i&&<span style={{marginLeft:"auto",fontSize:11,opacity:.8}}>タップで閉じる</span>}
          </button>
          {openIdx===i&&(
            <div style={{marginTop:4,borderRadius:6,overflow:"hidden",background:"#000",
              position:"relative",width:"100%",paddingTop:"56.25%"}}>
              <iframe
                src={toEmbedUrl(url)}
                style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
                allow="autoplay"
                allowFullScreen
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Drill Card (共通) ────────────────────────────────────────────────────────
function DrillCard({ drill, mode, done, elapsed, selected, onToggle, onTimer, onUnfix, onDelete, onEdit, onMemoChange, onStarChange, onDrillToggle, onFavoriteChange, onProficiencyChange }) {
  const [open, setOpen] = useState(false);
  const hist = drill.history || [];
  const videos = [drill.youtubeUrl, drill.youtubeUrl2, drill.youtubeUrl3].filter(Boolean);

  return (
    <div className={`card ${drill.fixed||drill.fixedBySheet?"fix":""} ${done?"done":""} ${selected?"sel":""}`}>
      <div className="cb">
        <div className="ct">
          {/* チェックボックス or セレクト */}
          {(mode==="today"||mode==="select") && (
            <div className={`ck ${(done||selected)?"on":""}`} onClick={onToggle}>
              {(done||selected)&&<span style={{color:"white"}}>{Ic.check}</span>}
            </div>
          )}
          <div className="ci" onClick={()=>setOpen(o=>!o)} style={{cursor:"pointer"}}>
            <div className="cn">{drill.name}</div>
            <div className="cm">
              <span className="tg cat">{drill.category}</span>
              {drill.series&&<span className="tg">{drill.series}</span>}
              {drill.lesson&&<span className="tg" style={{background:"#e8f4fd",color:"#1565c0"}}>🎓 {drill.lesson}</span>}
              {drill.tags?.slice(0,2).map(t=><span key={t} className="tg">{t}</span>)}
              {drill.favorite&&<span className="tg" style={{background:"#fff0f5",color:"#c2185b"}}>♥ お気に入り</span>}
              {drill.proficiency&&<span className="tg" style={{background:"#f3e5f5",color:"#6a1b9a"}}>📈 {drill.proficiency}</span>}
              {(drill.fixed||drill.fixedBySheet)&&<span className="tg fix-badge">{Ic.pin} 固定</span>}
              {drill.fromSheet&&<span className="tg sheet">📊</span>}
              {elapsed>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--accent-m)"}}>✓ {fmtTime(elapsed)}</span>}
            </div>
            <div className="ld">
              {drill.lastDone?`${daysSince(drill.lastDone)}日前`:"未実施"}
              {hist.length>0&&` · 計${hist.length}回`}
              {mode==="today"&&` · 目標 ${fmtTime(drill.targetSeconds||60)}`}
            </div>
            {drill.sheetMemo&&<div className="card-memo">{drill.sheetMemo}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            {mode==="today"&&<button className="btn btn-o btn-xs" onClick={onTimer}>{Ic.timer}</button>}
            <span style={{fontSize:10,color:"var(--muted)",textAlign:"center",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>{open?"▲":"▼"}</span>
          </div>
        </div>
      </div>

      {open&&(
        <div className="detail">
          {drill.series&&<div className="detail-series">📚 {drill.series}</div>}
          {videos.length>0&&<VideoPlayer videos={videos}/>}
          {hist.length>0&&(
            <div className="detail-hist">
              <div className="hist-title">📅 実施履歴（直近10回）</div>
              <div className="hist-chips">
                {hist.slice(-10).reverse().map((h,i)=>(
                  <span key={i} className="hist-chip">{h.date} {h.sec?fmtTime(h.sec):""}</span>
                ))}
              </div>
            </div>
          )}
          {/* メモ・★ インライン編集 */}
          {onDrillToggle&&drill.fromSheet&&(
            <div style={{marginTop:10,padding:"8px 12px",background:"#fff8f8",borderRadius:6,border:"1px solid #f0d0d0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:12,fontWeight:500,color:"var(--danger)"}}>ドリルリストから外す</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>次回「書き戻し」時にW列のチェックが解除されます</div>
              </div>
              <button className="btn btn-sm" style={{background:"var(--danger)",color:"white",border:"none",flexShrink:0}}
                onClick={()=>{ if(window.confirm(`「${drill.name}」をドリルリストから外しますか？`)) onDrillToggle(drill.id); }}>
                外す
              </button>
            </div>
          )}
          {(onMemoChange||onFavoriteChange||onProficiencyChange)&&(
            <div style={{marginTop:10,background:"var(--bg)",borderRadius:6,padding:"10px 12px",border:"1px solid var(--border)"}}>
              <div style={{fontSize:11,color:"var(--muted)",fontWeight:500,marginBottom:8}}>✏️ 編集</div>

              {/* お気に入り */}
              {onFavoriteChange&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:500}}>♥ お気に入り</span>
                  <button className={`tog ${drill.favorite?"on":""}`}
                    style={{background: drill.favorite?"#c2185b":"var(--border-s)"}}
                    onClick={()=>onFavoriteChange(drill.id, !drill.favorite)}/>
                </div>
              )}

              {/* 習熟度 */}
              {onProficiencyChange&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:500}}>📈 習熟度</div>
                  <select className="fi fs" style={{fontSize:12}} value={drill.proficiency||""}
                    onChange={e=>onProficiencyChange(drill.id, e.target.value)}>
                    <option value="">-- 選択 --</option>
                    {PROFICIENCY_LEVELS.map(l=><option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}

              {/* メモ編集 */}
              {onMemoChange&&(
                <div>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:500}}>メモ</div>
                  <textarea className="mi" style={{minHeight:60,fontSize:12}}
                    value={drill.sheetMemo||""}
                    onChange={e=>onMemoChange(drill.id, e.target.value)}
                    placeholder="メモを入力..."/>
                </div>
              )}
            </div>
          )}
          {drill.refUrl&&(
            <a href={drill.refUrl} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:6,marginTop:10,padding:"8px 12px",
                background:"var(--blue-l)",color:"var(--blue)",borderRadius:6,fontSize:12,
                textDecoration:"none",fontWeight:500}}>
              {Ic.link} ノート参照（OneNote / Notion）
            </a>
          )}
          {/* アクションボタン */}
          <div className="detail-acts">
            {mode==="today"&&<button className="btn btn-o btn-xs" onClick={onTimer}>{Ic.timer} タイマー</button>}
            {(drill.fixed||drill.fixedBySheet)&&mode==="manage"&&(
              <button className="bti unfix" onClick={onUnfix}>{Ic.unpin} 固定から外す</button>
            )}
            {!drill.fixed&&!(drill.fixedBySheet)&&mode==="manage"&&(
              <button className="bti" onClick={onUnfix}>{Ic.pin} 固定にする</button>
            )}
            {!drill.fromSheet&&mode==="manage"&&<button className="bti" onClick={onEdit}>{Ic.edit} 編集</button>}
            {mode==="manage"&&<button className="bti d" onClick={()=>{if(window.confirm("削除しますか？"))onDelete();}}>{Ic.trash} 削除</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sheets Panel ─────────────────────────────────────────────────────────────
function SheetsPanel({ drills, onSync, quickAction, onActionDone, externalToken, onTokenChange, externalSheetUrl, onSheetUrlChange, externalSheetName, onSheetNameChange }) {
  const [token, setToken] = useState(externalToken||null);
  const [sheetUrl, setSheetUrl] = useState(externalSheetUrl||LS.get("sheetUrl",""));
  const [sheetName, setSheetName] = useState(externalSheetName||LS.get("sheetName","柔術基本技"));
  const [status, setStatus] = useState("disconnected");
  const [msg, setMsg] = useState("");
  const [lastSync, setLastSync] = useState(LS.get("lastSync",""));

  const extractId = url => { const m=url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m?m[1]:null; };

  // トークンをlocalStorageに保存（7日間）
  const TOKEN_KEY = "gsheet_token";
  const TOKEN_EXP_KEY = "gsheet_token_exp";
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    const exp = parseInt(localStorage.getItem(TOKEN_EXP_KEY)||"0");
    if (saved && Date.now() < exp) {
      setToken(saved); setStatus("connected"); setMsg("✅ 自動ログイン済み");
    } else if (saved) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXP_KEY);
      setStatus("disconnected"); setMsg("⚠️ ログインの有効期限が切れました。再ログインしてください。");
    }
  }, []);

  // ヘッダーボタンからのクイックアクション
  useEffect(() => {
    if (!quickAction || !token) return;
    if (quickAction === "read") fetchSheet();
    if (quickAction === "write") writeBack();
    onActionDone && onActionDone();
  }, [quickAction]);

  const login = () => {
    if (!window.google) { setMsg("Google APIが読み込まれていません。"); setStatus("error"); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { setStatus("error"); setMsg("ログイン失敗: "+resp.error); return; }
        setToken(resp.access_token);
        onTokenChange&&onTokenChange(resp.access_token, Date.now()+SEVEN_DAYS);
        setStatus("connected"); setMsg("✅ 接続しました（7日間ログイン維持）");
      },
    });
    client.requestAccessToken();
  };

  const logout = () => {
    if (token&&window.google) window.google.accounts.oauth2.revoke(token);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
    setToken(null); onTokenChange&&onTokenChange(null); setStatus("disconnected"); setMsg("");
  };

  const fetchSheet = async () => {
    const id = extractId(sheetUrl);
    if (!id) { setMsg("URLが正しくありません"); setStatus("error"); return; }
    if (!token) { setMsg("先にログインしてください"); return; }
    setStatus("loading"); setMsg("読み込み中...");
    LS.set("sheetUrl", sheetUrl); LS.set("sheetName", sheetName);
    try {
      const range = encodeURIComponent(`${sheetName}!A:AH`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const e=await res.json();
        const errMsg = e.error?.message||"取得失敗";
        if (res.status===401) {
          // 認証エラー → トークンクリア
          localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXP_KEY);
          setToken(null); setStatus("disconnected");
          throw new Error("認証エラー: 再ログインしてください（Googleトークンが期限切れです）");
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      const rows = (data.values||[]).slice(1);
      const drillRows = rows.filter(row=>{
        const v=(row[COL.DRILL]||"").toString().trim().toUpperCase();
        return v==="TRUE"||v==="1"||v==="✓"||v==="☑";
      });
      if (drillRows.length===0) { setStatus("error"); setMsg(`W列にチェックがある行が見つかりません（シート名:${sheetName}）`); return; }

      const newSheetDrills = drillRows.map(row=>rowToDrill(row));
      // 差分更新: sheetIdをキーに既存データを保持
      const result = onSync(newSheetDrills);
      const now = new Date().toLocaleString("ja-JP");
      setLastSync(now); LS.set("lastSync", now);
      setStatus("connected");
      setMsg(`✅ ${result.added}件追加、${result.updated}件更新（合計${result.total}件）`);
    } catch(e) { setStatus("error"); setMsg("エラー: "+e.message); }
  };

  const statusClass = {connected:"connected",disconnected:"disconnected",loading:"loading",error:"error"}[status];
  const dotClass = {connected:"green",disconnected:"gray",loading:"blue",error:"red"}[status];

  // ── 書き戻し機能 ────────────────────────────────────────────────────────────
  const writeBack = async () => {
    const id = extractId(sheetUrl);
    if (!id) { setMsg("URLが正しくありません"); setStatus("error"); return; }
    if (!token) { setMsg("先にログインしてください"); return; }

    // シートから行番号マップを取得（A列のsheetIdで行を特定）
    setStatus("loading"); setMsg("書き戻し中...");
    try {
      const range = encodeURIComponent(`${sheetName}!A:A`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        if (res.status===401) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXP_KEY); setToken(null); setStatus("disconnected"); throw new Error("認証エラー: 再ログインしてください"); }
        throw new Error("シート読み込み失敗");
      }
      const data = await res.json();
      const rows = data.values || [];

      // sheetId → 行番号マップ（1-indexed, 1行目はヘッダー）
      const rowMap = {};
      rows.forEach((row, i) => {
        if (i === 0) return; // ヘッダー行スキップ
        const sid = (row[0]||"").toString().trim();
        if (sid) rowMap[sid] = i + 1; // Sheets APIは1-indexed
      });

      // 書き戻すドリルを収集
      const sheetDrills = drills.filter(d => d.fromSheet && d.sheetId && rowMap[d.sheetId]);
      if (sheetDrills.length === 0) { setStatus("error"); setMsg("書き戻し対象のドリルが見つかりません"); return; }

      // バッチ更新データを構築
      // O列=15(index14), X列=24(index23), Z列=26(index25), AA列=27(index26)
      // Sheets APIの列: A=1, O=15, X=24, Z=26, AA=27
      const colLetter = (n) => {
        let s = "";
        while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };
      const O = colLetter(15); // O列: 優先度
      const X = colLetter(24); // X列: メモ
      const Z = colLetter(26); // Z列: 最終実施日
      const AA = colLetter(27); // AA列: 実施回数

      const valueRanges = [];
      sheetDrills.forEach(d => {
        const row = rowMap[d.sheetId];
        const stars = d.stars || 0;
        const starStr = "★".repeat(stars);

        // N列: お気に入り
        const N = colLetter(14);
        valueRanges.push({ range:`${sheetName}!${N}${row}`, values:[[d.favorite?"TRUE":""]] });
        // O列: 習熟度
        valueRanges.push({ range:`${sheetName}!${O}${row}`, values:[[d.proficiency||""]] });
        // W列: ドリルチェック（drillActive=falseなら空白に）
        const W = colLetter(23);
        valueRanges.push({ range:`${sheetName}!${W}${row}`, values:[[d.drillActive===false?"":"TRUE"]] });
        // X列: メモ
        valueRanges.push({ range:`${sheetName}!${X}${row}`, values:[[d.sheetMemo||""]] });
        // Z列: 最終実施日
        valueRanges.push({ range:`${sheetName}!${Z}${row}`, values:[[d.lastDone||""]] });
        // AA列: 実施回数
        valueRanges.push({ range:`${sheetName}!${AA}${row}`, values:[[(d.history||[]).length]] });
      });

      // batchUpdate
      const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: valueRanges })
        }
      );
      if (!writeRes.ok) {
        const e = await writeRes.json();
        throw new Error(e.error?.message || "書き込み失敗");
      }
      const now = new Date().toLocaleString("ja-JP");
      setStatus("connected");
      setMsg(`✅ ${sheetDrills.length}件をシートに書き戻しました（${now}）`);
    } catch(e) { setStatus("error"); setMsg("エラー: " + e.message); }
  };

  return (
    <div>
      <div className="sheets-panel">
        <div className="sheets-title">{Ic.sheets} Google スプレッドシート連携</div>
        <div className={`sheets-status ${statusClass}`}>
          <div className={`dot ${dotClass}`}/>
          <span>{status==="connected"&&token?"接続済み":status==="loading"?"読み込み中...":status==="error"?"エラー":"未接続"}</span>
          {lastSync&&status==="connected"&&<span style={{fontSize:11,marginLeft:"auto",color:"var(--muted)"}}>最終同期: {lastSync}</span>}
        </div>
        {!token
          ? <button className="btn btn-blue" onClick={login}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Googleでログイン
            </button>
          : <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-o btn-sm" onClick={logout}>ログアウト</button>
            </div>
        }
        {token&&(
          <div style={{marginTop:14}}>
            <div className="fg">
              <label className="fl">スプレッドシートURL</label>
              <input className="fi" value={sheetUrl} onChange={e=>{setSheetUrl(e.target.value);onSheetUrlChange&&onSheetUrlChange(e.target.value);}} placeholder="https://docs.google.com/spreadsheets/d/..."/>
            </div>
            <div className="fg">
              <label className="fl">シート名</label>
              <input className="fi" value={sheetName} onChange={e=>{setSheetName(e.target.value);onSheetNameChange&&onSheetNameChange(e.target.value);}} placeholder="柔術基本技"/>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-p" onClick={fetchSheet} disabled={!sheetUrl}>
                {Ic.sync} シートから読み込む
              </button>
              <button className="btn btn-o" onClick={writeBack} disabled={!sheetUrl}>
                {Ic.sheets} シートに書き戻す
              </button>
            </div>
          </div>
        )}
        {msg&&(
          <div style={{marginTop:10,fontSize:12,padding:"9px 11px",borderRadius:6,whiteSpace:"pre-wrap",lineHeight:1.7,
            background:status==="error"?"#fdeaea":status==="connected"?"#e8f5e9":"var(--accent-l)",
            color:status==="error"?"var(--danger)":status==="connected"?"#2e7d32":"var(--accent-m)"}}>
            {msg}
          </div>
        )}
      </div>
      <div className="info-box">
        <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>📋 差分更新の仕組み</div>
        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.9}}>
          A列の<strong>固有番号</strong>をキーにして更新します。<br/>
          新しい行 → 追加 / 既存の行 → メモ・画像・動画リンクを更新<br/>
          アプリ内で変えた固定設定や実施履歴は保持されます。
        </div>
      </div>
    </div>
  );
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────
function ProgressTab({ drills, sessionLogs }) {
  const [view, setView] = useState("week");

  // 直近7日のログ
  const last7 = useMemo(() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const dateStr = d.toISOString().split("T")[0];
      const log = sessionLogs[dateStr]||{drills:[],totalSec:0,memo:""};
      days.push({ date:dateStr, label:`${WEEK_DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`, ...log });
    }
    return days;
  }, [sessionLogs]);

  // 月次統計
  const monthStats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    let totalDays=0, totalDrills=0, totalSec=0;
    Object.entries(sessionLogs).forEach(([date,log])=>{
      if (date.startsWith(monthKey)&&log.drills?.length>0) {
        totalDays++; totalDrills+=log.drills.length; totalSec+=log.totalSec||0;
      }
    });
    return { totalDays, totalDrills, totalSec };
  }, [sessionLogs]);

  const maxDrills = Math.max(...last7.map(d=>d.drills?.length||0), 1);

  // テクニック別実施回数ランキング
  const techRanking = useMemo(() => {
    return [...drills]
      .filter(d=>(d.history||[]).length>0)
      .sort((a,b)=>(b.history||[]).length-(a.history||[]).length)
      .slice(0,10);
  }, [drills]);

  return (
    <div>
      <div className="prog-tabs">
        {[["week","週間"],["month","月間"],["ranking","テクニック別"]].map(([k,l])=>(
          <button key={k} className={`prog-tab ${view===k?"on":""}`} onClick={()=>setView(k)}>{l}</button>
        ))}
      </div>

      {view==="week"&&(
        <>
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-n">{last7.filter(d=>d.drills?.length>0).length}</div><div className="stat-l">練習日数</div></div>
            <div className="stat-box"><div className="stat-n">{last7.reduce((a,d)=>a+(d.drills?.length||0),0)}</div><div className="stat-l">総ドリル数</div></div>
            <div className="stat-box"><div className="stat-n">{fmtTime(last7.reduce((a,d)=>a+(d.totalSec||0),0))}</div><div className="stat-l">総練習時間</div></div>
          </div>
          <div className="prog-section">
            <div className="prog-title">📅 直近7日間</div>
            {last7.map(d=>(
              <div key={d.date} className="day-row">
                <div className="day-label">{d.label}</div>
                <div style={{flex:1}}>
                  {(d.drills?.length||0)>0
                    ? <>
                        <div className="week-bar-wrap">
                          <div className="week-bar"><div className="week-bar-fill" style={{width:`${((d.drills?.length||0)/maxDrills)*100}%`}}/></div>
                        </div>
                        <div className="day-drills">{(d.drills||[]).slice(0,4).map((name,i)=><span key={i} className="day-chip">{name}</span>)}{(d.drills||[]).length>4&&<span className="day-chip">+{d.drills.length-4}</span>}</div>
                      </>
                    : <span style={{fontSize:11,color:"var(--muted)"}}>— 休み</span>
                  }
                </div>
                {(d.totalSec||0)>0&&<div className="day-time">{fmtTime(d.totalSec)}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {view==="month"&&(
        <>
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-n">{monthStats.totalDays}</div><div className="stat-l">練習日数</div></div>
            <div className="stat-box"><div className="stat-n">{monthStats.totalDrills}</div><div className="stat-l">総ドリル数</div></div>
            <div className="stat-box"><div className="stat-n">{fmtTime(monthStats.totalSec)}</div><div className="stat-l">総時間</div></div>
          </div>
          <div className="prog-section">
            <div className="prog-title">📋 今月の練習記録</div>
            {Object.entries(sessionLogs)
              .filter(([date,log])=>{
                const now=new Date();
                return date.startsWith(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`)&&(log.drills?.length||0)>0;
              })
              .sort(([a],[b])=>b.localeCompare(a))
              .map(([date,log])=>(
                <div key={date} className="day-row">
                  <div className="day-label" style={{width:90}}>{date.slice(5)}</div>
                  <div className="day-drills">{(log.drills||[]).slice(0,5).map((n,i)=><span key={i} className="day-chip">{n}</span>)}{(log.drills||[]).length>5&&<span className="day-chip">+{log.drills.length-5}</span>}</div>
                  {(log.totalSec||0)>0&&<div className="day-time">{fmtTime(log.totalSec)}</div>}
                </div>
              ))
            }
          </div>
        </>
      )}

      {view==="ranking"&&(
        <div className="prog-section">
          <div className="prog-title">🏆 テクニック別実施回数</div>
          {techRanking.length===0
            ? <div className="empty"><div className="empty-i">📊</div>まだ練習記録がありません</div>
            : techRanking.map((d,i)=>{
                const hist = d.history||[];
                const maxH = Math.max(...techRanking.map(x=>(x.history||[]).length));
                return (
                  <div key={d.id} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:i===0?600:400}}>{i+1}. {d.name}</span>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--accent-m)"}}>{hist.length}回</span>
                    </div>
                    <div className="week-bar"><div className="week-bar-fill" style={{width:`${(hist.length/maxH)*100}%`}}/></div>
                    <div className="hist-chips" style={{marginTop:4}}>
                      {hist.slice(-5).reverse().map((h,j)=><span key={j} className="hist-chip">{h.date}</span>)}
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}
    </div>
  );
}

// ─── Suggest Tab ──────────────────────────────────────────────────────────────
function SuggestTab({ drills, onAddToToday }) {
  const suggestions = useMemo(() => {
    const result = [];
    // 7日以上やっていないドリル
    const stale = drills.filter(d=>daysSince(d.lastDone)>=7).sort((a,b)=>daysSince(b.lastDone)-daysSince(a.lastDone)).slice(0,3);
    stale.forEach(d=>result.push({drill:d,icon:"😴",reason:`${daysSince(d.lastDone)}日間未実施`}));
    // 優先度高いのにやっていない
    const highPri = drills.filter(d=>d.stars>=2&&daysSince(d.lastDone)>=3&&!stale.includes(d)).slice(0,2);
    highPri.forEach(d=>result.push({drill:d,icon:"⭐",reason:`優先度高（★${d.stars}）・${daysSince(d.lastDone)}日前`}));
    // 一度もやったことがない
    const never = drills.filter(d=>!d.lastDone).slice(0,2);
    never.forEach(d=>result.push({drill:d,icon:"🆕",reason:"まだ一度も実施していません"}));
    return result.slice(0,8);
  }, [drills]);

  return (
    <div>
      <div className="sh"><div><div className="st">おすすめドリル</div><div className="ss">AIが選ぶ今日やるべきドリル</div></div></div>
      {suggestions.length===0
        ? <div className="empty"><div className="empty-i">🎯</div>データが蓄積されるとおすすめが表示されます</div>
        : suggestions.map(({drill,icon,reason},i)=>(
            <div key={i} className="suggest-card">
              <div className="suggest-icon">{icon}</div>
              <div className="suggest-body">
                <div className="suggest-name">{drill.name}</div>
                <div className="suggest-reason">{reason} · {drill.category}</div>
              </div>
              <button className="btn btn-o btn-xs" onClick={()=>onAddToToday(drill.id)}>{Ic.plus} 追加</button>
            </div>
          ))
      }
    </div>
  );
}

// ─── Filter Row (共通) ────────────────────────────────────────────────────────
// multi=true のとき current は配列、onChange(v) でトグル
function FilterRow({label, values, current, onChange, multi=false}) {
  const rowRef = useRef(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const onMouseDown = (e) => { dragging.current=true; startX.current=e.pageX-rowRef.current.offsetLeft; scrollLeft.current=rowRef.current.scrollLeft; rowRef.current.style.cursor="grabbing"; };
  const onMouseUp = () => { dragging.current=false; if(rowRef.current) rowRef.current.style.cursor="grab"; };
  const onMouseMove = (e) => { if(!dragging.current||!rowRef.current) return; e.preventDefault(); const x=e.pageX-rowRef.current.offsetLeft; const walk=(x-startX.current)*1.5; rowRef.current.scrollLeft=scrollLeft.current-walk; };
  const isOn = (v) => multi ? current.includes(v) : current===v;
  return (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:500}}>{label}</div>
      <div ref={rowRef} style={{display:"flex",gap:5,flexWrap:"nowrap",overflowX:"auto",paddingBottom:6,cursor:"grab",userSelect:"none"}}
        onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onMouseMove={onMouseMove}>
        {values.map(v=><div key={v} className={`fc ${isOn(v)?"on":""}`} style={{flexShrink:0,fontSize:11}} onClick={()=>onChange(v)}>{v==="すべて"?"すべて":v.replace(/^\d+\./,"")}</div>)}
      </div>
    </div>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────
function SearchTab({ drills, routines, onAddToToday, onDeleteDrills, onCreateRoutine, onAddToRoutine, onShowRoutineMenu, onMemoChange, onStarChange, onDrillToggle, onFavoriteChange, onProficiencyChange }) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [actions, setActions] = useState([]);
  const [positions, setPositions] = useState([]);
  const [series, setSeries] = useState([]);
  const [sortBy, setSortBy] = useState("name");
  const [selectedIds, setSelectedIds] = useState([]);
  const [showRoutineMenu, setShowRoutineMenu] = useState(false);
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const seriesList = useMemo(()=>[...new Set(drills.map(d=>d.series).filter(Boolean))],[drills]);

  // トグル関数（配列）
  const toggleFilter = (setter) => (v) => {
    if (v==="すべて") { setter([]); return; }
    setter(prev => prev.includes(v) ? prev.filter(x=>x!==v) : [...prev, v]);
  };

  const filtered = useMemo(()=>{
    return drills
      .filter(d=>{
        if (d.drillActive===false) return false;
        if (favoriteOnly&&!d.favorite) return false;
        if (cats.length>0&&!cats.includes(d.category)) return false;
        if (actions.length>0&&!actions.some(a=>(d.action||"").includes(a))) return false;
        if (positions.length>0&&!positions.some(p=>(d.position||"").includes(p.replace(/^\d+\./,"").trim()))) return false;
        if (series.length>0&&!series.includes(d.series)) return false;
        if (!q) return true;
        const lq=q.toLowerCase();
        return d.name.toLowerCase().includes(lq)||
          (d.sheetMemo||"").toLowerCase().includes(lq)||
          (d.series||"").toLowerCase().includes(lq)||
          d.tags?.some(t=>t.toLowerCase().includes(lq))||
          (d.position||"").toLowerCase().includes(lq)||
          (d.action||"").toLowerCase().includes(lq);
      })
      .sort((a,b)=>{
        if (sortBy==="name") return a.name.localeCompare(b.name,"ja");
        if (sortBy==="lastDone") return daysSince(a.lastDone)-daysSince(b.lastDone);
        if (sortBy==="stars") return (b.stars||0)-(a.stars||0);
        if (sortBy==="history") return (b.history?.length||0)-(a.history?.length||0);
        return 0;
      });
  }, [drills, q, cats, actions, positions, series, sortBy, favoriteOnly]);

  const toggleSelect = (id) => {
    const sid = String(id);
    setSelectedIds(p => p.includes(sid) ? p.filter(x=>x!==sid) : [...p, sid]);
  };

  const clearSelect = () => setSelectedIds([]);

  return (
    <div>
      <div className="search-box">
        <input className="search-in" value={q} onChange={e=>setQ(e.target.value)}
          placeholder="テクニック名・メモ・タグで検索..."/>
        <button className="btn btn-sm" style={{flexShrink:0,
          background:favoriteOnly?"#c2185b":"white",
          color:favoriteOnly?"white":"var(--muted)",
          border:"1px solid",borderColor:favoriteOnly?"#c2185b":"var(--border)"}}
          onClick={()=>setFavoriteOnly(p=>!p)}>
          ♥ お気に入り
        </button>
        {q&&<button className="btn btn-g btn-sm" onClick={()=>setQ("")}>{Ic.close}</button>}
      </div>
      <FilterRow label="トップ・ボトム" values={["すべて",...CATEGORIES.slice(1)]} current={cats} onChange={toggleFilter(setCats)} multi/>
      <FilterRow label="アクション" values={["すべて",...ACTIONS.slice(1)]} current={actions} onChange={toggleFilter(setActions)} multi/>
      <FilterRow label="ポジション" values={["すべて",...POSITIONS.slice(1)]} current={positions} onChange={toggleFilter(setPositions)} multi/>
      {seriesList.length>0&&<FilterRow label="シリーズ" values={["すべて",...seriesList]} current={series} onChange={toggleFilter(setSeries)} multi/>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div className="search-count">{filtered.length}件</div>
          {(cats.length>0||actions.length>0||positions.length>0||series.length>0||q||favoriteOnly)&&
            <button className="btn btn-g btn-xs" onClick={()=>{setCats([]);setActions([]);setPositions([]);setSeries([]);setQ("");setFavoriteOnly(false);}}>リセット</button>}
        </div>
        <select className="fi fs" style={{width:"auto",fontSize:12,padding:"4px 24px 4px 8px"}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="name">名前順</option>
          <option value="lastDone">最近やった順</option>
          <option value="stars">優先度順</option>
          <option value="history">実施回数順</option>
        </select>
      </div>

      {/* 複数選択時のアクションバー */}
      {selectedIds.length>0&&(
        <div style={{position:"sticky",top:0,zIndex:20,background:"var(--accent)",color:"white",padding:"10px 14px",borderRadius:8,marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:500}}>{selectedIds.length}件選択中</span>
          <button className="btn btn-sm" style={{background:"rgba(255,255,255,.2)",color:"white",border:"none"}}
            onClick={()=>{ selectedIds.forEach(id=>onAddToToday(id)); clearSelect(); }}>
            {Ic.plus} 今日に追加
          </button>
          <button className="btn btn-sm" style={{background:"rgba(255,255,255,.2)",color:"white",border:"none"}}
            onClick={(e)=>{ onShowRoutineMenu({ids:selectedIds, rect:e.currentTarget.getBoundingClientRect()}); }}>
            {Ic.rtn} ルーティン▾
          </button>
          <button className="btn btn-sm" style={{background:"rgba(255,80,80,.3)",color:"white",border:"none",marginLeft:"auto"}}
            onClick={()=>{ if(window.confirm(`${selectedIds.length}件削除しますか？`)){onDeleteDrills(selectedIds); clearSelect();} }}>
            {Ic.trash} 削除
          </button>
          <button className="btn btn-sm" style={{background:"rgba(255,255,255,.15)",color:"white",border:"none"}}
            onClick={clearSelect}>{Ic.close}</button>
        </div>
      )}

      {filtered.length===0
        ? <div className="empty"><div className="empty-i">🔍</div>該当するドリルが見つかりません</div>
        : filtered.map(d=>(
            <DrillCard key={d.id} drill={d} mode="select"
              selected={selectedIds.includes(String(d.id))}
              onToggle={()=>toggleSelect(d.id)}
              onTimer={()=>{}} onUnfix={()=>{}} onDelete={()=>{}} onEdit={()=>{}}
              onMemoChange={onMemoChange} onStarChange={onStarChange}
              onDrillToggle={onDrillToggle}
              onFavoriteChange={onFavoriteChange} onProficiencyChange={onProficiencyChange}/>
          ))
      }
    </div>
  );
}

// ─── Routine Form ─────────────────────────────────────────────────────────────
function RoutineForm({ routine, drills, onSave, onCancel }) {
  const [f, setF] = useState(routine||{name:"",description:"",targetMinutes:30,drillIds:[],tags:[]});
  const [cat, setCat] = useState("すべて");
  const [action, setAction] = useState("すべて");
  const [pos, setPos] = useState("すべて");
  const [ser, setSer] = useState("すべて");
  const [q, setQ] = useState("");
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const toggle = id => {
    const ids = f.drillIds.map(String);
    set("drillIds", ids.includes(String(id)) ? ids.filter(x=>x!==String(id)) : [...ids, String(id)]);
  };
  const seriesList = ["すべて",...new Set(drills.map(d=>d.series).filter(Boolean))];
  const filtered = drills.filter(d=>{
    if (cat!=="すべて"&&d.category!==cat) return false;
    if (action!=="すべて"&&!(d.action||"").includes(action)) return false;
    if (pos!=="すべて"&&!(d.position||"").includes(pos.replace(/^\d+\./,"").trim())) return false;
    if (ser!=="すべて"&&d.series!==ser) return false;
    if (q&&!d.name.includes(q)&&!(d.sheetMemo||"").includes(q)) return false;
    return true;
  });
  return (
    <div className="app">
      <div className="hd"><div className="hd-in">
        <button className="btn btn-g" onClick={onCancel}>{Ic.back}</button>
        <div className="logo" style={{fontSize:15}}>{routine?"ルーティン編集":"新規ルーティン"}</div>
        <button className="btn btn-p btn-sm" onClick={()=>{if(!f.name.trim())return alert("名前を入力してください");onSave(f);}}>保存</button>
      </div></div>
      <div className="content">
        <div className="fp">
          <div className="fg"><label className="fl">名前</label><input className="fi" value={f.name} onChange={e=>set("name",e.target.value)}/></div>
          <div className="fg"><label className="fl">メモ</label><textarea className="fi mi" style={{minHeight:50}} value={f.description} onChange={e=>set("description",e.target.value)}/></div>
        </div>
        <div style={{marginBottom:8}}>
          <div className="sh"><div className="st">ドリル選択 <span style={{fontSize:13,fontWeight:400,color:"var(--muted)"}}>({f.drillIds.length})</span></div></div>
          <input className="fi" style={{marginBottom:8}} value={q} onChange={e=>setQ(e.target.value)} placeholder="テクニック名・メモ・タグで検索..."/>
          <FilterRow label="トップ・ボトム" values={CATEGORIES} current={cat} onChange={setCat}/>
          <FilterRow label="アクション" values={ACTIONS} current={action} onChange={setAction}/>
          <FilterRow label="ポジション" values={POSITIONS} current={pos} onChange={setPos}/>
          <FilterRow label="シリーズ" values={seriesList} current={ser} onChange={setSer}/>
          <div className="dpick">
            {filtered.map(d=>{
              const picked = f.drillIds.map(String).includes(String(d.id));
              return (
                <div key={d.id} className={`dpick-item ${picked?"picked":""}`} onClick={()=>toggle(d.id)}>
                  <div className={`ck ${picked?"on":""}`} style={{width:18,height:18,margin:0}}>{picked&&<span style={{color:"white",fontSize:10}}>{Ic.check}</span>}</div>
                  <div><div style={{fontSize:13,fontWeight:500}}>{d.name}</div><div style={{fontSize:11,color:"var(--muted)"}}>{d.category}{d.series&&` · ${d.series}`}</div></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drill Form ───────────────────────────────────────────────────────────────
function DrillForm({ drill, onSave, onCancel }) {
  const [f, setF] = useState(drill||{name:"",category:"ボトム",tags:[],sheetMemo:"",youtubeUrl:"",imageUrl:"",fixed:false,targetSeconds:60,history:[]});
  const [ti, setTi] = useState("");
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const TARGETS = [[30,"30秒"],[60,"1分"],[90,"1分30秒"],[120,"2分"],[180,"3分"],[300,"5分"]];
  return (
    <div className="app">
      <div className="hd"><div className="hd-in">
        <button className="btn btn-g" onClick={onCancel}>{Ic.back}</button>
        <div className="logo" style={{fontSize:15}}>{drill?"ドリル編集":"新規ドリル"}</div>
        <button className="btn btn-p btn-sm" onClick={()=>{if(!f.name.trim())return alert("名前を入力");onSave(f);}}>保存</button>
      </div></div>
      <div className="content">
        <div className="fp">
          <div className="fg"><label className="fl">名前 *</label><input className="fi" value={f.name} onChange={e=>set("name",e.target.value)}/></div>
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
          <div className="fg"><label className="fl">メモ</label><textarea className="fi mi" style={{minHeight:70}} value={f.sheetMemo} onChange={e=>set("sheetMemo",e.target.value)}/></div>
          <div className="fg"><label className="fl">YouTube URL</label><input className="fi" value={f.youtubeUrl} onChange={e=>set("youtubeUrl",e.target.value)} placeholder="https://www.youtube.com/..."/></div>
          <div className="fg"><label className="fl">タグ</label>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <input className="fi" style={{flex:1}} value={ti} onChange={e=>setTi(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}} placeholder="Enterで追加"/>
              <button className="btn btn-o btn-sm" onClick={()=>{if(ti.trim()){set("tags",[...f.tags,ti.trim()]);setTi("");}}}>追加</button>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{f.tags.map(t=><span key={t} className="tg" style={{cursor:"pointer"}} onClick={()=>set("tags",f.tags.filter(x=>x!==t))}>{t} ✕</span>)}</div>
          </div>
          <div className="fg"><div className="tr"><div style={{fontSize:13,fontWeight:500}}>固定メニューにする</div><button className={`tog ${f.fixed?"on":""}`} onClick={()=>set("fixed",!f.fixed)}/></div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");
  const [drills, setDrills] = useState(SAMPLE_DRILLS);
  const [routines, setRoutines] = useState(SAMPLE_ROUTINES);
  const routinesRef = useRef(SAMPLE_ROUTINES);
  const setRoutinesSafe = (r) => { routinesRef.current = r; setRoutines(r); };
  const [sessionLogs, setSessionLogs] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [doneIds, setDoneIds] = useState([]);
  const [elapsed, setElapsed] = useState({});
  const [filterCat, setFilterCat] = useState("すべて");
  const [memo, setMemo] = useState("");
  const [editDrill, setEditDrill] = useState(null);
  const [editRoutine, setEditRoutine] = useState(null);
  const [timerDrill, setTimerDrill] = useState(null);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState(null);
  const [quickAction, setQuickAction] = useState(null); // "read" | "write" | null
  // Sheet sync state（ヘッダーボタンから直接呼べるよう）
  const [sheetToken, setSheetToken] = useState(null);
  const [sheetUrl, setSheetUrl] = useState(()=>LS.get("sheetUrl",""));
  const [sheetName, setSheetName] = useState(()=>LS.get("sheetName","柔術基本技"));
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetStatus, setSheetStatus] = useState("disconnected");
  const [sheetLastSync, setSheetLastSync] = useState(LS.get("lastSync",""));

  const TOKEN_KEY = "gsheet_token";
  const TOKEN_EXP_KEY = "gsheet_token_exp";
  const extractSheetId = url => { const m=url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m?m[1]:null; };
  const colLetter = (n) => { let s=""; while(n>0){s=String.fromCharCode(64+(n%26||26))+s;n=Math.floor((n-1)/26);} return s; };

  // トークン自動復元
  useEffect(()=>{
    const saved=localStorage.getItem(TOKEN_KEY);
    const exp=parseInt(localStorage.getItem(TOKEN_EXP_KEY)||"0");
    if(saved&&Date.now()<exp){ setSheetToken(saved); setSheetStatus("connected"); }
    else if(saved){ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXP_KEY); }
  },[]);

  // ヘッダーからのシート読み込み
  const headerFetchSheet = async () => {
    const id = extractSheetId(sheetUrl);
    if(!id||!sheetToken){ setSheetMsg("⚠️ ログインまたはURL未設定"); return; }
    setSheetStatus("loading"); setSheetMsg("読み込み中...");
    try {
      const range = encodeURIComponent(`${sheetName}!A:AH`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
        {headers:{Authorization:`Bearer ${sheetToken}`}}
      );
      if(!res.ok){
        if(res.status===401){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_EXP_KEY);setSheetToken(null);setSheetStatus("disconnected");setSheetMsg("⚠️ 再ログインしてください");return;}
        throw new Error("取得失敗");
      }
      const data = await res.json();
      const rows = (data.values||[]).slice(1);
      const drillRows = rows.filter(row=>{const v=(row[COL.DRILL]||"").toString().trim().toUpperCase();return v==="TRUE"||v==="1"||v==="✓"||v==="☑";});
      if(drillRows.length===0){setSheetStatus("error");setSheetMsg("⚠️ W列にチェックが見つかりません");return;}
      const result = syncDrills(drillRows.map(row=>rowToDrill(row)));
      const now=new Date().toLocaleString("ja-JP");
      setSheetLastSync(now); LS.set("lastSync",now);
      setSheetStatus("connected");
      setSheetMsg(`✅ ${result.added}件追加、${result.updated}件更新`);
    } catch(e){ setSheetStatus("error"); setSheetMsg("⚠️ "+e.message); }
  };

  // ヘッダーからのシート書き戻し
  const headerWriteBack = async () => {
    const id = extractSheetId(sheetUrl);
    if(!id||!sheetToken){ setSheetMsg("⚠️ ログインまたはURL未設定"); return; }
    setSheetStatus("loading"); setSheetMsg("書き戻し中...");
    try {
      const range = encodeURIComponent(`${sheetName}!A:A`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
        {headers:{Authorization:`Bearer ${sheetToken}`}}
      );
      if(!res.ok){if(res.status===401){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_EXP_KEY);setSheetToken(null);setSheetStatus("disconnected");setSheetMsg("⚠️ 再ログインしてください");return;}throw new Error("失敗");}
      const data = await res.json();
      const rows = data.values||[];
      const rowMap={};
      rows.forEach((row,i)=>{if(i===0)return;const sid=(row[0]||"").toString().trim();if(sid)rowMap[sid]=i+1;});
      const targets=drills.filter(d=>d.fromSheet&&d.sheetId&&rowMap[d.sheetId]);
      if(targets.length===0){setSheetStatus("error");setSheetMsg("⚠️ 書き戻し対象なし");return;}
      const N=colLetter(14),O=colLetter(15),W=colLetter(23),X=colLetter(24),Z=colLetter(26),AA=colLetter(27);
      const valueRanges=[];
      targets.forEach(d=>{
        const row=rowMap[d.sheetId];
        valueRanges.push({range:`${sheetName}!${N}${row}`,values:[[d.favorite?"TRUE":""]]});
        valueRanges.push({range:`${sheetName}!${O}${row}`,values:[[d.proficiency||""]]});
        valueRanges.push({range:`${sheetName}!${W}${row}`,values:[[d.drillActive===false?"":"TRUE"]]});
        valueRanges.push({range:`${sheetName}!${X}${row}`,values:[[d.sheetMemo||""]]});
        valueRanges.push({range:`${sheetName}!${Z}${row}`,values:[[d.lastDone||""]]});
        valueRanges.push({range:`${sheetName}!${AA}${row}`,values:[[(d.history||[]).length]]});
      });
      const writeRes=await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
        {method:"POST",headers:{Authorization:`Bearer ${sheetToken}`,"Content-Type":"application/json"},
         body:JSON.stringify({valueInputOption:"USER_ENTERED",data:valueRanges})}
      );
      if(!writeRes.ok){const e=await writeRes.json();throw new Error(e.error?.message||"書き込み失敗");}
      const now=new Date().toLocaleString("ja-JP");
      setSheetStatus("connected");
      setSheetMsg(`✅ ${targets.length}件書き戻し完了`);
    } catch(e){ setSheetStatus("error"); setSheetMsg("⚠️ "+e.message); }
  };

  // ── Firebase リアルタイム同期 ────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | synced | error
  const isSaving = useRef(false);
  const pendingSave = useRef(null);

  // 起動時: Firestoreからデータ取得 + リアルタイム監視
  useEffect(() => {
    const unsub = onSnapshot(dbRef(), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.drills) setDrills(data.drills);
        if (data.routines) {
          console.log("Firebase routines:", JSON.stringify(data.routines));
          setRoutinesSafe(data.routines);
        }
        if (data.sessionLogs) setSessionLogs(data.sessionLogs);
        if (data.memo) setMemo(data.memo[today] || "");
        setSyncStatus("synced");
      } else {
        // 初回: サンプルデータを保存
        saveToFirebase({ drills: SAMPLE_DRILLS, routines: SAMPLE_ROUTINES, sessionLogs: {}, memo: {} });
        setSyncStatus("synced");
      }
    }, (err) => {
      console.error(err);
      setSyncStatus("error");
    });
    return () => unsub();
  }, []);

  // Firestoreへ保存（デバウンス: 1.5秒後）
  const saveToFirebase = async (data) => {
    try {
      await setDoc(dbRef(), data, { merge: true });
    } catch(e) { console.error("Firebase save error:", e); }
  };

  const debouncedSave = (data) => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => saveToFirebase(data), 1500);
  };

  // Google API
  useEffect(()=>{ const s=document.createElement("script"); s.src="https://accounts.google.com/gsi/client"; s.async=true; document.head.appendChild(s); },[]);

  const fixedDrills = drills.filter(d=>(d.fixed||d.fixedBySheet)&&d.drillActive!==false);
  const todayExtra = drills.filter(d=>selectedIds.map(String).includes(String(d.id))&&!d.fixed&&!d.fixedBySheet);
  const allToday = [...fixedDrills,...todayExtra];
  const totalElapsed = Object.values(elapsed).reduce((a,b)=>a+b,0);
  const filteredDrills = drills.filter(d=>(filterCat==="すべて"||d.category===filterCat)&&d.drillActive!==false);

  // Firebase保存ヘルパー
  const saveAll = (newDrills, newRoutines, newLogs, newMemo) => {
    const d = newDrills || drills;
    const r = newRoutines || routines;
    const l = newLogs || sessionLogs;
    const m = newMemo !== undefined ? newMemo : memo;
    debouncedSave({ drills: d, routines: r, sessionLogs: l, memo: { [today]: m } });
  };

  const markDone = (id) => {
    const sid = String(id);
    const isDone = doneIds.map(String).includes(sid);
    if (isDone) { setDoneIds(p=>p.filter(x=>String(x)!==sid)); return; }
    setDoneIds(p=>[...p,id]);
    const drill = drills.find(d=>String(d.id)===sid||String(d.sheetId)===sid);
    if (!drill) return;
    const histEntry = { date:today, sec:elapsed[id]||0 };
    const newDrills = drills.map(d=>(String(d.id)===sid||String(d.sheetId)===sid)
      ?{...d, lastDone:today, history:[...(d.history||[]), histEntry]}:d);
    setDrills(newDrills);
    // セッションログ更新
    const newLogs = (() => {
      const log = sessionLogs[today]||{drills:[],totalSec:0};
      const dName = drill.name;
      return {...sessionLogs,[today]:{drills:log.drills.includes(dName)?log.drills:[...log.drills,dName],totalSec:log.totalSec+(elapsed[id]||0)}};
    })();
    setSessionLogs(newLogs);
    saveAll(newDrills, null, newLogs, undefined);
  };

  const handleTimerComplete = (id, sec) => {
    setElapsed(p=>({...p,[id]:(p[id]||0)+sec}));
    if (!doneIds.map(String).includes(String(id))) markDone(id);
  };

  const loadRoutine = (routine) => {
    const ids = (routine.drillIds||[]).map(String);
    const nonFixed = drills.filter(d=>ids.includes(String(d.id))&&!d.fixed&&!d.fixedBySheet).map(d=>d.id);
    setSelectedIds(nonFixed); setActiveRoutine(routine); setTab("today");
  };

  // 差分同期
  const syncDrills = (newSheetDrills) => {
    let added=0, updated=0;
    setDrills(prev=>{
      const result = [...prev.filter(d=>!d.fromSheet)]; // 手動追加ドリルは保持
      newSheetDrills.forEach(sd=>{
        const existing = prev.find(d=>d.sheetId&&String(d.sheetId)===String(sd.sheetId));
        if (existing) {
          // 既存: シートから来る情報を更新、ユーザーデータは保持
          result.push({...existing,
            name:sd.name, series:sd.series, category:sd.category,
            position:sd.position, action:sd.action, tags:sd.tags,
            sheetMemo:sd.sheetMemo, youtubeUrl:sd.youtubeUrl,
            youtubeUrl2:sd.youtubeUrl2, youtubeUrl3:sd.youtubeUrl3,
            imageUrl:sd.imageUrl, refUrl:sd.refUrl,
            lesson:sd.lesson, favorite:sd.favorite, proficiency:sd.proficiency,
            drillActive: existing.drillActive !== false ? true : false,
          });
          updated++;
        } else {
          result.push({...sd, id:uid(), fixed:false, lastDone:null, targetSeconds:60, history:[]});
          added++;
        }
      });
      return result;
    });
    return { added, updated, total:newSheetDrills.length };
  };

  // drills変化時にFirebase保存（シート同期後など）
  useEffect(() => {
    if (syncStatus === "synced") {
      debouncedSave({ drills, routines, sessionLogs, memo: { [today]: memo } });
    }
  }, [drills]);

  const saveDrill = (d) => {
    const newDrills = d.id ? drills.map(x=>x.id===d.id?{...d}:x) : [...drills,{...d, id:uid(), lastDone:null, history:[]}];
    setDrills(newDrills);
    saveAll(newDrills, null, null, undefined);
    setEditDrill(null);
  };
  const saveRoutine = (r) => {
    const newRoutines = r.id ? routines.map(x=>x.id===r.id?r:x) : [...routines,{...r,id:uid()}];
    setRoutinesSafe(newRoutines);
    saveAll(null, newRoutines, null, undefined);
    setEditRoutine(null);
  };
  const addToToday = (id) => {
    if (!selectedIds.map(String).includes(String(id))) setSelectedIds(p=>[...p,id]);
    setTab("today");
  };

  const handleDrillToggle = (id) => {
    // drillActiveをfalseにする（次回書き戻し時にW列が空白になる）
    const nd = drills.map(d=>String(d.id)===String(id)?{...d,drillActive:false}:d);
    setDrills(nd); saveAll(nd,null,null,undefined);
  };

  const handleMemoChange = (id, memo) => {
    const nd = drills.map(d=>String(d.id)===String(id)?{...d,sheetMemo:memo}:d);
    setDrills(nd); saveAll(nd,null,null,undefined);
  };
  const handleStarChange = (id, stars) => {
    const nd = drills.map(d=>String(d.id)===String(id)?{...d,stars}:d);
    setDrills(nd); saveAll(nd,null,null,undefined);
  };
  const handleFavoriteChange = (id, fav) => {
    const nd = drills.map(d=>String(d.id)===String(id)?{...d,favorite:fav}:d);
    setDrills(nd); saveAll(nd,null,null,undefined);
  };
  const handleProficiencyChange = (id, prof) => {
    const nd = drills.map(d=>String(d.id)===String(id)?{...d,proficiency:prof}:d);
    setDrills(nd); saveAll(nd,null,null,undefined);
  };

  if (editDrill!==null) return <><style>{CSS}</style><DrillForm drill={editDrill==="new"?null:editDrill} onSave={saveDrill} onCancel={()=>setEditDrill(null)}/></>;
  if (editRoutine!==null) return <><style>{CSS}</style><RoutineForm routine={editRoutine==="new"?null:editRoutine} drills={drills} onSave={saveRoutine} onCancel={()=>setEditRoutine(null)}/></>;

  const TABS = [
    ["today","今日"], ["routines","ルーティン"], ["search","検索"],
    ["suggest","おすすめ"], ["progress","進捗"], ["sync","同期"],
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {timerDrill&&<TimerModal drill={timerDrill} onClose={()=>setTimerDrill(null)} onComplete={sec=>handleTimerComplete(timerDrill.id,sec)}/>}

        {/* ルーティン選択メニュー (SearchTabから呼ばれる) */}
        {routineMenuAnchor&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:40}} onClick={()=>setRoutineMenuAnchor(null)}/>
            <div style={{position:"fixed",top:(routineMenuAnchor.rect?.bottom||100)+4,left:routineMenuAnchor.rect?.left||100,
              background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,minWidth:220,
              boxShadow:"0 4px 16px rgba(0,0,0,.18)",zIndex:50,overflow:"hidden"}}>
              <div style={{padding:"8px 12px",fontSize:11,color:"var(--muted)",borderBottom:"1px solid var(--border)"}}>
                ルーティンに追加（{routines.length}件）
              </div>
              {routines.length===0
                ? <div style={{padding:"10px 14px",fontSize:12,color:"var(--muted)"}}>ルーティンなし</div>
                : routines.map(r=>(
                  <div key={r.id} style={{padding:"10px 14px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--border)"}}
                    onClick={()=>{
                      const ids = routineMenuAnchor.ids;
                      const newRoutines = routines.map(rx=>rx.id===r.id
                        ?{...rx, drillIds:[...new Set([...rx.drillIds.map(String),...ids])]}:rx);
                      setRoutinesSafe(newRoutines); saveAll(null,newRoutines,null,undefined);
                      setRoutineMenuAnchor(null);
                    }}>
                    {r.name}
                  </div>
                ))
              }
              <div style={{padding:"10px 14px",fontSize:13,cursor:"pointer",color:"var(--accent)",fontWeight:500,borderTop:"1px solid var(--border)"}}
                onClick={()=>{
                  setEditRoutine({name:"",description:"",targetMinutes:30,drillIds:routineMenuAnchor.ids,tags:[]});
                  setRoutineMenuAnchor(null);
                }}>
                {Ic.plus} 新規ルーティン作成
              </div>
            </div>
          </>
        )}

        <div className="hd">
          <div className="hd-in">
            <div><div className="logo">柔術ドリル</div><div className="logo-s">BJJ Solo Drill Tracker</div></div>
            <div style={{fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:6}}>
              {syncStatus==="connecting"&&<span style={{color:"#999"}}>⏳ 接続中...</span>}
              {syncStatus==="synced"&&<span style={{color:"var(--accent-m)"}}>☁️ 同期済み</span>}
              {syncStatus==="error"&&<span style={{color:"var(--danger)"}}>⚠️ オフライン</span>}
              <span>{drills.length}件</span>
              {sheetMsg&&<span style={{fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                color:sheetStatus==="error"?"var(--danger)":sheetStatus==="connected"?"var(--accent-m)":"var(--muted)"}}
                title={sheetMsg}>{sheetMsg}</span>}
              <button className="btn btn-o btn-xs" title="シートから読み込む"
                onClick={headerFetchSheet}
                disabled={!sheetToken||sheetStatus==="loading"}
                style={{padding:"3px 8px",fontSize:11}}>
                {sheetStatus==="loading"?"⏳":"↓"} 読込
              </button>
              <button className="btn btn-o btn-xs" title="シートに書き戻す"
                onClick={headerWriteBack}
                disabled={!sheetToken||sheetStatus==="loading"}
                style={{padding:"3px 8px",fontSize:11}}>
                {sheetStatus==="loading"?"⏳":"↑"} 書込
              </button>
            </div>
          </div>
        </div>

        <div className="nav">
          {TABS.map(([k,l])=><div key={k} className={`nt ${tab===k?"on":""}`} onClick={()=>setTab(k)}>{l}</div>)}
        </div>

        {/* ── TODAY ── */}
        {tab==="today"&&(
          <div className="content fa">
            <div className="sum">
              <div className="sum-date">{today}</div>
              <div className="sum-row">
                <div><div className="sum-big">{doneIds.length}</div><div className="sum-label">/ {allToday.length} ドリル完了</div></div>
                {totalElapsed>0&&<div><div className="sum-time">⏱ {fmtTime(totalElapsed)}</div><div className="sum-label">練習時間</div></div>}
              </div>
              {activeRoutine&&<div className="rtn-badge">{Ic.rtn} {activeRoutine.name}</div>}
            </div>

            {fixedDrills.length>0&&(
              <>
                <div className="sh"><div className="st">📌 固定メニュー</div></div>
                {fixedDrills.map(d=>(
                  <DrillCard key={d.id} drill={d} mode="today"
                    done={doneIds.map(String).includes(String(d.id))}
                    elapsed={elapsed[d.id]}
                    onToggle={()=>markDone(d.id)}
                    onTimer={()=>setTimerDrill(d)}
                    onUnfix={()=>{ const nd=drills.map(x=>x.id===d.id?{...x,fixed:false,fixedBySheet:false}:x); setDrills(nd); saveAll(nd,null,null,undefined); }}
                    onDelete={()=>{}} onEdit={()=>{}}
                    onMemoChange={handleMemoChange} onStarChange={handleStarChange}
                    onDrillToggle={handleDrillToggle}
                    onFavoriteChange={handleFavoriteChange} onProficiencyChange={handleProficiencyChange}/>
                ))}
                <hr className="dv"/>
              </>
            )}

            <div className="sh">
              <div><div className="st">今日のメニュー</div><div className="ss">{todayExtra.length===0?"選択・ルーティンから追加":`${todayExtra.length}件`}</div></div>
              <div style={{display:"flex",gap:5}}>
                <button className="btn btn-o btn-sm" onClick={()=>setTab("routines")}>{Ic.rtn}</button>
                <button className="btn btn-o btn-sm" onClick={()=>setTab("select")}>{Ic.plus}</button>
              </div>
            </div>

            {todayExtra.length===0
              ? <div className="empty"><div className="empty-i">🥋</div>ルーティンを選ぶか、ドリルを個別選択してください</div>
              : todayExtra.map(d=>(
                  <DrillCard key={d.id} drill={d} mode="today"
                    done={doneIds.map(String).includes(String(d.id))}
                    elapsed={elapsed[d.id]}
                    onToggle={()=>markDone(d.id)}
                    onTimer={()=>setTimerDrill(d)}
                    onUnfix={()=>{}} onDelete={()=>{}} onEdit={()=>{}}
                    onMemoChange={handleMemoChange} onStarChange={handleStarChange}
                    onDrillToggle={handleDrillToggle}
                    onFavoriteChange={handleFavoriteChange} onProficiencyChange={handleProficiencyChange}/>
                ))
            }

            <div className="memo-area">
              <div className="memo-l">📝 今日のメモ</div>
              <textarea className="mi" placeholder="今日の練習の気づき..." value={memo} onChange={e=>{setMemo(e.target.value);debouncedSave({memo:{[today]:e.target.value}});}}/>
            </div>
          </div>
        )}

        {/* ── ROUTINES ── */}
        {tab==="routines"&&(
          <div className="content fa">
            <div className="sh">
              <div className="st">ルーティン</div>
              <button className="btn btn-p btn-sm" onClick={()=>setEditRoutine("new")}>{Ic.plus} 新規</button>
            </div>
            {routines.length===0
              ? <div className="empty"><div className="empty-i">📋</div>ルーティンがありません</div>
              : <div className="rtn-grid">
                  {routines.map(r=>{
                    const rDrills = (r.drillIds||[]).map(id=>drills.find(d=>String(d.id)===String(id))).filter(Boolean);
                    return (
                      <div key={r.id} className="rtn-card">
                        <div className="rtn-ph">{Ic.rtn}</div>
                        <div className="rtn-body">
                          <div className="rtn-name">{r.name}</div>
                          {r.description&&<div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>{r.description}</div>}
                          <div className="rtn-meta">
                            <span style={{fontSize:11,color:"var(--muted)"}}>🥋 {rDrills.length}</span>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--accent-m)"}}>⏱ {fmtTime(rDrills.reduce((a,d)=>a+(d.targetSeconds||60),0))}</span>
                          </div>
                          <div style={{display:"flex",gap:5,marginTop:8}}>
                            <button className="btn btn-p btn-sm" style={{flex:1}} onClick={()=>loadRoutine(r)}>開始</button>
                            <button className="bti" onClick={()=>setEditRoutine(r)}>{Ic.edit}</button>
                            <button className="bti d" onClick={()=>{if(window.confirm("削除?")){const nr=routines.filter(x=>x.id!==r.id);setRoutinesSafe(nr);saveAll(null,nr,null,undefined);}}}>{Ic.trash}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}





        {/* ── SEARCH ── */}
        {tab==="search"&&(
          <div className="content fa">
            <SearchTab drills={drills} routines={routines}
              onAddToToday={addToToday}
              onDeleteDrills={(ids)=>{ const nd=drills.filter(d=>!ids.includes(String(d.id))); setDrills(nd); saveAll(nd,null,null,undefined); }}
              onCreateRoutine={(ids)=>{ setEditRoutine({name:"",description:"",targetMinutes:30,drillIds:ids,tags:[]}); }}
              onAddToRoutine={(routineId, ids)=>{
                const newRoutines = routines.map(r=>r.id===routineId
                  ?{...r, drillIds:[...new Set([...r.drillIds.map(String),...ids])]}:r);
                setRoutinesSafe(newRoutines); saveAll(null,newRoutines,null,undefined);
              }}
              onShowRoutineMenu={setRoutineMenuAnchor}
              onMemoChange={handleMemoChange}
              onStarChange={handleStarChange}
              onDrillToggle={handleDrillToggle}
              onFavoriteChange={handleFavoriteChange}
              onProficiencyChange={handleProficiencyChange}
            />
          </div>
        )}

        {/* ── SUGGEST ── */}
        {tab==="suggest"&&(
          <div className="content fa">
            <SuggestTab drills={drills} onAddToToday={addToToday}/>
          </div>
        )}

        {/* ── PROGRESS ── */}
        {tab==="progress"&&(
          <div className="content fa">
            <div className="sh"><div><div className="st">進捗管理</div></div></div>
            <ProgressTab drills={drills} sessionLogs={sessionLogs}/>
          </div>
        )}

        {/* ── SHEETS ── */}
        {tab==="sync"&&(
          <div className="content fa">
            <div className="sh"><div><div className="st">シート連携</div></div></div>
            <SheetsPanel drills={drills} onSync={syncDrills}
              quickAction={quickAction} onActionDone={()=>setQuickAction(null)}
              externalToken={sheetToken} onTokenChange={(t,exp)=>{setSheetToken(t);if(t){localStorage.setItem(TOKEN_KEY,t);localStorage.setItem(TOKEN_EXP_KEY,String(exp));}else{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_EXP_KEY);}}}
              externalSheetUrl={sheetUrl} onSheetUrlChange={v=>{setSheetUrl(v);LS.set("sheetUrl",v);}}
              externalSheetName={sheetName} onSheetNameChange={v=>{setSheetName(v);LS.set("sheetName",v);}}
            />
          </div>
        )}
      </div>
    </>
  );
}
