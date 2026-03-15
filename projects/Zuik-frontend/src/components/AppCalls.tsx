/**
 * Placeholder for Zuik contract interactions.
 * When you add smart contracts (e.g. via `algokit generate smart-contract` in Zuik-contracts),
 * run `algokit project link --all` from the repo root so typed clients appear in src/contracts/.
 * Then implement actual app calls here using the generated client factories.
 */
interface AppCallsInterface {
  openModal: boolean
  setModalState: (value: boolean) => void
}

const AppCalls = ({ openModal, setModalState }: AppCallsInterface) => {
  return (
    <dialog id="appcalls_modal" className={`modal ${openModal ? 'modal-open' : ''} bg-slate-200`}>
      <form method="dialog" className="modal-box">
        <h3 className="font-bold text-lg">Contract interactions</h3>
        <p className="py-4 text-sm text-slate-600">
          Zuik contract interactions will appear here once you add and link smart contracts.
          Use <code className="bg-slate-100 px-1 rounded">algokit generate smart-contract</code> in{' '}
          <code className="bg-slate-100 px-1 rounded">projects/Zuik-contracts</code>, then{' '}
          <code className="bg-slate-100 px-1 rounded">algokit project link --all</code> to generate
          typed clients in <code className="bg-slate-100 px-1 rounded">src/contracts/</code>.
        </p>
        <div className="modal-action">
          <button type="button" className="btn" onClick={() => setModalState(!openModal)}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default AppCalls
