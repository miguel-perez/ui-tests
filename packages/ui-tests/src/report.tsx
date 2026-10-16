import React from 'react'
import { Box, Text, renderToString } from 'ink'
import { StatusMessage, ThemeProvider, defaultTheme, extendTheme } from '@inkjs/ui'
import { colours, segments, type Segment } from './colours.ts'
export { colours, segments, type Segment } from './colours.ts'

export type Problem = { title: string; people: number }
export type Report = { people: number; problems: Problem[]; selectedRank?: number }
export type AgentTrial = { seconds: string; stopped?: string; detail?: string }
export type AgentReport = { goal: string; trials: AgentTrial[]; url: string }

const theme = extendTheme(defaultTheme, { components: {
  StatusMessage: { styles: { icon: () => ({ color: colours.done }), message: () => ({ color: colours.ink }) }, config: () => ({ icon: '●' }) },
} })

function Line({ parts }: { parts: Segment[] }) {
  return <Text wrap="wrap">{parts.map((part, index) => <Text key={index} color={part.color}>{part.text}</Text>)}</Text>
}

/**
 * The same Ink surface is printed by the CLI and captured by the site. Every table puts its fixed-width fields first,
 * padded to their widest value with numbers right-aligned, and its one free-text field last (issue #18, item 12).
 */
export function TerminalOutput({ lines, report, actor = 'person', agentReport }: { lines?: string[]; report?: Report; actor?: 'person' | 'agent'; agentReport?: AgentReport }) {
  const rankWidth = String(report?.problems.length ?? 0).length
  const countWidth = Math.max(0, ...(report?.problems.map(p => `${p.people} of ${report.people}`.length) ?? []))
  const trialWidth = String(agentReport?.trials.length ?? 0).length
  const timeWidth = Math.max(0, ...(agentReport?.trials.map(trial => trial.seconds.length) ?? []))
  const reached = agentReport?.trials.filter(trial => !trial.stopped).length ?? 0
  return <ThemeProvider theme={theme}><Box flexDirection="column" width={report ? 80 : Math.max(80, ...(lines?.map(line => line.length) ?? []))}>
    {lines?.map((line, index) => <Line key={index} parts={segments(line)} />)}
    {actor === 'agent' && agentReport && <>
      <Text color={colours.ink}>{`Agent run · ${agentReport.goal} · ${agentReport.trials.length} trials`}</Text>
      {agentReport.trials.map((trial, index) => <Text key={index}>
        <Text color={colours.comment}>{String(index + 1).padStart(trialWidth)}</Text>
        <Text color={colours.ink}>{`  ${trial.seconds.padStart(timeWidth)}  `}</Text>
        {trial.stopped ? <Text color={colours.dead}>{`stopped: ${trial.stopped}`}</Text> : <Text color={colours.done}>reached the outcome</Text>}
        {trial.detail && <Text color={colours.ink}>{` · ${trial.detail}`}</Text>}
      </Text>)}
      <Text><Text color={colours.moment}>{`${reached} of ${agentReport.trials.length}`}</Text><Text color={colours.ink}> trials reached the outcome. Report: </Text><Text color={colours.url}>{agentReport.url}</Text></Text>
    </>}
    {actor === 'person' && report && <>
      <StatusMessage variant="info">{`Problems found: ${report.problems.length} across ${report.people} people.`}</StatusMessage>
      <Text> </Text>
      {report.problems.map((problem, index) => <Box key={index} flexWrap="nowrap">
        <Text color={colours.moment}>{report.selectedRank === index + 1 ? '▏' : ' '}</Text>
        <Text color={colours.comment}>{String(index + 1).padStart(rankWidth)}</Text>
        <Text color={colours.moment}>{`  ${`${problem.people} of ${report.people}`.padStart(countWidth)}  `}</Text>
        <Text color={colours.ink}>{problem.title}</Text>
      </Box>)}
    </>}
  </Box></ThemeProvider>
}

export function printTerminal(props: React.ComponentProps<typeof TerminalOutput>) {
  process.stdout.write(renderToString(<TerminalOutput {...props} />, { columns: 80 }) + '\n')
}
