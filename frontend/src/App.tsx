import { BrowserRouter, Route, Routes } from "react-router-dom";
import Callback from "./pages/Callback";
import Home from "./pages/Home";
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
