import { create } from 'zustand'
import { api } from '../services/api'

let requestSequence = 0
export const useSimulation = create((set, get) => ({
  world: null, error: null, busy: false, selectedRoad: 'N00-N01', selectedIncident: null, explanation: null,
  selectRoad: selectedRoad => set({ selectedRoad }),
  selectIncident: selectedIncident => set({ selectedIncident }),
  clearError: () => set({ error: null }),
  closeExplanation: () => set({ explanation: null }),
  refresh: async () => {
    if (get().busy) return
    const sequence = ++requestSequence
    try {
      const world = await api('/world-state')
      if (sequence === requestSequence) set({ world })
    } catch (error) { set({ error: `Backend connection: ${error.message}` }) }
  },
  act: async (path, data = {}) => {
    if (get().busy) return
    ++requestSequence
    set({ busy: true, error: null })
    try {
      const world = await api(path, data)
      set({ world, busy: false })
    } catch (error) { set({ error: error.message, busy: false }) }
  },
  explain: async id => {
    try { set({ explanation: await api(`/decisions/${id}/explanation`) }) }
    catch (error) { set({ error: error.message }) }
  },
}))
