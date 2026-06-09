import type { VoiceContextManager } from './contextManager'
import type { CommandProcessorOptions } from './commandTypes'
import { executeCommand, formatActionResult } from './actionExecutor'
import { classifyCommand, getSuggestions } from './intentClassifier'

export interface CommandProcessor {
  process: (text: string) => Promise<string>
  classify: (text: string) => ReturnType<typeof classifyCommand>
}

export function createCommandProcessor(
  contextManager: VoiceContextManager,
  options: Pick<CommandProcessorOptions, 'includeSuggestions'> = {},
): CommandProcessor {
  const includeSuggestions = options.includeSuggestions ?? true

  return {
    classify(text: string) {
      const pageContext = contextManager.getPageContext()
      return classifyCommand(text, pageContext)
    },

    async process(text: string): Promise<string> {
      const trimmed = text.trim()
      if (!trimmed) {
        return 'I did not catch that. Try again.'
      }

      const pageContext = contextManager.getPageContext()
      const parsed = classifyCommand(trimmed, pageContext)

      if (parsed.intent === 'unknown') {
        if (includeSuggestions) {
          const suggestions = getSuggestions(pageContext)
          return `I am not sure how to do that yet. Try: ${suggestions.slice(0, 3).join('; ')}.`
        }
        return 'I did not understand that command.'
      }

      const ctx = contextManager.getActionContext()
      const result = await executeCommand(parsed, ctx)
      return formatActionResult(result)
    },
  }
}

export function createProcessCommandHandler(
  contextManager: VoiceContextManager,
  options?: Pick<CommandProcessorOptions, 'includeSuggestions'>,
): (text: string) => Promise<string> {
  return createCommandProcessor(contextManager, options).process
}
