import React from 'react'
import { Box, Text, renderToString } from 'ink'
import { Badge, StatusMessage, ThemeProvider, defaultTheme, extendTheme } from '@inkjs/ui'

export type Problem = { title: string; people: number }
export type Report = { people: number; problems: Problem[]; selectedRank?: number }
// Semantic ANSI colours are mapped to site tokens by the HTML exporter.
const theme = extendTheme(defaultTheme, { components: {
  StatusMessage: { styles: { icon: () => ({ color: 'yellow' }), message: () => ({ color: 'white' }) }, config: () => ({ icon: '●' }) },
  Badge: { styles: { container: () => ({}), label: () => ({ color: 'gray' }) } },
} })

/** The same fixed-column Ink surface is printed by the CLI and captured by the site. */
export function TerminalOutput({ lines, report }: { lines?: string[]; report?: Report }) {
  const titleWidth = Math.min(65, Math.max(0, ...(report?.problems.map(p => p.title.length) ?? [])))
  return <ThemeProvider theme={theme}><Box flexDirection="column" width={report ? 80 : Math.max(80, ...(lines?.map(line => line.length) ?? []))}>
    {lines?.map((line, index) => <Text key={index} wrap="wrap">{line}</Text>)}
    {report && <>
      <StatusMessage variant="info">{`Problems found: ${report.problems.length} across ${report.people} people.`}</StatusMessage>
      <Text> </Text>
      {report.problems.map((problem, index) => <Box key={index} flexWrap="nowrap">
        <Text color="yellow">{report.selectedRank === index + 1 ? '▏' : ' '}</Text>
        <Text color={report.selectedRank === index + 1 ? 'white' : 'gray'}>{`${index + 1}  ${(problem.title.length > titleWidth ? problem.title.slice(0, titleWidth - 1) + '…' : problem.title).padEnd(titleWidth)} `}</Text>
        <Badge color="gray"><Text>{`${problem.people} of ${report.people}`}</Text></Badge>
      </Box>)}
    </>}
  </Box></ThemeProvider>
}

export function printTerminal(props: React.ComponentProps<typeof TerminalOutput>) {
  process.stdout.write(renderToString(<TerminalOutput {...props} />, { columns: 80 }) + '\n')
}
