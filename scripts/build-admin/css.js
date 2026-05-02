module.exports = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
:root{
  --md-primary:#6750A4;--md-on-primary:#fff;--md-primary-container:#EADDFF;--md-on-primary-container:#21005D;
  --md-secondary:#625B71;--md-secondary-container:#E8DEF8;
  --md-tertiary:#7D5260;--md-tertiary-container:#FFD8E4;
  --md-error:#B3261E;--md-error-container:#F9DEDC;
  --md-surface:#141218;--md-surface-variant:#49454F;--md-on-surface:#E6E0E9;--md-on-surface-variant:#CAC4D0;
  --md-outline:#938F99;--md-outline-variant:#49454F;
  --md-surf1:#1D1B20;--md-surf2:#242127;--md-surf3:#2B2830;--md-surf4:#2D2B33;--md-surf5:#302D38;
  --md-scrim:rgba(0,0,0,.6);
  --md-green:#4CAF50;--md-orange:#FF9800;--md-red:#F44336;--md-blue:#2196F3;
  --md-radius-xs:4px;--md-radius-sm:8px;--md-radius-md:12px;--md-radius-lg:16px;--md-radius-xl:28px;
  --md-elevation1:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15);
  --md-elevation2:0 1px 2px rgba(0,0,0,.3),0 2px 6px 2px rgba(0,0,0,.15);
  --md-elevation3:0 4px 8px 3px rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.3);
  --md-elevation4:0 6px 10px 4px rgba(0,0,0,.15),0 2px 3px rgba(0,0,0,.3);
  --tr:.2s cubic-bezier(.2,0,0,1);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:var(--md-surface);color:var(--md-on-surface);min-height:100vh;display:flex;overflow:hidden}
a{color:inherit;text-decoration:none}
.ms{font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;font-size:20px;line-height:1;display:inline-block;white-space:nowrap;-webkit-font-smoothing:antialiased}
.ms.f{font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24}

/* Sidebar */
.sidebar{width:280px;min-width:280px;background:var(--md-surf1);display:flex;flex-direction:column;height:100vh;overflow-y:auto;overflow-x:hidden;position:fixed;left:0;top:0;z-index:100;border-right:1px solid rgba(255,255,255,.05)}
.sb-header{padding:20px 16px 8px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.05)}
.sb-logo{width:40px;height:40px;border-radius:14px;background:linear-gradient(135deg,#6750A4,#9C27B0);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sb-title{font-size:18px;font-weight:800;letter-spacing:-.3px}
.sb-sub{font-size:11px;color:var(--md-on-surface-variant);font-weight:500}
.view-switch{margin:12px;background:var(--md-surf2);border-radius:50px;padding:4px;display:flex;gap:2px}
.view-btn{flex:1;padding:8px 12px;border:none;border-radius:50px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:var(--tr);color:var(--md-on-surface-variant);background:none}
.view-btn.active{background:var(--md-primary);color:#fff;box-shadow:var(--md-elevation2)}
.sb-nav{padding:4px 12px;flex:1}
.nav-section{font-size:10px;font-weight:700;color:var(--md-on-surface-variant);letter-spacing:.1em;text-transform:uppercase;padding:16px 4px 6px}
.nav-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:50px;color:var(--md-on-surface-variant);font-size:14px;font-weight:500;cursor:pointer;border:none;background:none;width:100%;text-align:left;transition:var(--tr);position:relative}
.nav-item:hover{background:rgba(255,255,255,.08);color:var(--md-on-surface)}
.nav-item.active{background:var(--md-primary-container);color:var(--md-on-primary-container);font-weight:700}
.nav-item.active .ms{color:var(--md-on-primary-container)}
.nav-badge{margin-left:auto;background:var(--md-error);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;min-width:20px;text-align:center}
.sb-footer{padding:12px;border-top:1px solid rgba(255,255,255,.05)}
.user-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:16px}
.user-av{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--md-primary)}
.user-av-placeholder{width:36px;height:36px;border-radius:50%;background:var(--md-primary-container);display:flex;align-items:center;justify-content:center;color:var(--md-on-primary-container)}
.user-info{flex:1;overflow:hidden}
.user-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.user-role{font-size:11px;color:var(--md-primary);font-weight:600}
.logout-btn{width:32px;height:32px;border:none;background:rgba(255,255,255,.08);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--md-on-surface-variant);transition:var(--tr)}
.logout-btn:hover{background:rgba(179,38,30,.2);color:var(--md-error)}
.notif-btn{position:relative;width:32px;height:32px;border:none;background:rgba(255,255,255,.08);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--md-on-surface-variant);transition:var(--tr);margin-right:4px}
.notif-btn:hover{background:rgba(255,255,255,.12)}
.notif-dot{position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:var(--md-error);border:2px solid var(--md-surf1);display:none}
.notif-dot.show{display:block}

