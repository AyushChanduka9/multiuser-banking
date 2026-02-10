import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="landing-page">
            {/* Navigation */}
            <nav className="landing-nav">
                <div className="landing-nav-brand">
                    🏦 NEXUS Banking
                </div>
                <div className="landing-nav-links">
                    <button
                        className="btn-cta btn-cta-secondary"
                        style={{ padding: '0.5rem 1.2rem', fontSize: '0.9rem' }}
                        onClick={() => navigate('/login')}
                    >
                        Login
                    </button>
                </div>
            </nav>

            {/* Hero */}
            <section className="landing-hero">
                <div className="landing-logo">🏦</div>
                <h1 className="landing-title">NEXUS Banking</h1>
                <p className="landing-subtitle">
                    A priority-aware, multi-user banking system with time-locked transactions,
                    real-time WebSocket notifications, and admin-controlled processing.
                </p>
                <div className="landing-cta-group">
                    <button
                        className="btn-cta btn-cta-primary"
                        onClick={() => navigate('/login')}
                    >
                        🚀 Get Started
                    </button>
                    <button
                        className="btn-cta btn-cta-secondary"
                        onClick={() => navigate('/login?role=admin')}
                    >
                        🔐 Admin Login
                    </button>
                </div>
            </section>

            {/* Features */}
            <section className="landing-features">
                <h2>Core Features</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">⚡</div>
                        <h3>Priority Queue System</h3>
                        <p>
                            Transactions are prioritized based on urgency level
                            (Normal, EMI, Medical) and customer tier (Basic, Premium, VIP)
                            using a max-heap data structure with aging to prevent starvation.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">⏱️</div>
                        <h3>Time-Lock Mechanism</h3>
                        <p>
                            High-value transactions (₹10,000+) are automatically
                            time-locked for 30 seconds using a min-heap, giving
                            customers a cancellation window before processing.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🔔</div>
                        <h3>Real-Time Notifications</h3>
                        <p>
                            WebSocket-powered live updates keep customers and admins
                            informed about transaction status changes, queue updates,
                            and account balance modifications instantly.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🛡️</div>
                        <h3>Admin-Controlled Processing</h3>
                        <p>
                            All transactions require manual admin approval via a
                            "Process Next" workflow. Admins see the full priority queue
                            and process transactions in priority order.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🏦</div>
                        <h3>Multi-Tier Accounts</h3>
                        <p>
                            Supports Basic, Premium, and VIP customer tiers, each with
                            different priority weights and minimum reserve balance
                            requirements for fund management.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🔒</div>
                        <h3>Secure Authentication</h3>
                        <p>
                            JWT-based authentication with first-login PIN setup,
                            PIN change functionality, and role-based access control
                            separating admin and customer flows.
                        </p>
                    </div>
                </div>
            </section>

            {/* Tech Stack */}
            <section className="landing-tech">
                <h2>Built With</h2>
                <div className="tech-pills">
                    <span className="tech-pill">React</span>
                    <span className="tech-pill">TypeScript</span>
                    <span className="tech-pill">Express.js</span>
                    <span className="tech-pill">Prisma ORM</span>
                    <span className="tech-pill">PostgreSQL</span>
                    <span className="tech-pill">Redis</span>
                    <span className="tech-pill">Socket.IO</span>
                    <span className="tech-pill">JWT Auth</span>
                    <span className="tech-pill">Max-Heap</span>
                    <span className="tech-pill">Min-Heap</span>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                Nexus Banking System — DSA Lab Project
            </footer>
        </div>
    );
}
