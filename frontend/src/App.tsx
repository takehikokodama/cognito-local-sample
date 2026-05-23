import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Callback from "./pages/Callback";
import Protected from "./pages/Protected";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/protected" element={<Protected />} />
      </Routes>
    </BrowserRouter>
  );
}
