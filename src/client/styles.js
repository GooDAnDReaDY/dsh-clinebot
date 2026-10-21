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
.cb-section-desc{margin-top:-6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}

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

.cb-progress-card, .cb-bar-container{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.cb-progress-card-bad{border-color:var(--dsw-alias-state-error-primary)}
.cb-progress-head, .cb-bar-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;width:100%;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}
.cb-progress-label{flex:0 0 auto;font-weight:500;white-space:nowrap}
.cb-progress-meta, .cb-bar-meta{flex:1 1 140px;min-width:0;margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-align:right;white-space:normal;overflow-wrap:anywhere}
.cb-progress-meta-bad{color:var(--dsw-alias-state-error-primary)}
.cb-progress-low{display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:11px;color:var(--dsw-alias-state-error-primary)}
.cb-progress-forecast{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
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
.cb-footName{flex:1 1 auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:20px;white-space:nowrap;text-overflow:ellipsis}
.cb-footRow{display:flex;flex-direction:column;gap:4px;min-width:0}
.cb-footHead{display:flex;align-items:baseline;gap:8px;min-width:0}
.cb-footLabel{flex:1;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap;text-overflow:ellipsis}
.cb-footAmount{flex:0 1 auto;max-width:68%;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;text-overflow:ellipsis}
.cb-footRowMissing .cb-footLabel{opacity:.65}
.cb-footAmountMissing{color:var(--dsw-alias-label-tertiary)}
.cb-footMessage{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.cb-footBar{display:block;height:4px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.cb-footFill{display:block;height:100%;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.cb-footFillWarn{background:var(--dsw-alias-state-error-primary)}
.cb-footForecast{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}
.cb-footPct{margin-left:auto;flex:none;width:34px;color:var(--dsw-alias-label-secondary);text-align:right;font-size:12px;font-weight:600;line-height:16px;font-variant-numeric:tabular-nums}
.cb-footPctWarn{color:var(--dsw-alias-state-error-primary)}
.cb-railButton{box-sizing:border-box;flex:none;display:inline-flex;justify-content:center;align-items:center;width:36px;height:36px;margin:0 0 4px;padding:0;border:.5px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cb-railButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cb-railButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.cb-glyph{flex:none;display:inline-flex;justify-content:center;align-items:center;color:var(--dsw-alias-brand-primary)}

/* The window chrome and its width belong to the shell's Modal, so the body only
   fills whatever it is given — a fixed width here overflows the panel. */
.cb-dialog{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;max-height:min(72vh, 640px);overflow-y:auto;color:var(--dsw-alias-label-primary)}
.cb-panel{display:flex;flex-direction:column;gap:14px;width:100%;max-width:780px;margin:0 auto;padding:18px;height:100%;max-height:calc(100vh - 56px);min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;color:var(--dsw-alias-label-primary)}
.cb-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cb-panel-identity{display:flex;flex-direction:column;gap:4px;min-width:0}
.cb-panel-title{color:var(--dsw-alias-label-primary);font-size:18px;font-weight:650;line-height:24px}
.cb-panel-sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-panel-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex:none}
.cb-panel-updated{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}
.cb-panel-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:18px;line-height:1;cursor:pointer}
.cb-panel-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cb-notice{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}
.cb-notice-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px}
.cb-notice-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cb-notice-error{border-color:var(--dsw-alias-state-error-primary)}
.cb-notice-error .cb-notice-title{color:var(--dsw-alias-state-error-primary)}
@media(max-width:720px){.cb-panel{padding:12px;max-height:none}}
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
.cb-quota-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;margin-top:4px}
@media(max-width:640px){.cb-quota-grid{grid-template-columns:1fr}}
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

/* Composer cost and analytics dialog. */
.cb-composer-cost{position:relative;display:inline-flex;align-items:center}
.cb-composer-cost-button{display:inline-flex;align-items:center;gap:4px;height:24px;padding:2px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.cb-composer-cost-button:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}
.cb-composer-cost-value{color:var(--dsw-alias-label-primary);font-weight:600}
.cb-composer-popover{position:absolute;bottom:100%;left:0;z-index:100;display:flex;flex-direction:column;gap:6px;min-width:200px;margin-bottom:6px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:12px}
.cb-composer-title{padding-bottom:4px;border-bottom:.5px solid var(--dsw-alias-border-l2);font-weight:600}
.cb-composer-row,.cb-composer-total{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cb-composer-total{padding-top:4px;border-top:.5px solid var(--dsw-alias-border-l2);font-weight:600}
.cb-composer-value{font-variant-numeric:tabular-nums}
.cb-tabs{display:flex;gap:4px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.cb-tab{padding:6px 10px;border:0;border-bottom:1.5px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.cb-tab-active{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:500}
.cb-dialogRow{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cb-dialogBadges{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}
.cb-analytics-controls{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.cb-account-tabs{display:flex;flex-wrap:wrap;gap:6px}
.cb-account-tab{display:inline-flex;align-items:center;padding:2px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.cb-account-tab:hover:not(.cb-account-tab-active){color:var(--dsw-alias-label-primary)}
.cb-account-tab-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.cb-price-section{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}
.cb-price-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cb-price-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.cb-price-table{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-x:auto}
.cb-price-head-row,.cb-price-row{display:grid;grid-template-columns:minmax(160px,1.6fr) repeat(4,minmax(72px,1fr));gap:6px;align-items:center;min-width:520px}
.cb-price-head-row{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.cb-price-row .cb-mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}
.cb-price-input{width:100%;min-width:0;padding:4px 6px;font-size:12px}
.cb-dialogIdentity{display:flex;flex-direction:column;gap:2px;min-width:0}
.cb-dialogTiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
.cb-dialogWindows{display:flex;flex-direction:column;gap:12px}
.cb-analytics-list{display:flex;flex-direction:column;gap:2px;margin-top:8px}
.cb-analytics-head,.cb-analytics-row{display:grid;grid-template-columns:minmax(120px,1fr) 70px 70px 80px 70px;gap:8px;align-items:center;padding:4px 0;font-size:11px}
.cb-analytics-head{border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.cb-analytics-row{border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.cb-analytics-row .cb-mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb-heat-wrap{display:flex;flex-direction:column;gap:8px;min-width:0}
.cb-heat-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cb-heat-toolbar .cb-hint{margin:0}
.cb-heat-select{max-width:260px;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.cb-heat-scroll{overflow-x:auto;padding-bottom:4px}
.cb-heat{display:grid;grid-template-columns:44px repeat(24,minmax(10px,1fr));gap:2px;align-items:center;min-width:620px}
.cb-heat-hour{color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:12px;text-align:center}
.cb-heat-day{color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;white-space:nowrap}
.cb-heat-cell,.cb-heat-swatch{display:block;border-radius:3px;background:var(--dsw-alias-bg-layer-2)}
.cb-heat-cell{height:14px;border:0;padding:0;cursor:pointer}
.cb-heat-cell:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.cb-heat-cell.cb-heat-selected{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.cb-heat-swatch{width:12px;height:12px;border-radius:2px}
.cb-heat-l0{background:var(--dsw-alias-bg-layer-2)}
.cb-heat-l1{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-bg-layer-2))}
.cb-heat-l2{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 36%,var(--dsw-alias-bg-layer-2))}
.cb-heat-l3{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 58%,var(--dsw-alias-bg-layer-2))}
.cb-heat-l4{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 80%,var(--dsw-alias-bg-layer-2))}
.cb-heat-legend{display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}
.cb-hour-strip-head{margin:10px 0 0;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}
.cb-hour-strip{display:grid;grid-template-columns:44px repeat(24,minmax(10px,1fr));gap:2px;align-items:end;height:30px;min-width:620px}
.cb-hour-col{display:flex;align-items:flex-end;height:100%}
.cb-hour-bar{display:block;width:100%;min-height:2px;border-radius:2px 2px 0 0}
.cb-hour-labels{display:grid;grid-template-columns:44px repeat(24,minmax(10px,1fr));gap:2px;color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:12px;text-align:center;min-width:620px}
@media(max-width:720px){
  .cb-analytics-head,.cb-analytics-row{grid-template-columns:1fr 56px 64px}
  .cb-analytics-head span:nth-child(4),.cb-analytics-head span:nth-child(5),.cb-analytics-row span:nth-child(4),.cb-analytics-row span:nth-child(5){display:none}
}

/* Opencode-inspired visual language: neutral rgba surfaces, 7-10px radii and
   the same green/amber/red accents. Text still follows the harness theme. */
.cb-page{gap:14px;padding:4px 2px 24px}
.cb-page-title{font-size:18px;font-weight:650;line-height:1.4}
.cb-panel{max-width:760px;padding:18px}
.cb-section-card,.cb-dialogCard,.cb-provider-card,.cb-progress-card,.cb-stat-box,.cb-account-add,.cb-discovered,.cb-update-banner,.cb-notice,.cb-savebar-inner,.cb-account-menu{border:1px solid rgba(127,127,127,.25);border-radius:10px;background:rgba(127,127,127,.06)}
.cb-section-card,.cb-dialogCard{padding:12px 14px;gap:10px}
.cb-section-title,.cb-settings-group-title{font-size:13px;font-weight:650;line-height:1.5}
.cb-section-desc,.cb-settings-group-desc,.cb-settings-row-desc,.cb-hint{opacity:.72;line-height:1.5}
.cb-input,.cb-select{height:auto;min-height:32px;padding:6px 8px;border:1px solid rgba(127,127,127,.35);border-radius:7px;background:rgba(127,127,127,.08);font-size:13px;line-height:1.4}
.cb-input:focus,.cb-select:focus{border-color:rgba(80,140,255,.6);outline:2px solid rgba(80,140,255,.25);outline-offset:1px}
.cb-btn{height:auto;min-height:30px;padding:6px 11px;border:1px solid rgba(127,127,127,.35);border-radius:7px;background:rgba(127,127,127,.1);font-size:13px;line-height:1.4}
.cb-btn:hover:not(:disabled){background:rgba(127,127,127,.18)}
.cb-btn-primary{border-color:rgba(80,140,255,.6);background:rgba(80,140,255,.18);color:inherit}
.cb-btn-primary:hover:not(:disabled){background:rgba(80,140,255,.26)}
.cb-btn-danger{border-color:rgba(220,80,80,.5);color:#e07a7a}
.cb-badge{padding:2px 7px;border:1px solid rgba(127,127,127,.3);border-radius:999px;background:rgba(127,127,127,.1);font-size:11px;line-height:1.4}
.cb-badge-ok{color:#4fbf86;border-color:rgba(60,180,110,.5);background:rgba(60,180,110,.10)}
.cb-badge-warn{color:#d9a24a;border-color:rgba(220,160,60,.5);background:rgba(220,160,60,.10)}
.cb-badge-bad{color:#e07a7a;border-color:rgba(220,80,80,.5);background:rgba(220,80,80,.10)}
.cb-stat-box{padding:8px 10px;border-radius:8px}
.cb-stat-val{font-size:15px;font-weight:600;line-height:1.4}
.cb-stat-lbl{font-size:11px;line-height:1.5}
.cb-table{font-size:12px}
.cb-table th{padding:5px 8px;border-bottom:1px solid rgba(127,127,127,.18);font-size:11px;font-weight:600;opacity:.8}
.cb-table td{padding:5px 8px;border-bottom:1px solid rgba(127,127,127,.18);font-size:12px}
.cb-model-group td{padding:8px 8px 4px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650;background:rgba(127,127,127,.08)}
.cb-progress-track,.cb-bar-track{height:8px;border-radius:999px;background:rgba(127,127,127,.2)}
.cb-progress-bar-fill,.cb-bar-fill,.cb-footFill,.cb-meter-fill{background:#4fbf86}
.cb-progress-bar-warn{background:#d9a24a}
.cb-progress-bar-bad,.cb-footFillWarn,.cb-meter-fill-warn{background:#e07a7a}
.cb-progress-meta-bad,.cb-progress-low,.cb-footPctWarn{color:#e07a7a}
.cb-footBar,.cb-meter{background:rgba(127,127,127,.2)}
.cb-account-tab,.cb-seg{border:1px solid rgba(127,127,127,.3);border-radius:999px;background:rgba(127,127,127,.1)}
.cb-seg{border-radius:7px;overflow:hidden}
.cb-seg-item{border:0;border-left:1px solid rgba(127,127,127,.2);border-radius:0;background:transparent}
.cb-seg-item:first-child{border-left:0}
.cb-seg-item-active,.cb-account-tab-active{border-color:rgba(80,140,255,.6);background:rgba(80,140,255,.18);color:inherit}
.cb-tab{border:0;border-radius:0;background:transparent;border-bottom:1.5px solid transparent}
.cb-tab-active{border-bottom-color:#4fbf86;background:transparent}
.cb-heat-l0{background:rgba(127,127,127,.10)}
.cb-heat-l1{background:rgba(79,191,134,.234)}
.cb-heat-l2{background:rgba(79,191,134,.382)}
.cb-heat-l3{background:rgba(79,191,134,.530)}
.cb-heat-l4{background:rgba(79,191,134,.826)}
.cb-heat-cell,.cb-heat-swatch{border-radius:3px}
.cb-analytics-head,.cb-analytics-row{padding:5px 0;border-bottom:1px solid rgba(127,127,127,.18)}
.cb-settings-row,.cb-price-section{border-color:rgba(127,127,127,.18)}
.cb-alert-ok{background:rgba(60,180,110,.10);color:#4fbf86}
.cb-alert-bad,.cb-alert-err{background:rgba(220,80,80,.10);color:#e07a7a}
.cb-banner-warning{background:rgba(220,160,60,.10);border-color:rgba(220,160,60,.5);color:#d9a24a}
.cb-banner-exhausted{background:rgba(220,80,80,.10);border-color:rgba(220,80,80,.5);color:#e07a7a}
.cb-account-route-row,.cb-model-row,.cb-preview,.cb-account-add{background:rgba(127,127,127,.06)}

`
      document.head.appendChild(style)
    }
