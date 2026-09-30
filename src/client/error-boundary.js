function createErrorBoundary() {
  try {
    if (!React || typeof React.Component !== 'function') {
      return function NoopBoundary(props) { return props?.children || null }
    }
    return class ClientErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error }
      }
      componentDidCatch(error, info) {
        console.warn('[dsh-clinebot] Client render error caught by boundary:', error, info)
      }
      render() {
        if (this.state.hasError) {
          const t = this.props && typeof this.props.t === 'function' ? this.props.t : null
          const errorTitle = t ? t('ui.error_title') : '⚠️ ClineBot UI Error: '
          const retryLabel = t ? t('ui.retry') : 'Retry'
          return React.createElement(
            'div',
            { className: 'cb-alert-err' },
            React.createElement('strong', null, errorTitle),
            String(this.state.error?.message || this.state.error || 'Unknown rendering error'),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { marginLeft: '12px', padding: '2px 8px', fontSize: '11px' },
                onClick: () => this.setState({ hasError: false, error: null }),
              },
              retryLabel
            )
          )
        }
        return this.props.children
      }
    }
  } catch (e) {
    return function FallbackBoundary(props) { return props?.children || null }
  }
}
const ErrorBoundary = createErrorBoundary()
