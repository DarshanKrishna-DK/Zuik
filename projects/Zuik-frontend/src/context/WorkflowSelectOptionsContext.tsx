import { createContext, useContext, type ReactNode } from 'react'

export type WorkflowSelectOption = { value: string; label: string }

const WorkflowSelectOptionsContext = createContext<WorkflowSelectOption[]>([])

export function WorkflowSelectOptionsProvider({
  options,
  children,
}: {
  options: WorkflowSelectOption[]
  children: ReactNode
}) {
  return (
    <WorkflowSelectOptionsContext.Provider value={options}>
      {children}
    </WorkflowSelectOptionsContext.Provider>
  )
}

export function useWorkflowSelectOptions(): WorkflowSelectOption[] {
  return useContext(WorkflowSelectOptionsContext)
}
