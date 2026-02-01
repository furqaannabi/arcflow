import { Button } from "@/components/ui/button";
import ConnectButton from "@/components/ConnectButton";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const { isConnected } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard when connected
  useEffect(() => {
    if (isConnected) {
      navigate('/dashboard');
    }
  }, [isConnected, navigate]);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
            <span className="text-lg font-semibold">ArcFlow</span>
          </div>
          <ConnectButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Cross-Chain Payroll for Global Teams
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Pay your distributed workforce on any blockchain. Automated, secure, and earning yield while funds wait.
          </p>
          <div className="flex gap-3 justify-center">
            <ConnectButton />
            <Button 
              size="lg"
              variant="outline"
              className="px-8"
            >
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-4xl font-bold text-gray-900 mb-2">$50M+</div>
              <div className="text-sm text-gray-600">Payroll Processed</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900 mb-2">500+</div>
              <div className="text-sm text-gray-600">Companies</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900 mb-2">99.9%</div>
              <div className="text-sm text-gray-600">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Everything You Need
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Simple, powerful tools to manage global payroll without the complexity.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Multi-Chain Support</h3>
            <p className="text-gray-600 text-sm">
              Pay employees on Ethereum, Polygon, Arbitrum, Optimism, and more.
            </p>
          </div>

          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Earn Yield</h3>
            <p className="text-gray-600 text-sm">
              Funds earn returns through Uniswap V4 until payroll date.
            </p>
          </div>

          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Fully Automated</h3>
            <p className="text-gray-600 text-sm">
              AI-powered scheduling, gas optimization, and execution.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "01", title: "Connect Wallet", desc: "Link your Circle Wallet or MetaMask" },
              { num: "02", title: "Deposit Funds", desc: "Add USDC to your payroll account" },
              { num: "03", title: "Add Recipients", desc: "Configure team members and chains" },
              { num: "04", title: "Automate", desc: "Set schedule and let AI handle the rest" },
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="text-blue-600 text-xl font-bold mb-3">{step.num}</div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">
            Ready to get started?
          </h2>
          <p className="text-blue-100 mb-8 text-lg">
            Join hundreds of companies simplifying global payroll.
          </p>
          <ConnectButton />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded"></div>
            <span className="font-semibold">ArcFlow</span>
          </div>
          <p className="text-sm text-gray-500">© 2026 ArcFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
