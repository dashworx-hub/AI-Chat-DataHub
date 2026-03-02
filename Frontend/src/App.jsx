import { BrowserRouter, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { renderRoutes } from './routes';

function AppContent() {
  const location = useLocation();

  useEffect(() => {
    // Trigger page transition animation
    document.body.classList.add('page-enter');
    const timer = setTimeout(() => {
      document.body.classList.remove('page-enter');
    }, 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <Routes location={location} key={location.pathname}>
      {renderRoutes(location)}
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
