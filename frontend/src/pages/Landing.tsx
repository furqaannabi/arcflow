import { Button } from "@/components/ui/button";
import ConnectButton from "@/components/ConnectButton";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Play, Check, Star } from "lucide-react";

export default function Landing() {
  const { isConnected, connect } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-blue-100">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-600/20">
              A
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">ArcFlow</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Product</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
          </div>

          <div className="flex items-center gap-4">
            {!isConnected && (
              <Button variant="ghost" className="text-gray-600 hover:text-blue-600" onClick={() => connect()}>
                Sign In
              </Button>
            )}
            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-50 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/4"></div>

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-sm font-medium mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Now live on Testnet
              </div>
              <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 mb-6 leading-[1.1] tracking-tight">
                Managing global payroll has <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">never been easier</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                End-to-end payments and financial management for distributed teams. Automatic cross-chain settlement with yield-bearing idle funds.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <Button 
                  size="lg" 
                  className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-600/25 text-base transition-transform hover:scale-105 active:scale-95"
                  onClick={() => isConnected ? navigate('/dashboard') : connect()}
                >
                  {isConnected ? "Go to Dashboard" : "Get Started"}
                </Button>
                <Button size="lg" variant="ghost" className="h-12 px-6 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full gap-2 group">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <Play className="w-3.5 h-3.5 fill-blue-600 text-blue-600 ml-0.5" />
                  </div>
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Hero Composition */}
            <div className="relative lg:h-[600px] flex items-center justify-center">
               <div className="relative w-full max-w-lg aspect-square">
                  {/* Circle Backdrops */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-purple-100 rounded-full opacity-60 blur-2xl"></div>
                  
                  {/* Main Card */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-white rounded-2xl shadow-2xl p-6 border border-gray-100 z-20 transform hover:-translate-y-1 transition-transform cursor-default">
                    <div className="flex items-center justify-between mb-4">
                       <div>
                         <p className="text-xs text-gray-500">Total Balance</p>
                         <h3 className="text-2xl font-bold text-gray-900">$48,200.00</h3>
                       </div>
                       <div className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-bold">+14%</div>
                    </div>
                    <div className="space-y-3">
                       <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                         <div className="h-full w-2/3 bg-blue-500 rounded-full"></div>
                       </div>
                       <div className="flex gap-2">
                         <div className="h-20 w-8 bg-blue-100 rounded-t-lg ml-auto relative group">
                            <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg h-[40%] group-hover:h-[60%] transition-all"></div>
                         </div>
                         <div className="h-20 w-8 bg-blue-100 rounded-t-lg relative group">
                            <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg h-[75%] group-hover:h-[85%] transition-all"></div>
                         </div>
                         <div className="h-20 w-8 bg-blue-100 rounded-t-lg relative group">
                            <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg h-[50%] group-hover:h-[70%] transition-all"></div>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Floating Notification */}
                  <div className="absolute top-20 -right-4 w-48 bg-white rounded-xl shadow-xl p-3 border border-gray-100 z-30 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-backwards">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                           <Star className="w-5 h-5 fill-purple-600" />
                        </div>
                        <div>
                           <p className="text-xs font-semibold text-gray-900">+ $1,240.50</p>
                           <p className="text-[10px] text-gray-500">Yield Generated</p>
                        </div>
                     </div>
                  </div>

                  {/* Floating User Card */}
                  <div className="absolute bottom-20 -left-8 w-56 bg-white rounded-xl shadow-xl p-4 border border-gray-100 z-30 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-backwards">
                      <div className="flex items-center gap-3 mb-2">
                         <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200"></div>
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-300"></div>
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-400"></div>
                         </div>
                         <p className="text-xs text-gray-500 font-medium">+124 processed</p>
                      </div>
                      <div className="w-full h-8 bg-green-50 rounded flex items-center px-3 gap-2">
                         <Check className="w-3 h-3 text-green-600" />
                         <span className="text-xs text-green-700 font-medium">Payroll Sent</span>
                      </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Brands */}
          <div className="mt-20 pt-10 border-t border-gray-100">
             <p className="text-center text-sm font-medium text-gray-500 mb-8">TRUSTED BY INNOVATIVE TEAMS</p>
             <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                {/* Simple text placeholders for logos for now */}
                {['OpenZeppelin', 'Oracle', 'Morpheus', 'Samsung', 'Monday.com', 'Segment'].map(brand => (
                   <span key={brand} className="text-lg font-bold font-serif text-gray-800">{brand}</span>
                ))}
             </div>
          </div>
        </div>
      </section>

      {/* Feature 1: Right Image */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-6">
         <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
               <h4 className="text-blue-600 font-bold tracking-wide text-sm uppercase mb-2">OUR FEATURE</h4>
               <h2 className="text-4xl font-bold text-gray-900 mb-6">Receive payments quickly from anywhere</h2>
               <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  Why keep your funds idle? ArcFlow leverages Uniswap V4 pools to generate yield on your operational capital until the exact moment of payroll execution.
               </p>
               <ul className="space-y-4 mb-8">
                  {['Instant settlement across 5+ chains', 'Automated tax withholding', 'Yield-bearing treasury'].map(item => (
                     <li key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                           <Check className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="text-gray-700">{item}</span>
                     </li>
                  ))}
               </ul>
               <Button className="bg-blue-600 rounded-full px-8">Get Started</Button>
            </div>
            
            <div className="relative">
               <div className="absolute inset-0 bg-blue-50 rounded-[40px] transform rotate-3"></div>
               <div className="relative bg-white rounded-3xl shadow-xl border border-gray-100 p-8 overflow-hidden transform hover:-translate-y-2 transition-transform duration-500">
                  <div className="flex justify-between items-center mb-8">
                     <div>
                        <h4 className="font-bold text-gray-900">Recent Activity</h4>
                        <p className="text-sm text-gray-500">Last 30 days</p>
                     </div>
                     <Button variant="outline" size="sm" className="rounded-full">View All</Button>
                  </div>
                  <div className="space-y-4">
                     {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 group hover:bg-blue-50 transition-colors">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-xl">
                                 {['🦄', '🟣', '🔵'][i-1]}
                              </div>
                              <div>
                                 <p className="font-medium text-gray-900">Payroll Run #{1000+i}</p>
                                 <p className="text-xs text-gray-500">Today, 2:30 PM</p>
                              </div>
                           </div>
                           <span className="font-bold text-gray-900">-$12,450.00</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-gray-900 text-white relative overflow-hidden">
         {/* Curve Divider could be SVG here */}
         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
               <div>
                  <h2 className="text-4xl font-bold mb-6">Check what our clients are saying</h2>
                  <div className="flex gap-2 text-yellow-500 mb-8">
                     {[1, 2, 3, 4, 5].map(i => <Star key={i} className="fill-current" />)}
                  </div>
                  <blockquote className="text-2xl font-light leading-relaxed mb-8">
                     &quot;Save Time Managing Social Media For Your Business. Is be upon singing for is oh old. In in so impossible appearance considered mr. Mrs him left find are good.&quot;
                  </blockquote>
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-full bg-gray-700"></div>
                     <div>
                        <p className="font-bold">Angela Taylor</p>
                        <p className="text-gray-400 text-sm">CEO Samsung</p>
                     </div>
                  </div>
               </div>
               <div className="relative">
                  <div className="bg-blue-600 rounded-3xl p-10 transform rotate-2 shadow-2xl shadow-blue-900/50">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                           💬
                        </div>
                        <h3 className="text-xl font-bold">100+ Verified Reviews</h3>
                     </div>
                     <div className="space-y-4">
                        <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                           <p className="text-sm">&quot;ArcFlow changed how we handle our global contractors. It&apos;s simply magic.&quot;</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                           <p className="text-sm">&quot;The yield integration covers our gas fees. Incredible thought.&quot;</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white relative">
         <div className="max-w-5xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Get started for free</h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
               Join hundreds of innovative companies simplifying their global payroll operations today.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-md mx-auto">
               {!isConnected && (
                 <input 
                    type="email" 
                    placeholder="Enter your email address" 
                    className="h-14 px-6 rounded-full bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                 />
               )}
               <Button 
                className="h-14 px-8 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg shadow-orange-500/20 w-full sm:w-auto"
                onClick={() => isConnected ? navigate('/dashboard') : connect()}
               >
                  {isConnected ? "Go to Dashboard" : "Get Started"}
               </Button>
            </div>
            <p className="text-sm text-gray-500 mt-6">No credit card required. Cancel anytime.</p>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-50 border-t border-gray-100">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">A</div>
               <span className="font-bold text-gray-900">ArcFlow</span>
            </div>
            <p className="text-sm text-gray-500">© 2026 ArcFlow. All rights reserved.</p>
            <div className="flex gap-6 text-gray-400">
               <a href="#" className="hover:text-blue-600 transition-colors">Twitter</a>
               <a href="#" className="hover:text-blue-600 transition-colors">LinkedIn</a>
               <a href="#" className="hover:text-blue-600 transition-colors">GitHub</a>
            </div>
         </div>
      </footer>
    </div>
  );
}
