import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Batches from './pages/Batches';
import Verify from './pages/Verify';
import './App.css';

function App() {
    return (
        <div className="app">
            <header className="header">
                <div className="container">
                    <nav className="nav">
                        <h1 style={{ margin: 0, fontSize: '24px' }}>🌱 Pravardha</h1>
                        <Link to="/">Dashboard</Link>
                        <Link to="/batches">Batches</Link>
                        <a href="https://github.com/yourusername/pravardha" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>
                    </nav>
                </div>
            </header>

            <main>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/batches" element={<Batches />} />
                    <Route path="/verify/:batchId" element={<Verify />} />
                </Routes>
            </main>
        </div>
    );
}

export default App;