/* Banners */
.banners{position:fixed;top:0;left:280px;right:0;z-index:50;pointer-events:none}
.banner{pointer-events:all;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:13px;font-weight:600;animation:slideDown .3s ease;cursor:pointer}
.banner.urgent{background:var(--md-error);color:#fff}
.banner.info{background:#2C2C3A;border-bottom:2px solid var(--md-primary);color:var(--md-on-surface)}
.banner-close{margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;display:flex;padding:4px;border-radius:4px}
@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}

/* Main */
main{margin-left:280px;flex:1;display:flex;flex-direction:column;min-height:100vh;max-height:100vh;overflow-y:auto}
.page{display:none;flex-direction:column;flex:1;padding:0 0 32px}
.page.active{display:flex}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0;gap:12px;position:sticky;top:0;z-index:10;background:var(--md-surface)}
.page-title{font-size:22px;font-weight:800;display:flex;align-items:center;gap:10px;letter-spacing:-.3px}
.page-title .ms{font-size:24px;color:var(--md-primary)}
.topbar-right{display:flex;gap:8px;align-items:center}

/* Stat cards */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:20px 24px 0}
.stat-card{background:var(--md-surf1);border-radius:var(--md-radius-xl);padding:20px;display:flex;flex-direction:column;gap:10px;transition:var(--tr);border:1px solid rgba(255,255,255,.05)}
.stat-card:hover{transform:translateY(-2px);box-shadow:var(--md-elevation3)}
.stat-icon{width:40px;height:40px;border-radius:var(--md-radius-md);display:flex;align-items:center;justify-content:center}
.stat-val{font-size:28px;font-weight:800;line-height:1;letter-spacing:-.5px}
.stat-lbl{font-size:12px;color:var(--md-on-surface-variant);font-weight:500}

