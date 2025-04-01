import { useEffect } from 'react'

// Relies on the main component or interaction hook exposing
// specific "finish" and "cancel" actions based on the current mode.
const useKeyboardShortcuts = (
  // Renamed back for simplicity
  mapRef, // Ref to the map container for focus check
  {
    // Destructure actions based on context
    onFinish, // Callback triggered on Enter when map focused
    onCancel, // Callback triggered on Escape
    canFinish, // Boolean indicating if finishing is possible
    canCancel, // Boolean indicating if cancelling is possible
  }
) => {
  useEffect(() => {
    const container = mapRef.current
    if (!container) return

    const handleKeyDown = (e) => {
      const isMapFocused = document.activeElement === container

      if (e.key === 'Enter') {
        // Check if the 'finish' action is currently possible and map has focus
        if (canFinish && isMapFocused) {
          e.preventDefault() // Prevent default browser behavior (like form submit)
          onFinish() // Execute the provided finish action
        }
      } else if (e.key === 'Escape') {
        // Check if the 'cancel' action is currently possible
        if (canCancel) {
          e.preventDefault() // Prevent default browser behavior (like closing modals)
          onCancel() // Execute the provided cancel action
        }
      }
    }

    // Add the listener to the map container
    container.addEventListener('keydown', handleKeyDown)

    // Cleanup: remove the listener when the component unmounts or dependencies change
    return () => {
      if (container) container.removeEventListener('keydown', handleKeyDown)
    }
    // Dependencies ensure the effect updates if the callbacks or conditions change
  }, [mapRef, onFinish, onCancel, canFinish, canCancel])
}

export default useKeyboardShortcuts
