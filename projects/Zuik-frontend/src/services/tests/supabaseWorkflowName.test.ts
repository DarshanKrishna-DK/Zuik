import { describe, expect, it } from 'vitest'
import { validateWorkflowName, WORKFLOW_NAME_MAX_LENGTH } from '../supabase'

describe('validateWorkflowName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(validateWorkflowName('')).toBe('Name cannot be empty')
    expect(validateWorkflowName('   ')).toBe('Name cannot be empty')
  })

  it('rejects names longer than max length', () => {
    const longName = 'a'.repeat(WORKFLOW_NAME_MAX_LENGTH + 1)
    expect(validateWorkflowName(longName)).toBe(
      `Name must be ${WORKFLOW_NAME_MAX_LENGTH} characters or less`,
    )
  })

  it('accepts trimmed valid names', () => {
    expect(validateWorkflowName('My Workflow')).toBeNull()
    expect(validateWorkflowName('  Payroll  ')).toBeNull()
  })
})
