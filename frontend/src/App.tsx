import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/Landing";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Future routes */}
        {/* <Route path="/dashboard" element={<Dashboard />} /> */}
        {/* <Route path="/deposit" element={<Deposit />} /> */}
        {/* <Route path="/recipients" element={<Recipients />} /> */}
        {/* <Route path="/withdraw" element={<Withdraw />} /> */}
        {/* <Route path="/history" element={<History />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
