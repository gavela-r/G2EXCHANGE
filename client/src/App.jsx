import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import './css/App.css';

function App() {
  

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
        <Route path='/' element={<div></div>}/>
        </ Route>
      </Routes>
    </>
  )
}

export default App
