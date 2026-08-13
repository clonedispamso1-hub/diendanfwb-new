/** Style riêng cho khu Anti-Clone (tông Telegram Business: card trắng, xanh dương). */
export function IntelStyles() {
  return (
    <style>{`
.mi-wrap{--mi-blue:#2ea6ff;--mi-ink:#0f172a;--mi-sub:#64748b;--mi-line:#e8edf3;--mi-bg:#f5f7fa;
  background:var(--mi-bg);border-radius:16px;padding:14px;color:var(--mi-ink);}
.mi-tabs{display:flex;gap:6px;background:#fff;border:1px solid var(--mi-line);border-radius:12px;padding:4px;margin-bottom:12px;flex-wrap:wrap}
.mi-tab{flex:1;min-width:120px;border:0;background:transparent;padding:9px 12px;border-radius:9px;font-weight:600;font-size:13px;color:var(--mi-sub);cursor:pointer}
.mi-tab.is-active{background:var(--mi-blue);color:#fff}
.mi-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.mi-search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--mi-line);border-radius:11px;padding:9px 12px}
.mi-search input{border:0;outline:0;flex:1;font-size:13px;background:transparent;color:var(--mi-ink)}
.mi-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--mi-line);background:#fff;color:var(--mi-ink);
  border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer}
.mi-btn:hover{border-color:var(--mi-blue);color:var(--mi-blue)}
.mi-btn.primary{background:var(--mi-blue);border-color:var(--mi-blue);color:#fff}
.mi-btn.danger{background:#fee2e2;border-color:#fecaca;color:#b91c1c}
.mi-btn.ghost{background:transparent}
.mi-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mi-chip{border:1px solid var(--mi-line);background:#fff;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:600;color:var(--mi-sub);cursor:pointer}
.mi-chip.is-active{background:#e8f4ff;border-color:var(--mi-blue);color:#0b7fd4}
.mi-cards{display:grid;gap:10px}
.mi-card{background:#fff;border:1px solid var(--mi-line);border-radius:14px;padding:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.mi-card-top{display:flex;gap:10px;align-items:flex-start}
.mi-ava{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#e2e8f0;flex:none}
.mi-name{font-weight:700;font-size:14px;line-height:1.25}
.mi-uname{font-size:12px;color:var(--mi-sub)}
.mi-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.mi-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;border:1px solid transparent}
.mi-badge.ok{background:#e7f8ee;color:#0f7b46}
.mi-badge.warn{background:#fff6e5;color:#a86a00}
.mi-badge.high{background:#fff0e3;color:#c2410c}
.mi-badge.danger{background:#ffe9e9;color:#c11919}
.mi-badge.muted{background:#f1f5f9;color:#475569}
.mi-badge.link{background:#e8f4ff;color:#0b7fd4;cursor:pointer;border-color:#cfe8ff}
.mi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px;margin-top:10px;
  border-top:1px dashed var(--mi-line);padding-top:9px}
.mi-cell{font-size:11.5px;color:var(--mi-sub);min-width:0}
.mi-cell b{display:block;font-size:12.5px;color:var(--mi-ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mi-cell .mi-linkv{color:#0b7fd4;cursor:pointer;text-decoration:underline dotted}
.mi-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.mi-risk{margin-left:auto;text-align:center;flex:none}
.mi-risk-num{font-size:20px;font-weight:800;line-height:1}
.mi-risk-lb{font-size:10px;font-weight:700;letter-spacing:.02em}
.mi-risk.ok{color:#0f7b46}.mi-risk.warn{color:#a86a00}.mi-risk.high{color:#c2410c}.mi-risk.danger{color:#c11919}
.mi-empty{background:#fff;border:1px dashed var(--mi-line);border-radius:14px;padding:28px;text-align:center;color:var(--mi-sub);font-size:13px}
.mi-modal{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.mi-modal-box{background:#fff;border-radius:16px;width:min(640px,100%);max-height:86vh;overflow:auto;padding:16px;box-shadow:0 20px 60px rgba(2,6,23,.3)}
.mi-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.mi-modal-title{font-weight:800;font-size:15px}
.mi-list{display:grid;gap:6px;margin-top:8px}
.mi-row{display:flex;align-items:center;gap:9px;background:#f8fafc;border:1px solid var(--mi-line);border-radius:10px;padding:8px 10px}
.mi-row .mi-ava{width:30px;height:30px}
.mi-mini{font-size:11.5px;color:var(--mi-sub)}
.mi-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;background:#f8fafc;border-radius:12px;padding:10px;margin-bottom:8px}
.mi-more{display:flex;justify-content:center;margin-top:12px}
`}</style>
  );
}
