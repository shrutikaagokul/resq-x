import { create } from 'zustand'
import { api } from '../services/api'

let requestSequence = 0
export const useSimulation = create((set, get) => ({
  world: null, error: null, busy: false, selectedRoad: 'N00-N01', selectedIncident: null, explanation: null,
  selection: null,
  selectEntity: (kind, id) => set({ selection: { kind, id }, selectedIncident: kind === 'incident' ? id : null,
    ...(kind === 'road' ? { selectedRoad: id } : {}) }),
  clearSelection: () => set({ selection: null, selectedIncident: null }),
  selectRoad: selectedRoad => set({ selectedRoad, selection: { kind: 'road', id: selectedRoad }, selectedIncident: null }),
  selectIncident: selectedIncident => set({ selectedIncident, selection: selectedIncident ? { kind: 'incident', id: selectedIncident } : null }),
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
