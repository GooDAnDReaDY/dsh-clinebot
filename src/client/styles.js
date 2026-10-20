function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-clinebot-full-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-clinebot-full-css'
      style.dataset.dshPlugin = NS
      style.textContent = `
.cb-page{display:flex;flex-direction:column;gap:16px;width:100%}
.cb-header{display:flex;flex-direction:column;gap:4px;padding:2px 0 4px}
.cb-page-title{display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}
.cb-page-sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}

.cb-section-card{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill)}
.cb-section-title{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}
.cb-section-desc{margin-top:-6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}

.cb-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cb-grid-2{display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px}

.cb-badge{display:inline-flex;align-items:center;gap:4px;flex:none;padding:1px 6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:400}
.cb-badge-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)}
.cb-badge-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent)}
.cb-badge-bad{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}

.cb-input{box-sizing:border-box;width:100%;height:36px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px}
.cb-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.cb-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.cb-input-group{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cb-input-group > .cb-input{flex:1 1 240px;min-width:0}
.cb-input-group > .cb-btn{flex:none}

.cb-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;white-space:nowrap;cursor:pointer}
.cb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.cb-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.cb-btn:disabled{opacity:.5;cursor:not-allowed}
.cb-btn-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-2)}
.cb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.88}
.cb-btn-danger{color:var(--dsw-alias-state-error-primary)}
.cb-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}
.cb-btn-disabled{opacity:.5;cursor:not-allowed}

.cb-progress-card, .cb-bar-container{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.cb-progress-head, .cb-bar-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;width:100%;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}
.cb-progress-label{font-weight:500;white-space:nowrap}
.cb-progress-meta, .cb-bar-meta{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}
.cb-progress-track, .cb-bar-track{width:100%;height:6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.cb-progress-bar-fill, .cb-bar-fill{height:100%;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.cb-progress-bar-warn{height:100%;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-state-warn-primary);transition:width .3s ease}
.cb-progress-bar-bad{height:100%;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-state-error-primary);transition:width .3s ease}

.cb-table{width:100%;border-collapse:collapse;margin-top:4px}
.cb-table th{padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);text-align:left;font-size:12px;font-weight:500;line-height:18px}
.cb-table td{padding:10px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}
.cb-table tr:hover{background:var(--dsw-alias-interactive-bg-hover)}

.cb-alert{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--dsw-radius-md);font-size:12px;line-height:18px}
.cb-alert-ok{padding:10px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px}
.cb-alert-bad{padding:10px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.cb-alert-err{padding:10px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.cb-banner-warning{display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent);border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);color:var(--dsw-alias-state-warn-primary);font-size:12px;font-weight:500;line-height:18px}
.cb-banner-exhausted{display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;font-weight:600;line-height:18px}
.cb-stat-box{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.cb-stat-val{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}
.cb-stat-lbl{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-preview{padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-all}

/* The shell lays the footer action list out as a row, which a full-width meter
   cannot share: with another plugin's entry beside it the plan name truncates and
   the window label wraps. Stack the list while this meter is in it. The :has()
   scoping keeps the rule off any footer that does not contain this plugin, so it
   cannot reach across other registrants the way a plain descendant selector would. */
[class*="_footerActions"]:has(.cb-foot), [class*="_footerActions"]:has(.cb-railButton){flex-direction:column}
.cb-foot{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;display:flex;flex-direction:column;gap:6px;margin:0 0 4px;padding:8px;border:.5px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer}
.cb-foot:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
.cb-foot:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.cb-footTop{display:flex;align-items:center;gap:8px;min-width:0}
.cb-footName{min-width:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:20px;white-space:nowrap;text-overflow:ellipsis}
.cb-footRow{display:flex;flex-direction:column;gap:4px;min-width:0}
.cb-footHead{display:flex;align-items:baseline;gap:8px;min-width:0}
.cb-footLabel{flex:1;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.cb-footAmount{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.cb-footBar{display:block;height:4px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.cb-footFill{display:block;height:100%;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.cb-footFillWarn{background:var(--dsw-alias-state-error-primary)}
.cb-footPct{flex:none;width:34px;color:var(--dsw-alias-label-secondary);text-align:right;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}
.cb-railButton{box-sizing:border-box;flex:none;display:inline-flex;justify-content:center;align-items:center;width:36px;height:36px;margin:0 0 4px;padding:0;border:.5px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cb-railButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cb-railButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.cb-glyph{flex:none;display:inline-flex;justify-content:center;align-items:center;color:var(--dsw-alias-brand-primary)}

/* The window chrome and its width belong to the shell's Modal, so the body only
   fills whatever it is given — a fixed width here overflows the panel. */
.cb-dialog{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;max-height:min(72vh, 640px);overflow-y:auto;color:var(--dsw-alias-label-primary)}
.cb-dialogMeta{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.cb-dialogCard{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill)}
.cb-dialogFallback{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
.cb-dialogFallbackPanel{display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 96px);overflow-y:auto;padding:18px;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}

/* Provider card inside Settings -> Models. */
.cb-provider-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.cb-provider-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cb-provider-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}
.cb-provider-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}

/* Grouped settings, disclosure rows and the staged-save bar. */
.cb-settings-group{display:flex;flex-direction:column;gap:10px;padding:4px 0}
.cb-settings-group-divided{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:16px;margin-top:4px}
.cb-settings-group-head{display:flex;align-items:center;gap:8px;margin:0;padding:0}
.cb-settings-disclosure{width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:2px 0}
.cb-settings-group-title{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;font-weight:600}
.cb-settings-group-action{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px}
.cb-settings-group-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-settings-group-body{display:flex;flex-direction:column;gap:2px}
.cb-settings-spacer{flex:1 1 auto}
.cb-settings-chevron{display:inline-flex;justify-content:center;align-items:center;width:18px;height:18px;color:var(--dsw-alias-label-tertiary);font-size:18px;line-height:1;transition:transform .16s ease}
.cb-settings-chevron-open{transform:rotate(90deg)}
.cb-settings-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.cb-settings-row:last-child{border-bottom:0}
.cb-settings-row-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.cb-settings-row-title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-weight:500}
.cb-settings-row-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-settings-row-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.cb-settings-row-control{display:flex;align-items:center;gap:8px;flex:none}
.cb-settings-input{width:220px;max-width:46vw}
.cb-savebar{position:sticky;bottom:0;z-index:30;margin:18px -4px -4px;padding:10px 4px 4px;background:linear-gradient(to top,var(--dsw-alias-bg-layer-1) 70%,transparent)}
.cb-savebar-inner{display:flex;align-items:center;gap:10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.cb-savebar-text{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;text-overflow:ellipsis}

/* Calm icon and account-pool primitives. */
.cb-icon{flex:none;display:inline-block;vertical-align:-2px}
.cb-icon-chevron-open{transform:rotate(90deg)}
.cb-banner-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;color:inherit}
.cb-inline-alert{display:flex;align-items:center;gap:6px}
.cb-mono{font-family:var(--ds-font-family-code,monospace);font-size:11px;color:var(--dsw-alias-label-secondary)}
.cb-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.cb-empty{padding:16px 0;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}
.cb-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cb-accounts .cb-section-desc{margin-bottom:8px}
.cb-discovered{display:flex;flex-direction:column;gap:6px;margin:8px 0;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.cb-discovered-head{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500}
.cb-discovered-row{display:flex;align-items:center;gap:8px;font-size:12px}
.cb-discovered-row .cb-mono{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb-account-mode{display:flex;align-items:center;gap:8px;margin:8px 0 4px;font-size:12px}
.cb-seg{display:inline-flex;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}
.cb-seg-item{padding:4px 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.cb-seg-item+.cb-seg-item{border-left:.5px solid var(--dsw-alias-border-l2)}
.cb-seg-item-active{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:500}
.cb-account-add{display:flex;flex-direction:column;gap:8px;margin:8px 0 12px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.cb-account-add-row{display:flex;gap:8px;flex-wrap:wrap}
.cb-account-add-row .cb-input{flex:1 1 180px}
.cb-account-add-actions{display:flex;justify-content:flex-end;gap:8px}
.cb-account-list{display:flex;flex-direction:column;margin-top:4px}
.cb-account-item{position:relative;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.cb-account-item:last-child{border-bottom:0}
.cb-account-row{display:flex;align-items:center;gap:10px;padding:10px 0}
.cb-status-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-l3)}
.cb-status-dot-ok{background:var(--dsw-alias-state-success-primary)}
.cb-status-dot-warn{background:var(--dsw-alias-state-warn-primary)}
.cb-status-dot-bad{background:var(--dsw-alias-state-error-primary)}
.cb-status-dot-idle{background:var(--dsw-alias-border-l3)}
.cb-account-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cb-account-name{display:flex;align-items:baseline;gap:8px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px}
.cb-account-env{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb-account-meta{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;white-space:nowrap;text-overflow:ellipsis}
.cb-account-badges{display:flex;flex:none;flex-wrap:wrap;justify-content:flex-end;gap:4px;max-width:240px}
.cb-account-quota{display:flex;flex:none;align-items:center;justify-content:flex-end;gap:6px;min-width:112px}
.cb-meter{display:block;width:64px;height:4px;overflow:hidden;border-radius:2px;background:var(--dsw-alias-bg-layer-2)}
.cb-meter-fill{display:block;height:100%;background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.cb-meter-fill-warn{background:var(--dsw-alias-state-error-primary)}
.cb-icon-btn{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:.5px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cb-icon-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cb-icon-btn:disabled{opacity:.5;cursor:not-allowed}
.cb-account-menu{display:flex;flex-direction:column;min-width:180px;margin:0 0 8px 18px;padding:4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.cb-menu-item{padding:6px 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.cb-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cb-menu-item-danger{color:var(--dsw-alias-state-error-primary)}
.cb-account-inline{display:flex;align-items:center;gap:8px;padding:0 0 10px 18px}
.cb-account-inline .cb-input{flex:1;min-width:0}
.cb-account-danger{padding:8px 10px;margin:0 0 8px 18px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.cb-account-danger-text{flex:1;min-width:0;color:var(--dsw-alias-state-error-primary);font-size:12px}
.cb-account-routes{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}
.cb-account-routes-head{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500}
.cb-account-route-add{display:flex;gap:8px;flex-wrap:wrap}
.cb-account-route-add .cb-input{flex:2 1 160px}
.cb-account-route-add .cb-select{flex:1 1 140px}
.cb-account-route-list{display:flex;flex-direction:column;gap:4px}
.cb-account-route-row{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-size:12px}
.cb-account-route-row .cb-mono{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:720px){
  .cb-account-row{flex-wrap:wrap}
  .cb-account-badges{justify-content:flex-start;max-width:none}
  .cb-account-quota{min-width:0}
}

/* Calm section toolbars, stats and banners. */
.cb-section-actions{display:flex;align-items:center;gap:6px;flex:none}
.cb-btn-link{display:inline-flex;align-items:center;gap:4px;text-decoration:none}
.cb-quota-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:4px}
.cb-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:4px}
.cb-model-list{display:flex;flex-direction:column;gap:4px;margin-top:12px}
.cb-model-list-title{margin-bottom:2px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}
.cb-model-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-size:12px}
.cb-model-row .cb-mono{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb-banner-body{flex:1;min-width:0}
.cb-banner-sub{margin-top:2px;font-size:11px;opacity:.9}
.cb-state-ok{color:var(--dsw-alias-state-success-primary);font-size:12px}
.cb-hint{margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-key-status{margin-top:8px;font-size:12px}
.cb-key-meta{display:flex;align-items:center;gap:6px;margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.cb-link{color:var(--dsw-alias-brand-primary);text-decoration:none}
.cb-link:hover{text-decoration:underline}
.cb-update-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}
.cb-update-info{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px}
.cb-update-version{color:var(--dsw-alias-label-secondary);font-weight:500}
.cb-row-actions{display:flex;align-items:center;gap:8px;margin-top:4px}

`
      document.head.appendChild(style)
    }
