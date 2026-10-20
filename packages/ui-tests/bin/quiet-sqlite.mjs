// Node 22 prints an ExperimentalWarning to stderr when node:sqlite loads. That
// contaminates CLI output and the MCP stdio channel's stderr, so drop only that
// one warning; every other warning still passes through.
export const isSqliteWarning = (warning, type) => {
  const name = typeof type === 'string' ? type : type?.type ?? warning?.name
  const message = typeof warning === 'string' ? warning : warning?.message
  return name === 'ExperimentalWarning' && typeof message === 'string' && /\bSQLite\b/.test(message)
}

export const quietSqliteWarning = (proc = process) => {
  const emit = proc.emitWarning
  proc.emitWarning = function (warning, type, ...rest) {
    if (isSqliteWarning(warning, type)) return
    return emit.call(this, warning, type, ...rest)
  }
}
