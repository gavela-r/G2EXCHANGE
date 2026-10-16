import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import './css/App.css';
import { Home } from './home';

function App() {
  

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path='/' element={<Home />}/>
          
        </Route>
      </Routes>
    </>
  )
}

export default App
