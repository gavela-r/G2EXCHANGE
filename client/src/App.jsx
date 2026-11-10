import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import './css/App.css';
import { Home } from './home';
import { Screener } from './components/screener';
import { Panel } from './components/panel';
import { Ficha } from './components/ficha';

function App() {
  

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path='/' element={<Home />}/>
          <Route path='/panel' element={<Panel />}/>
          <Route path='/ficha' element={<Ficha />}/>
          <Route path='/ficha/:id' element={<Ficha />}/>
          <Route path='/screener' element={<Screener />}/>
          
        </Route>
      </Routes>
    </>
  )
}

export default App
