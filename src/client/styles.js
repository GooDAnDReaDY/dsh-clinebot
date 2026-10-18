function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-clinebot-full-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-clinebot-full-css'
      style.dataset.dshPlugin = NS
      style.textContent = `
.cb-page{display:flex;flex-direction:column;gap:20px;padding:8px 0 32px;max-width:960px}
.cb-chevron{display:inline-flex;align-items:center;justify-content:center;transition:transform .16s ease;color:var(--dsw-alias-label-tertiary)}
.cb-chevron-open{transform:rotate(180deg)}
.cb-header{display:flex;flex-direction:column;gap:8px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.cb-page-title{font-size:22px;font-weight:700;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:10px}
.cb-page-sub{font-size:14px;color:var(--dsw-alias-label-secondary);line-height:1.5}

.cb-section-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.cb-section-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}
.cb-section-desc{font-size:13px;color:var(--dsw-alias-label-secondary);margin-top:-6px;line-height:1.4}

.cb-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.cb-grid-2{display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px}

.cb-badge{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;gap:5px;font-weight:500}
.cb-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}
.cb-badge-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)}
.cb-badge-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}

.cb-input{height:36px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;width:100%;box-sizing:border-box}
.cb-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.cb-input-group{display:flex;gap:8px;align-items:center}

.cb-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 14px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}
.cb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2))}
.cb-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}
.cb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary) !important;color:var(--dsw-alias-bg-layer-3) !important;opacity:0.88;visibility:visible !important}
.cb-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)}
.cb-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent) !important;border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent)}
.cb-btn-disabled{opacity:0.5;cursor:not-allowed}

.cb-progress-card, .cb-bar-container{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.cb-progress-head, .cb-bar-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);width:100%}
.cb-progress-label{font-weight:500;white-space:nowrap}
.cb-progress-meta, .cb-bar-meta{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;margin-left:auto}
.cb-progress-track, .cb-bar-track{width:100%;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;border:1px solid var(--dsw-alias-border-l2)}
.cb-progress-bar-fill, .cb-bar-fill{height:100%;border-radius:999px;transition:width .3s;background:var(--dsw-alias-brand-primary, var(--dsw-alias-state-success-primary))}
.cb-progress-bar-warn{height:100%;border-radius:999px;transition:width .3s;background:var(--dsw-alias-state-warn-primary)}
.cb-progress-bar-bad{height:100%;border-radius:999px;transition:width .3s;background:var(--dsw-alias-state-error-primary)}

.cb-table{width:100%;border-collapse:collapse;margin-top:8px}
.cb-table th{text-align:left;font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);font-weight:600}
.cb-table td{padding:10px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;color:var(--dsw-alias-label-primary)}
.cb-table tr:hover{background:var(--dsw-alias-bg-layer-2)}

.cb-alert-ok{padding:10px 14px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary);font-size:13px}
.cb-alert-bad{padding:10px 14px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);font-size:13px}
.cb-alert-err{padding:10px 14px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);font-size:13px}
.cb-banner-warning{padding:12px 16px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);font-size:13px;display:flex;align-items:center;gap:10px;font-weight:500}
.cb-banner-exhausted{padding:12px 16px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:13px;display:flex;align-items:center;gap:10px;font-weight:600}
.cb-stat-box{padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:4px}
.cb-stat-val{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary)}
.cb-stat-lbl{font-size:12px;color:var(--dsw-alias-label-secondary)}
.cb-preview{padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l2)}

[class*="_footArea"] [class*="_footerActions"]{flex-direction:column}
.cb-foot{box-sizing:border-box;flex:0 0 auto;width:100%;min-width:0;font:inherit;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:transparent;border:1px solid transparent;border-radius:10px;flex-direction:column;gap:6px;margin:0 0 4px;padding:8px;display:flex}
.cb-foot:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.cb-foot:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cb-footTop{align-items:center;gap:8px;min-width:0;display:flex}
.cb-footName{white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;font-size:13px;font-weight:500;line-height:20px}
.cb-footRow{flex-direction:column;gap:4px;min-width:0;display:flex}
.cb-footHead{align-items:baseline;gap:8px;min-width:0;display:flex}
.cb-footLabel{flex:1;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.cb-footAmount{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.cb-footBar{display:block;background:var(--dsw-alias-bg-layer-2);border-radius:999px;height:5px;overflow:hidden}
.cb-footFill{display:block;background:var(--dsw-alias-brand-primary);border-radius:999px;height:100%;transition:width .3s ease}
.cb-footFillWarn{background:var(--dsw-alias-state-error-primary)}
.cb-footPct{flex:none;width:34px;color:var(--dsw-alias-label-secondary);text-align:right;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}
.cb-railButton{box-sizing:border-box;width:36px;height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:1px solid transparent;border-radius:8px;flex:none;justify-content:center;align-items:center;margin:0 0 4px;padding:0;display:inline-flex}
.cb-railButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cb-railButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cb-glyph{flex:none;justify-content:center;align-items:center;display:inline-flex;color:var(--dsw-alias-brand-primary)}

.cb-mainOverlay{background:var(--dsw-alias-bg-layer-1);width:100%;height:100%;overflow:auto;display:block}
.cb-mainInner{max-width:760px;margin:0 auto;padding:24px 20px 40px;flex-direction:column;gap:14px;display:flex;color:var(--dsw-alias-label-primary)}
.cb-mainHeader{align-items:center;gap:10px;display:flex;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:14px}
.cb-mainTitle{margin:0;font-size:18px;font-weight:600;line-height:1.4}
.cb-mainSub{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.cb-mainCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:14px}

.cb-providerCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;margin:8px 0}
`
      document.head.appendChild(style)
    }
