import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FlaskConical, CheckSquare, Database,
  GitCompare, Shield, BarChart3, FileText, Settings
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/playground', icon: FlaskConical, label: 'AI Playground' },
  { to: '/evaluations', icon: CheckSquare, label: 'Evaluation Center' },
  { to: '/datasets', icon: Database, label: 'Dataset Manager' },
  { to: '/regression', icon: GitCompare, label: 'Regression Testing' },
  { to: '/safety', icon: Shield, label: 'Safety & Red Team' },
  { to: '/compare', icon: BarChart3, label: 'Model Comparison' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-title">AI EVAL PLATFORM</div>
        <div className="logo-sub">Quality & Regression Testing</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
