/**
 * Central route configuration. Add new features by adding an entry here
 * and (if needed) a nav link in Header.jsx.
 */
import { Route } from 'react-router-dom';
import ChatIndex from './pages/ChatIndex';
import AgentManager from './pages/AgentManager';
import CreateAgent from './pages/CreateAgent';
import Settings from './pages/Settings';

export const routes = [
  { path: '/', element: <ChatIndex /> },
  { path: '/agents', element: <AgentManager /> },
  { path: '/create', element: <CreateAgent /> },
  { path: '/settings', element: <Settings /> },
];

/**
 * Renders all configured routes. Used by App.jsx.
 */
export function renderRoutes(location) {
  return routes.map(({ path, element }) => (
    <Route key={path} path={path} element={element} />
  ));
}
