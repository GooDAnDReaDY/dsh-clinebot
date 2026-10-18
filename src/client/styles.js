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

`
      document.head.appendChild(style)
    }