/* Section */
.section{padding:20px 24px 0}
.card{background:var(--md-surf1);border-radius:var(--md-radius-xl);border:1px solid rgba(255,255,255,.05);overflow:hidden}
.card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap;gap:10px}
.card-title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}
.card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* Table */
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.05);white-space:nowrap}
.tbl td{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
.tbl tr:last-child td{border:none}
.tbl tr:hover td{background:rgba(255,255,255,.04)}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;white-space:nowrap}
.badge-green{background:rgba(76,175,80,.15);color:#81C784}
.badge-red{background:rgba(244,67,54,.15);color:#E57373}
.badge-orange{background:rgba(255,152,0,.15);color:#FFB74D}
.badge-blue{background:rgba(33,150,243,.15);color:#64B5F6}
.badge-purple{background:rgba(103,80,164,.2);color:#CE93D8}
.badge-grey{background:rgba(255,255,255,.08);color:var(--md-on-surface-variant)}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:0 20px;height:40px;border:none;border-radius:50px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:var(--tr);white-space:nowrap}
.btn-filled{background:var(--md-primary);color:#fff}.btn-filled:hover{filter:brightness(1.15)}
.btn-tonal{background:var(--md-secondary-container);color:#1D192B}.btn-tonal:hover{filter:brightness(1.1)}
.btn-outlined{background:none;border:1.5px solid var(--md-outline-variant);color:var(--md-on-surface)}.btn-outlined:hover{background:rgba(255,255,255,.08)}
.btn-text{background:none;color:var(--md-primary);padding:0 12px}.btn-text:hover{background:rgba(103,80,164,.12)}
.btn-sm{height:32px;padding:0 14px;font-size:12px}
.btn-danger{background:rgba(179,38,30,.15);color:#CF6679;border:1.5px solid rgba(179,38,30,.3)}.btn-danger:hover{background:var(--md-error);color:#fff}
.ib{width:32px;height:32px;border:none;background:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--md-on-surface-variant);transition:var(--tr)}
.ib:hover{background:rgba(255,255,255,.1);color:var(--md-on-surface)}
.ib.del:hover{background:rgba(244,67,54,.15);color:var(--md-error)}
.ib .ms{font-size:16px}

/* Chips/filter */
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:6px 16px;border-radius:50px;font-size:12px;font-weight:600;border:1.5px solid rgba(255,255,255,.15);background:none;cursor:pointer;color:var(--md-on-surface-variant);transition:var(--tr);font-family:inherit}
.chip:hover{background:rgba(255,255,255,.06)}
.chip.active{background:var(--md-secondary-container);border-color:var(--md-secondary-container);color:#1D192B}

/* Modal */
.overlay{position:fixed;inset:0;background:var(--md-scrim);display:none;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(4px);padding:16px}
.overlay.show{display:flex}
.modal{background:var(--md-surf3);border-radius:var(--md-radius-xl);padding:24px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:var(--md-elevation4);animation:popIn .25s cubic-bezier(.34,1.56,.64,1)}
.modal.lg{max-width:760px}
.modal.xl{max-width:960px}
@keyframes popIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.3px}
.modal-close{width:36px;height:36px;border:none;background:rgba(255,255,255,.08);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--md-on-surface-variant);transition:var(--tr)}
.modal-close:hover{background:rgba(244,67,54,.15);color:var(--md-error)}
.form-stack{display:flex;flex-direction:column;gap:14px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group label{font-size:11px;font-weight:700;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.04em}
.form-group input,.form-group select,.form-group textarea{padding:10px 14px;border:1.5px solid rgba(255,255,255,.12);border-radius:var(--md-radius-md);font-size:13px;background:var(--md-surf4);color:var(--md-on-surface);transition:var(--tr);font-family:inherit;width:100%}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--md-primary);background:var(--md-surf5)}
.form-group select option{background:var(--md-surf3);color:var(--md-on-surface)}
.form-actions{display:flex;gap:10px;margin-top:8px;justify-content:flex-end}
.toggle-row{display:flex;align-items:center;gap:10px}
.toggle{width:44px;height:26px;background:rgba(255,255,255,.15);border-radius:20px;position:relative;cursor:pointer;border:none;flex-shrink:0;transition:var(--tr)}
.toggle.on{background:var(--md-primary)}
.toggle::after{content:'';width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;top:4px;left:4px;transition:var(--tr);box-shadow:0 1px 3px rgba(0,0,0,.4)}
.toggle.on::after{left:22px}
.toggle-label{font-size:13px;font-weight:600;color:var(--md-on-surface)}

/* Sub-table for mappings */
.mapping-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.mapping-table th{padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--md-on-surface-variant);text-transform:uppercase;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.05)}
.mapping-table td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04)}
.mapping-table tr:last-child td{border:none}

/* Misc */
.mono{font-family:'SF Mono','Cascadia Code',monospace;font-size:11px;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap}
.state-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;color:var(--md-on-surface-variant);gap:10px}
.state-empty .ms{font-size:48px;opacity:.3}
.spin{width:28px;height:28px;border:3px solid rgba(255,255,255,.1);border-top-color:var(--md-primary);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
.chart-bars{display:flex;align-items:flex-end;gap:3px;height:80px}
.bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px}
.bar{width:100%;border-radius:4px 4px 0 0;transition:.3s;min-height:2px;background:var(--md-primary-container);cursor:pointer}
.bar:hover{background:var(--md-primary)}
.bar-lbl{font-size:8px;color:var(--md-on-surface-variant);white-space:nowrap}
.toast{position:fixed;bottom:24px;right:24px;z-index:999;padding:12px 20px;border-radius:var(--md-radius-lg);background:var(--md-surf5);border:1px solid rgba(255,255,255,.1);box-shadow:var(--md-elevation4);font-size:14px;font-weight:500;transform:translateY(120px);opacity:0;transition:var(--tr);display:flex;align-items:center;gap:10px;max-width:360px}
.toast.show{transform:translateY(0);opacity:1}
.toast.success{border-color:rgba(76,175,80,.4)}.toast.success .ms{color:#81C784}
.toast.error{border-color:rgba(244,67,54,.4)}.toast.error .ms{color:#E57373}
.md-content h1,.md-content h2,.md-content h3{font-weight:700;margin:.5em 0}
.md-content p{margin:.3em 0;line-height:1.6}
.md-content code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:4px;font-size:.9em}
.md-content ul,.md-content ol{margin:.3em 0;padding-left:1.5em}
input[type=range]{-webkit-appearance:none;height:6px;border-radius:3px;background:rgba(255,255,255,.15);width:100%}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--md-primary);cursor:pointer}
.section-divider{height:1px;background:rgba(255,255,255,.05);margin:4px 0}
@media(max-width:900px){.sidebar{transform:translateX(-100%)}.banners{left:0}main{margin-left:0}}
</style>
`;
