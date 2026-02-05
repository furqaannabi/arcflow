import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Payroll from "@/pages/Payroll";
import AgentChat from "@/pages/AgentChat";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/chat" element={<AgentChat />} />
          {/* Future routes */}
          {/* <Route path="/deposit" element={<Deposit />} /> */}
          {/* <Route path="/recipients" element={<Recipients />} /> */}
          {/* <Route path="/withdraw" element={<Withdraw />} /> */}
          {/* <Route path="/history" element={<History />} /> */}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

