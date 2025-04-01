import React from 'react'
import ReactDOM from 'react-dom/client'
import MapComponent from '../map-component/MapComponent'
import './style.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <MapComponent />
  </React.StrictMode>
)
