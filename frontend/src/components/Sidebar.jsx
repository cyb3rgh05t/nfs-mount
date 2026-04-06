import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  HardDrive,
  GitMerge,
  Settings,
  FolderSync,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/nfs', label: 'NFS Mounts', icon: HardDrive },
  { to: '/mergerfs', label: 'MergerFS', icon: GitMerge },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <FolderSync className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-lg font-bold text-white">NFS Manager</h1>
            <p className="text-xs text-gray-500">MergerFS & UnionFS</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
