import { Routes, Route } from 'react-router-dom';
import Register from './pages/Register';
import HabitDetail from './pages/HabitDetail';

function App() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/habits/:habitId" element={<HabitDetail />} />
    </Routes>
  );
}

export default App;
